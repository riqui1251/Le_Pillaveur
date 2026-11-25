import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/admin/game-vibes — la vraie route, les vrais rôles et le vrai
 * catalogue ; session, base du catalogue et journal simulés. Lecture : admin+
 * (comme les stats) ; écriture : super admin+, validée et journalisée.
 */

const { userMock, state, setVibeMock, setSoireeMock, logMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  state: {
    value: {
      hiddenIds: [] as string[],
      difficulty: {} as Record<string, number>,
      drinkLevel: {} as Record<string, number>,
      categories: [] as unknown[],
      vibes: {} as Record<string, string[]>,
      soiree: {} as Record<string, boolean>,
      featured: [] as string[],
      popular: { local: [] as string[], online: [] as string[] },
    },
  },
  setVibeMock: vi.fn(),
  setSoireeMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/supervision-overview-server', () => ({ logStaffAction: logMock }))
vi.mock('@/lib/game-catalog-server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/game-catalog-server')>()
  return {
    ...original,
    getGameCatalogState: vi.fn(async () => state.value),
    setGameVibe: setVibeMock,
    setGameInSoiree: setSoireeMock,
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { GET, PATCH } from './route'
import { GAMES } from '@/lib/games'
import { SOIREE_CANDIDATE_IDS, SOIREE_GAME_IDS } from '@/lib/soiree/catalog'
import { defaultVibesForLevel } from '@/lib/soiree/vibes'
import { VIBE_GAME_IDS } from '@/lib/game-catalog'
import { GameNotToggleableError } from '@/lib/game-catalog-server'

const [A, B] = SOIREE_GAME_IDS
const retired = GAMES.find((g) => g.hidden)!
// Un jeu du catalogue qui n'est pas candidat (en ligne uniquement) : ni ambiances ni soirée.
const outside = GAMES.find((g) => !g.hidden && g.onlineOnly)?.id
// Un candidat que le code laisse hors de la liste par défaut (Pyramide, Dégaine).
const addable = SOIREE_CANDIDATE_IDS.find((id) => !SOIREE_GAME_IDS.includes(id))!
const codeDrink = (id: string) => GAMES.find((g) => g.id === id)!.drinkLevel
const otherDrink = (id: string): 1 | 2 | 3 => (codeDrink(id) === 3 ? 1 : ((codeDrink(id) + 1) as 2 | 3))
const title = (id: string) => GAMES.find((g) => g.id === id)!.title
const emptyState = (over: Record<string, unknown> = {}) => ({
  hiddenIds: [] as string[],
  difficulty: {} as Record<string, number>,
  drinkLevel: {} as Record<string, number>,
  categories: [] as unknown[],
  vibes: {} as Record<string, string[]>,
  soiree: {} as Record<string, boolean>,
  featured: [] as string[],
  popular: { local: [] as string[], online: [] as string[] },
  ...over,
})

const patch = (body: unknown) =>
  PATCH(
    new Request('http://test/api/admin/game-vibes', {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'staff', role: 'superadmin' })
  state.value = emptyState()
  setVibeMock.mockResolvedValue({ vibes: {}, changed: true })
  logMock.mockResolvedValue(undefined)
})

describe('GET /api/admin/game-vibes', () => {
  it.each([['admin'], ['superadmin'], ['fondateur']])('%s : liste servie, tous les candidats du Mode Soirée dans l’ordre du catalogue', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['canEdit', 'games'])
    expect(body.games.map((g: { id: string }) => g.id)).toEqual([...VIBE_GAME_IDS])
    expect(body.games.map((g: { id: string }) => g.id)).toContain(addable)
    expect(body.games.map((g: { id: string }) => g.id)).not.toContain(retired.id)
    if (outside) expect(body.games.map((g: { id: string }) => g.id)).not.toContain(outside)
  })

  it.each([['moderator'], ['user'], [null]])('%s : 403 codé', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
  })

  it('canEdit : faux pour un admin, vrai pour un super admin', async () => {
    userMock.mockResolvedValue({ id: 'staff', role: 'admin' })
    expect((await (await GET()).json()).canEdit).toBe(false)
    userMock.mockResolvedValue({ id: 'staff', role: 'superadmin' })
    expect((await (await GET()).json()).canEdit).toBe(true)
  })

  it('sans réglage : vibes = defaultVibes = ambiances du niveau « fait boire » du code', async () => {
    const { games } = await (await GET()).json()
    expect(games[0]).toEqual({
      id: A,
      hidden: false,
      drinkLevel: codeDrink(A),
      vibes: defaultVibesForLevel(codeDrink(A)),
      defaultVibes: defaultVibesForLevel(codeDrink(A)),
      inSoiree: true,
      defaultInSoiree: true,
    })
  })

  it('inSoiree suit le réglage de l’équipe, defaultInSoiree la liste du code', async () => {
    state.value = emptyState({ soiree: { [addable]: true, [A]: false } })
    const { games } = await (await GET()).json()
    const row = (id: string) => games.find((g: { id: string }) => g.id === id)
    expect(row(addable)).toMatchObject({ inSoiree: true, defaultInSoiree: false })
    expect(row(A)).toMatchObject({ inSoiree: false, defaultInSoiree: true })
    expect(row(B)).toMatchObject({ inSoiree: true, defaultInSoiree: true })
  })

  it('un réglage remplace vibes seulement ; defaultVibes et le défaut suivent le niveau réglé', async () => {
    state.value = emptyState({ vibes: { [A]: ['grosse'] }, drinkLevel: { [A]: otherDrink(A), [B]: otherDrink(B) }, hiddenIds: [B] })

    const { games } = await (await GET()).json()

    const rowA = games.find((g: { id: string }) => g.id === A)
    expect(rowA.vibes).toEqual(['grosse'])
    expect(rowA.drinkLevel).toBe(otherDrink(A))
    expect(rowA.defaultVibes).toEqual(defaultVibesForLevel(otherDrink(A)))
    const rowB = games.find((g: { id: string }) => g.id === B)
    expect(rowB.hidden).toBe(true)
    expect(rowB.vibes).toEqual(defaultVibesForLevel(otherDrink(B)))
  })

  it('une liste vide est servie telle quelle', async () => {
    state.value = emptyState({ vibes: { [A]: [] } })
    const { games } = await (await GET()).json()
    expect(games.find((g: { id: string }) => g.id === A).vibes).toEqual([])
  })
})

