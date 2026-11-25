import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/admin/game-catalog — la vraie route, les vrais rôles et le vrai
 * catalogue ; session, base du catalogue et journal simulés. Lecture : admin+
 * (comme les stats) ; écriture : super admin+, validée et journalisée.
 */

const { userMock, state, counts, setHiddenMock, setDifficultyMock, setDrinkLevelMock, setFeaturedMock, logMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  state: {
    value: {
      hiddenIds: [] as string[],
      difficulty: {} as Record<string, number>,
      drinkLevel: {} as Record<string, number>,
      categories: [] as unknown[],
      soiree: {} as Record<string, boolean>,
      featured: [] as string[],
      popular: { local: [] as string[], online: [] as string[] },
    },
  },
  counts: { value: {} as Record<string, { online: number; local: number }> },
  setHiddenMock: vi.fn(),
  setDifficultyMock: vi.fn(),
  setDrinkLevelMock: vi.fn(),
  setFeaturedMock: vi.fn(),
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
    setGameDifficulty: setDifficultyMock,
    setGameDrinkLevel: setDrinkLevelMock,
    setGameFeatured: setFeaturedMock,
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { GET, PATCH } from './route'
import { GAMES } from '@/lib/games'
import { POPULAR_LIMIT, STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'
import { GameFeaturedLimitError, GameNotToggleableError } from '@/lib/game-catalog-server'

const [A, B, C] = STAFF_TOGGLEABLE_GAME_IDS
const retired = GAMES.find((g) => g.hidden)!
const codeLevel = (id: string) => GAMES.find((g) => g.id === id)!.difficulty
const otherLevel = (id: string): 1 | 2 | 3 => (codeLevel(id) === 3 ? 1 : ((codeLevel(id) + 1) as 2 | 3))
const codeDrink = (id: string) => GAMES.find((g) => g.id === id)!.drinkLevel
const otherDrink = (id: string): 1 | 2 | 3 => (codeDrink(id) === 3 ? 1 : ((codeDrink(id) + 1) as 2 | 3))
const LABELS = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' } as const
const DRINK_LABELS = { 1: 'Peu', 2: 'Moyen', 3: 'Beaucoup' } as const
const emptyState = (over: Record<string, unknown> = {}) => ({
  hiddenIds: [] as string[],
  difficulty: {} as Record<string, number>,
  drinkLevel: {} as Record<string, number>,
  categories: [] as unknown[],
  soiree: {} as Record<string, boolean>,
  featured: [] as string[],
  popular: { local: [] as string[], online: [] as string[] },
  ...over,
})

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
  state.value = emptyState()
  counts.value = {}
  setHiddenMock.mockResolvedValue({ hiddenIds: [A], changed: true })
  setDifficultyMock.mockResolvedValue({ difficulty: {}, changed: true })
  setDrinkLevelMock.mockResolvedValue({ drinkLevel: {}, changed: true })
  setFeaturedMock.mockResolvedValue({ featured: [A], changed: true })
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

  it('difficulty est la valeur effective, defaultDifficulty celle du code', async () => {
    state.value = emptyState({ difficulty: { [A]: otherLevel(A) } })

    const { games } = await (await GET()).json()

    const rowA = games.find((g: { id: string }) => g.id === A)
    expect(rowA.difficulty).toBe(otherLevel(A))
    expect(rowA.defaultDifficulty).toBe(codeLevel(A))
    const rowB = games.find((g: { id: string }) => g.id === B)
    expect(rowB.difficulty).toBe(codeLevel(B))
    expect(rowB.defaultDifficulty).toBe(codeLevel(B))
  })

  it('drinkLevel est la valeur effective, defaultDrinkLevel celle du code', async () => {
    state.value = emptyState({ drinkLevel: { [A]: otherDrink(A) } })

    const { games } = await (await GET()).json()

    const rowA = games.find((g: { id: string }) => g.id === A)
    expect(rowA.drinkLevel).toBe(otherDrink(A))
    expect(rowA.defaultDrinkLevel).toBe(codeDrink(A))
    const rowB = games.find((g: { id: string }) => g.id === B)
    expect(rowB.drinkLevel).toBe(codeDrink(B))
    expect(rowB.defaultDrinkLevel).toBe(codeDrink(B))
  })

  it('featured : vrai pour les jeux mis à la une par l’équipe, faux pour les autres', async () => {
    state.value = emptyState({ featured: [B] })
    const { games } = await (await GET()).json()
    expect(games.find((g: { id: string }) => g.id === B).featured).toBe(true)
    expect(games.find((g: { id: string }) => g.id === A).featured).toBe(false)
  })

  it('featuredRank : le rang dans l’ordre de mise à la une, null ailleurs', async () => {
    state.value = emptyState({ featured: [C, A] })
    const { games } = await (await GET()).json()
    const rankOf = (id: string) => games.find((g: { id: string }) => g.id === id).featuredRank
    expect(rankOf(C)).toBe(1)
    expect(rankOf(A)).toBe(2)
    expect(rankOf(B)).toBeNull()
  })

  it('le rang « plus joués » suit la rangée affichée : sans les jeux à la une, jamais au-delà de POPULAR_LIMIT', async () => {
    const ranked = STAFF_TOGGLEABLE_GAME_IDS.slice(0, POPULAR_LIMIT + 3)
    const featured = [ranked[0], ranked[1]]
    state.value = emptyState({ featured, popular: { local: ranked, online: ranked } })
    const { games } = await (await GET()).json()
    const byId = (id: string) => games.find((g: { id: string }) => g.id === id)
    expect(byId(ranked[0]).popularLocalRank).toBeNull()
    expect(byId(ranked[1]).popularOnlineRank).toBeNull()
    expect(byId(ranked[2]).popularLocalRank).toBe(1)
    expect(byId(ranked[POPULAR_LIMIT + 1]).popularLocalRank).toBe(POPULAR_LIMIT)
    expect(byId(ranked[POPULAR_LIMIT + 2]).popularLocalRank).toBeNull()
    const ranks = games.flatMap((g: { popularLocalRank: number | null }) => (g.popularLocalRank === null ? [] : [g.popularLocalRank]))
    expect(Math.max(...ranks)).toBeLessThanOrEqual(POPULAR_LIMIT)
  })

  it('retiredCount compte les jeux retirés du code, qui ne sont pas listés', async () => {
    const body = await (await GET()).json()
    expect(body.retiredCount).toBe(GAMES.filter((g) => g.hidden).length)
    expect(body.retiredCount).toBeGreaterThan(0)
    expect(body.games.map((g: { id: string }) => g.id)).not.toContain(retired.id)
  })

  it('trie par parties décroissantes puis ordre du catalogue, avec parties et rangs', async () => {
    counts.value = { [C]: { online: 7, local: 3 }, [B]: { online: 0, local: 4 } }
    state.value = emptyState({ hiddenIds: [B], popular: { local: [C, A], online: [C] } })

    const { games } = await (await GET()).json()

    expect(games[0]).toEqual({
      id: C,
      hidden: false,
      difficulty: codeLevel(C),
      defaultDifficulty: codeLevel(C),
      drinkLevel: codeDrink(C),
      defaultDrinkLevel: codeDrink(C),
      featured: false,
      featuredRank: null,
      plays: { online: 7, local: 3, total: 10 },
      popularLocalRank: 1,
      popularOnlineRank: 1,
    })
    expect(games[1]).toEqual({
      id: B,
      hidden: true,
      difficulty: codeLevel(B),
      defaultDifficulty: codeLevel(B),
      drinkLevel: codeDrink(B),
      defaultDrinkLevel: codeDrink(B),
      featured: false,
      featuredRank: null,
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
    state.value = emptyState({ hiddenIds: [A] })

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

  describe('réglage de la difficulté', () => {
    it.each([['admin'], ['moderator'], ['user'], [null]])('%s : 403 sans rien écrire', async (role) => {
      userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
      const res = await patch({ gameId: A, difficulty: 3 })
      expect(res.status).toBe(403)
      expect(setDifficultyMock).not.toHaveBeenCalled()
      expect(logMock).not.toHaveBeenCalled()
    })

    it.each([['superadmin'], ['fondateur']])('%s : règle la difficulté, journalisée, réponse = forme du GET', async (role) => {
      userMock.mockResolvedValue({ id: 'staff', role })
      const level = otherLevel(A)
      state.value = emptyState({ difficulty: { [A]: level } })

      const res = await patch({ gameId: A, difficulty: level })

      expect(res.status).toBe(200)
      expect(setDifficultyMock).toHaveBeenCalledWith(A, level)
      expect(setHiddenMock).not.toHaveBeenCalled()
      expect(logMock).toHaveBeenCalledTimes(1)
      expect(logMock).toHaveBeenCalledWith({
        actorId: 'staff',
        action: 'site-setting',
        detail: `Difficulté : ${GAMES.find((g) => g.id === A)!.title} → ${LABELS[level]}`,
      })
      const body = await res.json()
      expect(body.games.find((g: { id: string }) => g.id === A).difficulty).toBe(level)
      expect(Object.keys(body).sort()).toEqual(['canEdit', 'games', 'retiredCount'])
    })

    it('les trois niveaux sont acceptés avec leur libellé', async () => {
      for (const level of [1, 2, 3] as const) {
        logMock.mockClear()
        const res = await patch({ gameId: B, difficulty: level })
        expect(res.status).toBe(200)
        expect(logMock.mock.calls[0][0].detail).toBe(`Difficulté : ${GAMES.find((g) => g.id === B)!.title} → ${LABELS[level]}`)
      }
    })

    it('ne journalise rien quand rien n’a changé', async () => {
      setDifficultyMock.mockResolvedValue({ difficulty: {}, changed: false })
      const res = await patch({ gameId: A, difficulty: codeLevel(A) })
      expect(res.status).toBe(200)
      expect(logMock).not.toHaveBeenCalled()
    })

    it('plusieurs clés ensemble, ou aucune : invalid_action 400', async () => {
      const bodies = [
        { gameId: A, hidden: true, difficulty: 2 },
        { gameId: A, hidden: true, drinkLevel: 2 },
        { gameId: A, difficulty: 2, drinkLevel: 2 },
        { gameId: A, hidden: true, difficulty: 2, drinkLevel: 2 },
        { gameId: A },
      ]
      for (const body of bodies) {
        const res = await patch(body)
        expect(res.status, JSON.stringify(body)).toBe(400)
        expect((await res.json()).error).toBe('invalid_action')
      }
      expect(setDifficultyMock).not.toHaveBeenCalled()
      expect(setDrinkLevelMock).not.toHaveBeenCalled()
      expect(setHiddenMock).not.toHaveBeenCalled()
      expect(logMock).not.toHaveBeenCalled()
    })

    it('niveau invalide ou jeu non réglable : invalid_action 400', async () => {
      const bodies = [
        { gameId: A, difficulty: 0 },
        { gameId: A, difficulty: 4 },
        { gameId: A, difficulty: 1.5 },
        { gameId: A, difficulty: '2' },
        { gameId: A, difficulty: null },
        { gameId: 'jeu-inexistant', difficulty: 2 },
        { gameId: retired.id, difficulty: 2 },
        { difficulty: 2 },
      ]
      for (const body of bodies) {
        const res = await patch(body)
        expect(res.status, JSON.stringify(body)).toBe(400)
        expect((await res.json()).error).toBe('invalid_action')
      }
      expect(setDifficultyMock).not.toHaveBeenCalled()
      expect(logMock).not.toHaveBeenCalled()
    })

    it('une erreur typée du serveur devient invalid_action, une panne d’écriture server_error', async () => {
      setDifficultyMock.mockRejectedValue(new GameNotToggleableError(A))
      const res = await patch({ gameId: A, difficulty: 3 })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')

      vi.spyOn(console, 'error').mockImplementation(() => {})
      setDifficultyMock.mockRejectedValue(new Error('locked'))
      const down = await patch({ gameId: A, difficulty: 3 })
      expect(down.status).toBe(500)
      expect(logMock).not.toHaveBeenCalled()
    })
  })

  describe('réglage du niveau « fait boire »', () => {
    it.each([['admin'], ['moderator'], ['user'], [null]])('%s : 403 sans rien écrire', async (role) => {
      userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
      const res = await patch({ gameId: A, drinkLevel: 3 })
      expect(res.status).toBe(403)
      expect(setDrinkLevelMock).not.toHaveBeenCalled()
      expect(logMock).not.toHaveBeenCalled()
    })

    it.each([['superadmin'], ['fondateur']])('%s : règle le niveau, journalisé, réponse = forme du GET', async (role) => {
      userMock.mockResolvedValue({ id: 'staff', role })
      const level = otherDrink(A)
      state.value = emptyState({ drinkLevel: { [A]: level } })

      const res = await patch({ gameId: A, drinkLevel: level })

      expect(res.status).toBe(200)
      expect(setDrinkLevelMock).toHaveBeenCalledWith(A, level)
      expect(setHiddenMock).not.toHaveBeenCalled()
      expect(setDifficultyMock).not.toHaveBeenCalled()
      expect(logMock).toHaveBeenCalledTimes(1)
      expect(logMock).toHaveBeenCalledWith({
        actorId: 'staff',
        action: 'site-setting',
        detail: `Fait boire : ${GAMES.find((g) => g.id === A)!.title} → ${DRINK_LABELS[level]}`,
      })
      const body = await res.json()
      expect(body.games.find((g: { id: string }) => g.id === A).drinkLevel).toBe(level)
      expect(Object.keys(body).sort()).toEqual(['canEdit', 'games', 'retiredCount'])
    })

    it('les trois niveaux sont acceptés avec leur libellé (Peu, Moyen, Beaucoup)', async () => {
      for (const level of [1, 2, 3] as const) {
        logMock.mockClear()
        const res = await patch({ gameId: B, drinkLevel: level })
        expect(res.status).toBe(200)
        expect(logMock.mock.calls[0][0].detail).toBe(`Fait boire : ${GAMES.find((g) => g.id === B)!.title} → ${DRINK_LABELS[level]}`)
      }
    })

    it('ne journalise rien quand rien n’a changé', async () => {
      setDrinkLevelMock.mockResolvedValue({ drinkLevel: {}, changed: false })
      const res = await patch({ gameId: A, drinkLevel: codeDrink(A) })
      expect(res.status).toBe(200)
      expect(logMock).not.toHaveBeenCalled()
    })

    it('niveau invalide ou jeu non réglable : invalid_action 400', async () => {
      const bodies = [
        { gameId: A, drinkLevel: 0 },
        { gameId: A, drinkLevel: 4 },
        { gameId: A, drinkLevel: 1.5 },
        { gameId: A, drinkLevel: '2' },
        { gameId: A, drinkLevel: null },
        { gameId: 'jeu-inexistant', drinkLevel: 2 },
        { gameId: retired.id, drinkLevel: 2 },
        { drinkLevel: 2 },
      ]
      for (const body of bodies) {
        const res = await patch(body)
        expect(res.status, JSON.stringify(body)).toBe(400)
        expect((await res.json()).error).toBe('invalid_action')
      }
      expect(setDrinkLevelMock).not.toHaveBeenCalled()
      expect(logMock).not.toHaveBeenCalled()
    })

    it('une erreur typée du serveur devient invalid_action, une panne d’écriture server_error', async () => {
      setDrinkLevelMock.mockRejectedValue(new GameNotToggleableError(A))
      const res = await patch({ gameId: A, drinkLevel: 3 })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')

      vi.spyOn(console, 'error').mockImplementation(() => {})
      setDrinkLevelMock.mockRejectedValue(new Error('locked'))
      const down = await patch({ gameId: A, drinkLevel: 3 })
      expect(down.status).toBe(500)
      expect(logMock).not.toHaveBeenCalled()
    })
  })

  describe('mise à la une', () => {
    const titleOf = (id: string) => GAMES.find((g) => g.id === id)!.title

    it.each([['superadmin'], ['fondateur']])('%s : { gameId, featured } appelle setGameFeatured, journalisé, réponse = forme du GET', async (role) => {
      userMock.mockResolvedValue({ id: 'staff', role })
      state.value = emptyState({ featured: [A] })

      const res = await patch({ gameId: A, featured: true })

      expect(res.status).toBe(200)
      expect(setFeaturedMock).toHaveBeenCalledWith(A, true)
      expect(setHiddenMock).not.toHaveBeenCalled()
      expect(setDifficultyMock).not.toHaveBeenCalled()
      expect(setDrinkLevelMock).not.toHaveBeenCalled()
      expect(logMock).toHaveBeenCalledTimes(1)
      expect(logMock).toHaveBeenCalledWith({ actorId: 'staff', action: 'site-setting', detail: `À la une : ${titleOf(A)} ajouté` })
      const body = await res.json()
      expect(body.games.find((g: { id: string }) => g.id === A).featured).toBe(true)
      expect(Object.keys(body).sort()).toEqual(['canEdit', 'games', 'retiredCount'])
    })

    it('retirer est journalisé « retiré »', async () => {
      const res = await patch({ gameId: B, featured: false })
      expect(res.status).toBe(200)
      expect(setFeaturedMock).toHaveBeenCalledWith(B, false)
      expect(logMock.mock.calls[0][0].detail).toBe(`À la une : ${titleOf(B)} retiré`)
    })

    it('ne journalise rien quand rien n’a changé', async () => {
      setFeaturedMock.mockResolvedValue({ featured: [A], changed: false })
      expect((await patch({ gameId: A, featured: true })).status).toBe(200)
      expect(logMock).not.toHaveBeenCalled()
    })

    it('limite atteinte : 409 conflict, rien n’est journalisé', async () => {
      setFeaturedMock.mockRejectedValue(new GameFeaturedLimitError())
      const res = await patch({ gameId: C, featured: true })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('conflict')
      expect(logMock).not.toHaveBeenCalled()
    })

    it('exactement une clé parmi hidden, difficulty, drinkLevel et featured ; featured booléen', async () => {
      const bodies = [
        { gameId: A, featured: true, hidden: false },
        { gameId: A, featured: true, difficulty: 2 },
        { gameId: A, featured: true, drinkLevel: 2 },
        { gameId: A, featured: 'true' },
        { gameId: A, featured: 1 },
        { gameId: A, featured: null },
        { featured: true },
        { gameId: 'jeu-inexistant', featured: true },
        { gameId: retired.id, featured: true },
      ]
      for (const body of bodies) {
        const res = await patch(body)
        expect(res.status, JSON.stringify(body)).toBe(400)
        expect((await res.json()).error).toBe('invalid_action')
      }
      expect(setFeaturedMock).not.toHaveBeenCalled()
      expect(setHiddenMock).not.toHaveBeenCalled()
      expect(logMock).not.toHaveBeenCalled()
    })

    it('admin : 403 sans rien écrire ; erreur typée = invalid_action ; panne = 500', async () => {
      userMock.mockResolvedValue({ id: 'staff', role: 'admin' })
      expect((await patch({ gameId: A, featured: true })).status).toBe(403)
      expect(setFeaturedMock).not.toHaveBeenCalled()

      userMock.mockResolvedValue({ id: 'staff', role: 'superadmin' })
      setFeaturedMock.mockRejectedValue(new GameNotToggleableError(A))
      expect((await patch({ gameId: A, featured: true })).status).toBe(400)

      vi.spyOn(console, 'error').mockImplementation(() => {})
      setFeaturedMock.mockRejectedValue(new Error('locked'))
      expect((await patch({ gameId: A, featured: true })).status).toBe(500)
      expect(logMock).not.toHaveBeenCalled()
    })
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
