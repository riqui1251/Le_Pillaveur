import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/admin/game-catalog — la vraie route, les vrais rôles et le vrai
 * catalogue ; session, base du catalogue et journal simulés. Lecture : admin+
 * (comme les stats) ; écriture : super admin+, validée et journalisée.
 */

const { userMock, state, counts, setHiddenMock, logMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  state: { value: { hiddenIds: [] as string[], popular: { local: [] as string[], online: [] as string[] } } },
  counts: { value: {} as Record<string, { online: number; local: number }> },
  setHiddenMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/supervision-overview-server', () => ({ logStaffAction: logMock }))
vi.mock('@/lib/game-catalog-server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/game-catalog-server')>()
  return {
    ...original,
    getGameCatalogState: vi.fn(async () => state.value),
    getGamePlayCounts30d: vi.fn(async () => counts.value),
    setGameHidden: setHiddenMock,
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { GET, PATCH } from './route'
import { GAMES } from '@/lib/games'
import { STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'
import { GameNotToggleableError } from '@/lib/game-catalog-server'

const [A, B, C] = STAFF_TOGGLEABLE_GAME_IDS
const retired = GAMES.find((g) => g.hidden)!

const patch = (body: unknown) =>
  PATCH(
    new Request('http://test/api/admin/game-catalog', {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'staff', role: 'superadmin' })
  state.value = { hiddenIds: [], popular: { local: [], online: [] } }
  counts.value = {}
  setHiddenMock.mockResolvedValue({ hiddenIds: [A], changed: true })
  logMock.mockResolvedValue(undefined)
})

describe('GET /api/admin/game-catalog', () => {
  it.each([['admin'], ['superadmin'], ['fondateur']])('%s : liste servie', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.games.map((g: { id: string }) => g.id).sort()).toEqual([...STAFF_TOGGLEABLE_GAME_IDS].sort())
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

  it('retiredCount compte les jeux retirés du code, qui ne sont pas listés', async () => {
    const body = await (await GET()).json()
    expect(body.retiredCount).toBe(GAMES.filter((g) => g.hidden).length)
    expect(body.retiredCount).toBeGreaterThan(0)
    expect(body.games.map((g: { id: string }) => g.id)).not.toContain(retired.id)
  })

  it('trie par parties décroissantes puis ordre du catalogue, avec parties et rangs', async () => {
    counts.value = { [C]: { online: 7, local: 3 }, [B]: { online: 0, local: 4 } }
    state.value = { hiddenIds: [B], popular: { local: [C, A], online: [C] } }

    const { games } = await (await GET()).json()

    expect(games[0]).toEqual({
      id: C,
      hidden: false,
      plays: { online: 7, local: 3, total: 10 },
      popularLocalRank: 1,
      popularOnlineRank: 1,
    })
    expect(games[1]).toEqual({
      id: B,
      hidden: true,
      plays: { online: 0, local: 4, total: 4 },
      popularLocalRank: null,
      popularOnlineRank: null,
    })
    // Sans partie : l'ordre du catalogue, A (rang local 2) en tête des égalités à zéro.
    expect(games[2].id).toBe(A)
    expect(games[2].popularLocalRank).toBe(2)
    expect(games[2].plays).toEqual({ online: 0, local: 0, total: 0 })
    const rest = games.slice(2).map((g: { id: string }) => g.id)
    expect(rest).toEqual(STAFF_TOGGLEABLE_GAME_IDS.filter((id) => id !== B && id !== C))
  })
})

describe('PATCH /api/admin/game-catalog', () => {
  it.each([['admin'], ['moderator'], ['user'], [null]])('%s : 403 sans rien écrire', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
    const res = await patch({ gameId: A, hidden: true })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
    expect(setHiddenMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each([['superadmin'], ['fondateur']])('%s : cache le jeu, journalisé, réponse = forme du GET', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })
    state.value = { hiddenIds: [A], popular: { local: [], online: [] } }

    const res = await patch({ gameId: A, hidden: true })

    expect(res.status).toBe(200)
    expect(setHiddenMock).toHaveBeenCalledWith(A, true)
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith({
      actorId: 'staff',
      action: 'site-setting',
      detail: `Jeu caché : ${GAMES.find((g) => g.id === A)!.title}`,
    })
    const body = await res.json()
    expect(body.canEdit).toBe(true)
    expect(body.games.find((g: { id: string }) => g.id === A).hidden).toBe(true)
    expect(Object.keys(body).sort()).toEqual(['canEdit', 'games', 'retiredCount'])
  })

  it('remettre un jeu est journalisé « Jeu remis »', async () => {
    setHiddenMock.mockResolvedValue({ hiddenIds: [], changed: true })
    await patch({ gameId: B, hidden: false })
    expect(logMock.mock.calls[0][0].detail).toBe(`Jeu remis : ${GAMES.find((g) => g.id === B)!.title}`)
  })

  it('ne journalise rien quand le réglage n’a pas changé', async () => {
    setHiddenMock.mockResolvedValue({ hiddenIds: [A], changed: false })
    const res = await patch({ gameId: A, hidden: true })
    expect(res.status).toBe(200)
    expect(logMock).not.toHaveBeenCalled()
  })

  it('refuse un corps mal formé ou un jeu non cachable : invalid_action 400', async () => {
    const bodies = [
      {},
      { gameId: A },
      { hidden: true },
      { gameId: A, hidden: 'true' },
      { gameId: 7, hidden: true },
      { gameId: 'jeu-inexistant', hidden: true },
      { gameId: retired.id, hidden: true },
      null,
      [],
    ]
    for (const body of bodies) {
      const res = await patch(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')
    }
    expect(setHiddenMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('JSON illisible : invalid_json 400 ; corps trop gros : payload_too_large 413', async () => {
    const bad = await patch('{pas du json')
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe('invalid_json')

    const big = await patch(JSON.stringify({ gameId: A, hidden: true, pad: 'x'.repeat(5000) }))
    expect(big.status).toBe(413)
    expect((await big.json()).error).toBe('payload_too_large')
    expect(setHiddenMock).not.toHaveBeenCalled()
  })

  it('une erreur typée du serveur de catalogue devient invalid_action', async () => {
    setHiddenMock.mockRejectedValue(new GameNotToggleableError(A))
    const res = await patch({ gameId: A, hidden: true })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_action')
  })

  it('une panne d’écriture sort en server_error 500 JSON', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setHiddenMock.mockRejectedValue(new Error('locked'))
    const res = await patch({ gameId: A, hidden: true })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('server_error')
    expect(logMock).not.toHaveBeenCalled()
  })
})