describe('PATCH /api/admin/game-vibes', () => {
  it.each([['admin'], ['moderator'], ['user'], [null]])('%s : 403 sans rien écrire', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
    const res = await patch({ gameId: A, vibe: 'apero', on: true })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
    expect(setVibeMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each([['superadmin'], ['fondateur']])('%s : coche une ambiance, journalisé, réponse = forme du GET', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })
    state.value = emptyState({ vibes: { [A]: ['apero', 'monte', 'grosse'] } })

    const res = await patch({ gameId: A, vibe: 'grosse', on: true })

    expect(res.status).toBe(200)
    expect(setVibeMock).toHaveBeenCalledWith(A, 'grosse', true)
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith({
      actorId: 'staff',
      action: 'site-setting',
      detail: `Ambiance Grosse soirée : ${title(A)} ajouté`,
    })
    const body = await res.json()
    expect(body.canEdit).toBe(true)
    expect(Object.keys(body).sort()).toEqual(['canEdit', 'games'])
    expect(body.games.find((g: { id: string }) => g.id === A).vibes).toEqual(['apero', 'monte', 'grosse'])
  })

  it('décocher est journalisé « retiré », avec le libellé de chaque ambiance', async () => {
    const labels = { apero: 'Apéro tranquille', monte: 'Ça monte', grosse: 'Grosse soirée' } as const
    for (const vibe of ['apero', 'monte', 'grosse'] as const) {
      logMock.mockClear()
      const res = await patch({ gameId: B, vibe, on: false })
      expect(res.status).toBe(200)
      expect(setVibeMock).toHaveBeenLastCalledWith(B, vibe, false)
      expect(logMock.mock.calls[0][0].detail).toBe(`Ambiance ${labels[vibe]} : ${title(B)} retiré`)
    }
  })

  it('ne journalise rien quand le réglage n’a pas changé', async () => {
    setVibeMock.mockResolvedValue({ vibes: {}, changed: false })
    const res = await patch({ gameId: A, vibe: 'apero', on: true })
    expect(res.status).toBe(200)
    expect(setVibeMock).toHaveBeenCalledTimes(1)
    expect(logMock).not.toHaveBeenCalled()
  })

  describe('ajouter ou sortir un jeu de la soirée', () => {
    it.each([['superadmin'], ['fondateur']])('%s : { gameId, inSoiree } appelle setGameInSoiree, journalisé, réponse = forme du GET', async (role) => {
      userMock.mockResolvedValue({ id: 'staff', role })
      setSoireeMock.mockResolvedValue({ soiree: { [addable]: true }, changed: true })
      state.value = emptyState({ soiree: { [addable]: true } })

      const res = await patch({ gameId: addable, inSoiree: true })

      expect(res.status).toBe(200)
      expect(setSoireeMock).toHaveBeenCalledWith(addable, true)
      expect(setVibeMock).not.toHaveBeenCalled()
      expect(logMock).toHaveBeenCalledTimes(1)
      expect(logMock).toHaveBeenCalledWith({ actorId: 'staff', action: 'site-setting', detail: `Mode Soirée : ${title(addable)} ajouté` })
      const body = await res.json()
      expect(Object.keys(body).sort()).toEqual(['canEdit', 'games'])
      expect(body.games.find((g: { id: string }) => g.id === addable).inSoiree).toBe(true)
    })

    it('sortir est journalisé « retiré »', async () => {
      setSoireeMock.mockResolvedValue({ soiree: { [A]: false }, changed: true })
      const res = await patch({ gameId: A, inSoiree: false })
      expect(res.status).toBe(200)
      expect(setSoireeMock).toHaveBeenCalledWith(A, false)
      expect(logMock.mock.calls[0][0].detail).toBe(`Mode Soirée : ${title(A)} retiré`)
    })

    it('ne journalise rien quand rien n’a changé', async () => {
      setSoireeMock.mockResolvedValue({ soiree: {}, changed: false })
      const res = await patch({ gameId: A, inSoiree: true })
      expect(res.status).toBe(200)
      expect(setSoireeMock).toHaveBeenCalledTimes(1)
      expect(logMock).not.toHaveBeenCalled()
    })

    it('exactement une forme : mélange, inSoiree non booléen, jeu hors candidats = invalid_action 400', async () => {
      const bodies: unknown[] = [
        { gameId: A, inSoiree: true, vibe: 'apero', on: true },
        { gameId: A, inSoiree: true, on: true },
        { gameId: A, inSoiree: true, vibe: 'apero' },
        { gameId: A, inSoiree: 'true' },
        { gameId: A, inSoiree: 1 },
        { gameId: A, inSoiree: null },
        { inSoiree: true },
        { gameId: 'jeu-inexistant', inSoiree: true },
        { gameId: retired.id, inSoiree: true },
        ...(outside ? [{ gameId: outside, inSoiree: true }] : []),
        { gameId: A },
      ]
      for (const body of bodies) {
        const res = await patch(body)
        expect(res.status, JSON.stringify(body)).toBe(400)
        expect((await res.json()).error, JSON.stringify(body)).toBe('invalid_action')
      }
      expect(setSoireeMock).not.toHaveBeenCalled()
      expect(setVibeMock).not.toHaveBeenCalled()
      expect(logMock).not.toHaveBeenCalled()
    })

    it('rôles : admin et moderator refusés sans rien écrire', async () => {
      for (const role of ['admin', 'moderator']) {
        userMock.mockResolvedValue({ id: 'staff', role })
        expect((await patch({ gameId: A, inSoiree: true })).status).toBe(403)
      }
      expect(setSoireeMock).not.toHaveBeenCalled()
    })

    it('une erreur typée devient invalid_action, une panne server_error', async () => {
      setSoireeMock.mockRejectedValue(new GameNotToggleableError(A))
      const res = await patch({ gameId: A, inSoiree: true })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')

      vi.spyOn(console, 'error').mockImplementation(() => {})
      setSoireeMock.mockRejectedValue(new Error('locked'))
      expect((await patch({ gameId: A, inSoiree: true })).status).toBe(500)
      expect(logMock).not.toHaveBeenCalled()
    })
  })

  it('corps invalide, jeu ou ambiance inconnus : invalid_action 400 sans rien écrire', async () => {
    const bodies: unknown[] = [
      { gameId: A, vibe: 'apero' },
      { gameId: A, on: true },
      { vibe: 'apero', on: true },
      { gameId: A, vibe: 'apero', on: 'true' },
      { gameId: A, vibe: 'apero', on: 1 },
      { gameId: A, vibe: 'soiree', on: true },
      { gameId: A, vibe: null, on: true },
      { gameId: 'jeu-inexistant', vibe: 'apero', on: true },
      { gameId: retired.id, vibe: 'apero', on: true },
      { gameId: 42, vibe: 'apero', on: true },
      ...(outside ? [{ gameId: outside, vibe: 'apero', on: true }] : []),
      [],
      null,
    ]
    for (const body of bodies) {
      const res = await patch(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((await res.json()).error, JSON.stringify(body)).toBe('invalid_action')
    }
    expect(setVibeMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('JSON illisible : invalid_json 400 ; corps trop gros : payload_too_large 413', async () => {
    const bad = await patch('{pas du json')
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe('invalid_json')

    const big = await patch({ gameId: A, vibe: 'apero', on: true, filler: 'x'.repeat(5000) })
    expect(big.status).toBe(413)
    expect((await big.json()).error).toBe('payload_too_large')
    expect(setVibeMock).not.toHaveBeenCalled()
  })

  it('une erreur typée du serveur devient invalid_action, une panne d’écriture server_error', async () => {
    setVibeMock.mockRejectedValue(new GameNotToggleableError(A))
    const res = await patch({ gameId: A, vibe: 'apero', on: true })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_action')

    vi.spyOn(console, 'error').mockImplementation(() => {})
    setVibeMock.mockRejectedValue(new Error('locked'))
    const down = await patch({ gameId: A, vibe: 'apero', on: true })
    expect(down.status).toBe(500)
    expect(logMock).not.toHaveBeenCalled()
  })
})
