import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    onlineGameSession: { groupBy: vi.fn() },
    localGameDaily: { groupBy: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  CATALOG_STATE_TTL_MS,
  DIFFICULTY_SETTING_KEY,
  DRINK_LEVEL_SETTING_KEY,
  FEATURED_SETTING_KEY,
  GAME_CATEGORIES_SETTING_KEY,
  GameCategoryInvalidError,
  GameFeaturedLimitError,
  GameCategoryLimitError,
  GameCategoryNotFoundError,
  GameNotToggleableError,
  HIDDEN_GAMES_SETTING_KEY,
  HIDDEN_IDS_TTL_MS,
  PLAY_COUNTS_TTL_MS,
  SOIREE_SETTING_KEY,
  VIBES_SETTING_KEY,
  createGameCategory,
  deleteGameCategory,
  getGameCatalogState,
  getGameCategories,
  getGamePlayCounts30d,
  getStaffGameDifficulty,
  getStaffGameDrinkLevel,
  getStaffFeaturedGameIds,
  getStaffGameVibes,
  getStaffHiddenGameIds,
  getStaffSoireeGames,
  invalidateGameCatalogCaches,
  isGameHiddenByStaff,
  moveGameCategory,
  setGameDifficulty,
  setGameDrinkLevel,
  setGameFeatured,
  setGameHidden,
  setGameInCategory,
  setGameInSoiree,
  setGameVibe,
  updateGameCategory,
} from './game-catalog-server'
import {
  EMPTY_GAME_CATALOG,
  FEATURED_LIMIT,
  GAME_CATEGORY_LIMITS,
  POPULAR_LIMIT,
  POPULAR_RANKED_LIMIT,
  STAFF_TOGGLEABLE_GAME_IDS,
} from './game-catalog'
import { GAMES } from './games'
import { SOIREE_CANDIDATE_IDS, SOIREE_GAME_IDS } from './soiree/catalog'
import { defaultVibesForLevel } from './soiree/vibes'

const [A, B, C] = STAFF_TOGGLEABLE_GAME_IDS
const retired = GAMES.find((g) => g.hidden)!.id
// Trois jeux du Mode Soirée dont le niveau « fait boire » du code est Peu, Moyen puis Beaucoup.
const V1 = 'purple'
const V2 = 'pmu'
const V3 = 'coupe-du-roi'
const codeLevel = (id: string) => GAMES.find((g) => g.id === id)!.difficulty
const otherLevel = (id: string): 1 | 2 | 3 => (codeLevel(id) === 3 ? 1 : ((codeLevel(id) + 1) as 2 | 3))
const codeDrink = (id: string) => GAMES.find((g) => g.id === id)!.drinkLevel
const otherDrink = (id: string): 1 | 2 | 3 => (codeDrink(id) === 3 ? 1 : ((codeDrink(id) + 1) as 2 | 3))
const lastLevel = (id: string): 1 | 2 | 3 => ([1, 2, 3] as const).find((l) => l !== codeLevel(id) && l !== otherLevel(id))!

/** Une base où chaque clé de SiteSetting a sa valeur : difficulté et jeux cachés ne se mélangent pas. */
function storeSettings(initial: Record<string, string> = {}) {
  const rows = new Map(Object.entries(initial))
  prismaMock.siteSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
    rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null
  )
  prismaMock.siteSetting.upsert.mockImplementation(async (args: { where: { key: string }; update: { value: string } }) => {
    rows.set(args.where.key, args.update.value)
    return {}
  })
  return rows
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'))
  vi.resetAllMocks()
  invalidateGameCatalogCaches({ forget: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  prismaMock.siteSetting.findUnique.mockResolvedValue(null)
  prismaMock.onlineGameSession.groupBy.mockResolvedValue([])
  prismaMock.localGameDaily.groupBy.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getStaffHiddenGameIds', () => {
  it('lit la clé games.hiddenIds de SiteSetting', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ key: HIDDEN_GAMES_SETTING_KEY, value: JSON.stringify([B, A]) })
    expect(await getStaffHiddenGameIds()).toEqual([A, B])
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'games.hiddenIds' } })
  })

  it('une valeur abîmée ne cache rien', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: '{pas du json' })
    expect(await getStaffHiddenGameIds()).toEqual([])
  })

  it('garde le résultat 30 s, puis relit', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([A]) })
    await getStaffHiddenGameIds()
    await getStaffHiddenGameIds()
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(1)

    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([B]) })
    vi.advanceTimersByTime(HIDDEN_IDS_TTL_MS - 1)
    expect(await getStaffHiddenGameIds()).toEqual([A])
    vi.advanceTimersByTime(2)
    expect(await getStaffHiddenGameIds()).toEqual([B])
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(2)
  })

  it('partage une seule requête entre appels simultanés', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([A]) })
    const results = await Promise.all([getStaffHiddenGameIds(), getStaffHiddenGameIds(), isGameHiddenByStaff(A)])
    expect(results).toEqual([[A], [A], true])
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(1)
  })

  it('erreur Prisma : liste vide, sans relire avant la fin du délai', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(Object.assign(new Error('no such table'), { code: 'P2021' }))
    expect(await getStaffHiddenGameIds()).toEqual([])
    expect(await isGameHiddenByStaff(A)).toBe(false)
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(1)
  })

  it('erreur après une lecture réussie : dernière valeur connue, relue après le délai', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValueOnce({ value: JSON.stringify([A]) })
    expect(await getStaffHiddenGameIds()).toEqual([A])

    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('locked'))
    vi.advanceTimersByTime(HIDDEN_IDS_TTL_MS + 1)
    expect(await getStaffHiddenGameIds()).toEqual([A])
    expect(await getStaffHiddenGameIds()).toEqual([A])
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(2)

    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([]) })
    vi.advanceTimersByTime(HIDDEN_IDS_TTL_MS + 1)
    expect(await getStaffHiddenGameIds()).toEqual([])
  })

  it('un client Prisma sans la table (mock ou base locale) ne lève pas', async () => {
    prismaMock.siteSetting.findUnique.mockImplementation(() => {
      throw new TypeError('findUnique is not a function')
    })
    expect(await getStaffHiddenGameIds()).toEqual([])
  })
})

describe('setGameHidden', () => {
  it('cache un jeu : upsert du JSON dans l’ordre du catalogue, changed vrai, caches invalidés', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([C]) })
    prismaMock.siteSetting.upsert.mockImplementation(async (args: { update: { value: string } }) => {
      prismaMock.siteSetting.findUnique.mockResolvedValue({ value: args.update.value })
      return {}
    })
    expect(await getStaffHiddenGameIds()).toEqual([C])

    const result = await setGameHidden(A, true)

    expect(result).toEqual({ hiddenIds: [A, C], changed: true })
    const value = JSON.stringify([A, C])
    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'games.hiddenIds' },
      create: { key: 'games.hiddenIds', value },
      update: { value },
    })
    expect(await isGameHiddenByStaff(A)).toBe(true)
  })

  it('remet un jeu', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([A, B]) })
    const result = await setGameHidden(A, false)
    expect(result).toEqual({ hiddenIds: [B], changed: true })
    expect(prismaMock.siteSetting.upsert.mock.calls[0][0].update.value).toBe(JSON.stringify([B]))
  })

  it('ne réécrit rien quand le réglage ne change pas', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([A]) })
    expect(await setGameHidden(A, true)).toEqual({ hiddenIds: [A], changed: false })
    expect(await setGameHidden(B, false)).toEqual({ hiddenIds: [A], changed: false })
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuse un id inconnu ou retiré du code, sans toucher à la base', async () => {
    for (const id of ['nope', retired, '']) {
      await expect(setGameHidden(id, true)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('laisse remonter une panne d’écriture', async () => {
    prismaMock.siteSetting.upsert.mockRejectedValue(new Error('locked'))
    await expect(setGameHidden(A, true)).rejects.toThrow('locked')
  })
})

describe('getStaffGameDifficulty', () => {
  it('lit la clé games.difficulty de SiteSetting', async () => {
    storeSettings({ [DIFFICULTY_SETTING_KEY]: JSON.stringify({ [B]: otherLevel(B), [A]: otherLevel(A) }) })
    expect(await getStaffGameDifficulty()).toEqual({ [A]: otherLevel(A), [B]: otherLevel(B) })
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'games.difficulty' } })
  })

  it('valeur abîmée ou absente : aucun réglage', async () => {
    storeSettings({ [DIFFICULTY_SETTING_KEY]: '{pas du json' })
    expect(await getStaffGameDifficulty()).toEqual({})
    invalidateGameCatalogCaches({ forget: true })
    storeSettings()
    expect(await getStaffGameDifficulty()).toEqual({})
  })

  it('erreur de base : dernière valeur connue, sans lever', async () => {
    storeSettings({ [DIFFICULTY_SETTING_KEY]: JSON.stringify({ [A]: otherLevel(A) }) })
    expect(await getStaffGameDifficulty()).toEqual({ [A]: otherLevel(A) })
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('locked'))
    vi.advanceTimersByTime(HIDDEN_IDS_TTL_MS + 1)
    expect(await getStaffGameDifficulty()).toEqual({ [A]: otherLevel(A) })
  })

  it('garde le résultat 30 s', async () => {
    storeSettings()
    await getStaffGameDifficulty()
    await getStaffGameDifficulty()
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe('setGameDifficulty', () => {
  it('ajoute un réglage : upsert du JSON dans l’ordre du catalogue, changed vrai', async () => {
    storeSettings({ [DIFFICULTY_SETTING_KEY]: JSON.stringify({ [C]: otherLevel(C) }) })
    expect(await getStaffGameDifficulty()).toEqual({ [C]: otherLevel(C) })

    const result = await setGameDifficulty(A, otherLevel(A))

    const expected = { [A]: otherLevel(A), [C]: otherLevel(C) }
    expect(result).toEqual({ difficulty: expected, changed: true })
    const value = JSON.stringify(expected)
    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'games.difficulty' },
      create: { key: 'games.difficulty', value },
      update: { value },
    })
    expect(await getStaffGameDifficulty()).toEqual(expected)
  })

  it('change un réglage existant', async () => {
    storeSettings({ [DIFFICULTY_SETTING_KEY]: JSON.stringify({ [A]: otherLevel(A) }) })
    const result = await setGameDifficulty(A, lastLevel(A))
    expect(result).toEqual({ difficulty: { [A]: lastLevel(A) }, changed: true })
  })

  it('revenir au niveau du code supprime l’entrée', async () => {
    const rows = storeSettings({ [DIFFICULTY_SETTING_KEY]: JSON.stringify({ [A]: otherLevel(A), [B]: otherLevel(B) }) })
    const result = await setGameDifficulty(A, codeLevel(A))
    expect(result).toEqual({ difficulty: { [B]: otherLevel(B) }, changed: true })
    expect(rows.get(DIFFICULTY_SETTING_KEY)).toBe(JSON.stringify({ [B]: otherLevel(B) }))
  })

  it('niveau du code sans réglage, ou même niveau déjà posé : changed faux, rien d’écrit', async () => {
    storeSettings({ [DIFFICULTY_SETTING_KEY]: JSON.stringify({ [B]: otherLevel(B) }) })
    expect(await setGameDifficulty(A, codeLevel(A))).toEqual({ difficulty: { [B]: otherLevel(B) }, changed: false })
    expect(await setGameDifficulty(B, otherLevel(B))).toEqual({ difficulty: { [B]: otherLevel(B) }, changed: false })
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('part de la valeur stockée, pas du cache périmé', async () => {
    const rows = storeSettings()
    expect(await getStaffGameDifficulty()).toEqual({})
    rows.set(DIFFICULTY_SETTING_KEY, JSON.stringify({ [B]: otherLevel(B) }))

    const result = await setGameDifficulty(A, otherLevel(A))

    expect(result.difficulty).toEqual({ [A]: otherLevel(A), [B]: otherLevel(B) })
  })

  it('refuse un id inconnu ou retiré du code, sans toucher à la base', async () => {
    for (const id of ['nope', retired, '']) {
      await expect(setGameDifficulty(id, 3)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuse un niveau hors 1, 2, 3', async () => {
    for (const level of [0, 4, 1.5, '2', null, NaN]) {
      await expect(setGameDifficulty(A, level as never), String(level)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('laisse remonter une panne d’écriture', async () => {
    storeSettings()
    prismaMock.siteSetting.upsert.mockRejectedValue(new Error('locked'))
    await expect(setGameDifficulty(A, otherLevel(A))).rejects.toThrow('locked')
  })

  it('la valeur écrite sert de repli si la relecture échoue', async () => {
    storeSettings()
    await setGameDifficulty(A, otherLevel(A))
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect(await getStaffGameDifficulty()).toEqual({ [A]: otherLevel(A) })
  })
})

describe('getGamePlayCounts30d', () => {
  it('fusionne lancements en ligne et débuts locaux par jeu', async () => {
    prismaMock.onlineGameSession.groupBy.mockResolvedValue([
      { gameId: A, _count: { _all: 4 } },
      { gameId: B, _count: { _all: 2 } },
    ])
    prismaMock.localGameDaily.groupBy.mockResolvedValue([
      { gameId: B, _sum: { starts: 5 } },
      { gameId: C, _sum: { starts: null } },
    ])

    expect(await getGamePlayCounts30d()).toEqual({
      [A]: { online: 4, local: 0 },
      [B]: { online: 2, local: 5 },
      [C]: { online: 0, local: 0 },
    })
  })

  it('interroge la fenêtre de 30 jours : instant côté en ligne, jour de Paris côté local', async () => {
    await getGamePlayCounts30d(new Date('2026-11-23T10:00:00Z'))

    const online = prismaMock.onlineGameSession.groupBy.mock.calls[0][0]
    expect(online.by).toEqual(['gameId'])
    expect(online.where.startedAt.gte).toEqual(new Date('2026-10-24T10:00:00Z'))
    const local = prismaMock.localGameDaily.groupBy.mock.calls[0][0]
    expect(local.by).toEqual(['gameId'])
    expect(local.where.day.gte).toBe('2026-10-24')
  })

  it('garde le résultat 10 min', async () => {
    await getGamePlayCounts30d()
    vi.advanceTimersByTime(PLAY_COUNTS_TTL_MS - 1)
    await getGamePlayCounts30d()
    expect(prismaMock.onlineGameSession.groupBy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    await getGamePlayCounts30d()
    expect(prismaMock.onlineGameSession.groupBy).toHaveBeenCalledTimes(2)
  })

  it('une table locale absente : comptes vides, sans lever ni réessayer avant le délai', async () => {
    prismaMock.localGameDaily.groupBy.mockRejectedValue(new Error('no such table'))
    expect(await getGamePlayCounts30d()).toEqual({})
    expect(await getGamePlayCounts30d()).toEqual({})
    expect(prismaMock.localGameDaily.groupBy).toHaveBeenCalledTimes(1)
  })
})

describe('getGameCatalogState', () => {
  it('assemble jeux cachés et classements, sans jamais mettre un jeu caché en avant', async () => {
    const online = GAMES.filter((g) => !g.hidden && g.onlineReady).map((g) => g.id)
    const [first, second] = online
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([first]) })
    prismaMock.onlineGameSession.groupBy.mockResolvedValue([
      { gameId: first, _count: { _all: 50 } },
      { gameId: second, _count: { _all: 3 } },
    ])

    const state = await getGameCatalogState()

    expect(state.hiddenIds).toEqual([first])
    expect(state.popular.online[0]).toBe(second)
    expect(state.popular.online).not.toContain(first)
    expect(state.popular.local).not.toContain(first)
  })

  it('classe POPULAR_RANKED_LIMIT jeux par mode : de la réserve pour les jeux mis à la une', async () => {
    const online = GAMES.filter((g) => !g.hidden && g.onlineReady).map((g) => g.id)
    expect(online.length).toBeGreaterThan(POPULAR_LIMIT)
    prismaMock.siteSetting.findUnique.mockResolvedValue(null)
    prismaMock.onlineGameSession.groupBy.mockResolvedValue(
      online.map((gameId, i) => ({ gameId, _count: { _all: 100 - i } }))
    )

    const state = await getGameCatalogState()

    expect(state.popular.online).toEqual(online.slice(0, POPULAR_RANKED_LIMIT))
    expect(state.popular.online.length).toBeGreaterThan(POPULAR_LIMIT)
  })

  it('base illisible : aucun jeu caché, aucun jeu présenté comme populaire', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    prismaMock.onlineGameSession.groupBy.mockRejectedValue(new Error('down'))
    const state = await getGameCatalogState()
    expect(state.hiddenIds).toEqual([])
    expect(state.popular).toEqual({ local: [], online: [] })
  })

  it('garde l’état 60 s', async () => {
    await getGameCatalogState()
    vi.advanceTimersByTime(CATALOG_STATE_TTL_MS - 1)
    await getGameCatalogState()
    // Une lecture par réglage (jeux cachés, difficulté, « fait boire », catégories, ambiances, soirée, à la une), pas une de plus.
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(7)
  })

  it('inclut les difficultés réglées, et setGameDifficulty fait relire l’état tout de suite', async () => {
    storeSettings()
    expect((await getGameCatalogState()).difficulty).toEqual({})
    await setGameDifficulty(A, otherLevel(A))
    expect((await getGameCatalogState()).difficulty).toEqual({ [A]: otherLevel(A) })
  })

  it('base illisible : difficulty vaut {}', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect((await getGameCatalogState()).difficulty).toEqual({})
  })

  it('setGameHidden fait relire l’état tout de suite', async () => {
    await getGameCatalogState()
    prismaMock.siteSetting.upsert.mockImplementation(async (args: { update: { value: string } }) => {
      prismaMock.siteSetting.findUnique.mockResolvedValue({ value: args.update.value })
      return {}
    })
    await setGameHidden(A, true)
    const state = await getGameCatalogState()
    expect(state.hiddenIds).toEqual([A])
  })
})

describe('getStaffGameDrinkLevel', () => {
  it('lit la clé games.drinkLevel de SiteSetting', async () => {
    storeSettings({ [DRINK_LEVEL_SETTING_KEY]: JSON.stringify({ [B]: otherDrink(B), [A]: otherDrink(A) }) })
    expect(await getStaffGameDrinkLevel()).toEqual({ [A]: otherDrink(A), [B]: otherDrink(B) })
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'games.drinkLevel' } })
  })

  it('valeur abîmée ou absente : aucun réglage', async () => {
    storeSettings({ [DRINK_LEVEL_SETTING_KEY]: '{pas du json' })
    expect(await getStaffGameDrinkLevel()).toEqual({})
    invalidateGameCatalogCaches({ forget: true })
    storeSettings()
    expect(await getStaffGameDrinkLevel()).toEqual({})
  })

  it('erreur de base : dernière valeur connue, sans lever', async () => {
    storeSettings({ [DRINK_LEVEL_SETTING_KEY]: JSON.stringify({ [A]: otherDrink(A) }) })
    expect(await getStaffGameDrinkLevel()).toEqual({ [A]: otherDrink(A) })
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('locked'))
    vi.advanceTimersByTime(HIDDEN_IDS_TTL_MS + 1)
    expect(await getStaffGameDrinkLevel()).toEqual({ [A]: otherDrink(A) })
  })

  it('ne se mélange pas avec la difficulté', async () => {
    storeSettings({ [DIFFICULTY_SETTING_KEY]: JSON.stringify({ [A]: otherLevel(A) }) })
    expect(await getStaffGameDrinkLevel()).toEqual({})
  })
})

describe('setGameDrinkLevel', () => {
  it('ajoute un réglage : upsert du JSON dans l’ordre du catalogue, changed vrai', async () => {
    storeSettings({ [DRINK_LEVEL_SETTING_KEY]: JSON.stringify({ [C]: otherDrink(C) }) })
    expect(await getStaffGameDrinkLevel()).toEqual({ [C]: otherDrink(C) })

    const result = await setGameDrinkLevel(A, otherDrink(A))

    const expected = { [A]: otherDrink(A), [C]: otherDrink(C) }
    expect(result).toEqual({ drinkLevel: expected, changed: true })
    const value = JSON.stringify(expected)
    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'games.drinkLevel' },
      create: { key: 'games.drinkLevel', value },
      update: { value },
    })
    expect(await getStaffGameDrinkLevel()).toEqual(expected)
  })

  it('revenir au niveau du code supprime l’entrée', async () => {
    const rows = storeSettings({ [DRINK_LEVEL_SETTING_KEY]: JSON.stringify({ [A]: otherDrink(A), [B]: otherDrink(B) }) })
    const result = await setGameDrinkLevel(A, codeDrink(A))
    expect(result).toEqual({ drinkLevel: { [B]: otherDrink(B) }, changed: true })
    expect(rows.get(DRINK_LEVEL_SETTING_KEY)).toBe(JSON.stringify({ [B]: otherDrink(B) }))
  })

  it('niveau du code sans réglage, ou même niveau déjà posé : changed faux, rien d’écrit', async () => {
    storeSettings({ [DRINK_LEVEL_SETTING_KEY]: JSON.stringify({ [B]: otherDrink(B) }) })
    expect(await setGameDrinkLevel(A, codeDrink(A))).toEqual({ drinkLevel: { [B]: otherDrink(B) }, changed: false })
    expect(await setGameDrinkLevel(B, otherDrink(B))).toEqual({ drinkLevel: { [B]: otherDrink(B) }, changed: false })
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('part de la valeur stockée, pas du cache périmé', async () => {
    const rows = storeSettings()
    expect(await getStaffGameDrinkLevel()).toEqual({})
    rows.set(DRINK_LEVEL_SETTING_KEY, JSON.stringify({ [B]: otherDrink(B) }))

    const result = await setGameDrinkLevel(A, otherDrink(A))

    expect(result.drinkLevel).toEqual({ [A]: otherDrink(A), [B]: otherDrink(B) })
  })

  it('n’écrit jamais dans la clé de la difficulté', async () => {
    const rows = storeSettings()
    await setGameDrinkLevel(A, otherDrink(A))
    expect(rows.has(DIFFICULTY_SETTING_KEY)).toBe(false)
  })

  it('refuse un id inconnu ou retiré du code, ou un niveau hors 1, 2, 3, sans toucher à la base', async () => {
    for (const id of ['nope', retired, '']) {
      await expect(setGameDrinkLevel(id, 3)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    for (const level of [0, 4, 1.5, '2', null, NaN]) {
      await expect(setGameDrinkLevel(A, level as never), String(level)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('laisse remonter une panne d’écriture, et la valeur écrite sert de repli si la relecture échoue', async () => {
    storeSettings()
    prismaMock.siteSetting.upsert.mockRejectedValueOnce(new Error('locked'))
    await expect(setGameDrinkLevel(A, otherDrink(A))).rejects.toThrow('locked')

    await setGameDrinkLevel(A, otherDrink(A))
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect(await getStaffGameDrinkLevel()).toEqual({ [A]: otherDrink(A) })
  })
})

describe('getGameCategories', () => {
  const stored = [{ id: 'chaud', names: { fr: 'Chaud' }, gameIds: [B, A] }]

  it('lit la clé games.categories de SiteSetting, jeux dans l’ordre du catalogue', async () => {
    storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify(stored) })
    expect(await getGameCategories()).toEqual([{ id: 'chaud', names: { fr: 'Chaud' }, gameIds: [A, B] }])
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'games.categories' } })
  })

  it('valeur abîmée ou absente : aucune catégorie', async () => {
    storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: '{pas du json' })
    expect(await getGameCategories()).toEqual([])
    invalidateGameCatalogCaches({ forget: true })
    storeSettings()
    expect(await getGameCategories()).toEqual([])
  })

  it('erreur de base : dernière valeur connue, sans lever', async () => {
    storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify(stored) })
    expect(await getGameCategories()).toHaveLength(1)
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('locked'))
    vi.advanceTimersByTime(HIDDEN_IDS_TTL_MS + 1)
    expect(await getGameCategories()).toHaveLength(1)
  })
})

describe('createGameCategory', () => {
  it('crée une catégorie vide en dernière position, avec un id généré [a-z0-9-], noms nettoyés', async () => {
    const rows = storeSettings()

    const first = await createGameCategory({ fr: '  Soirée   chaude ', en: ' Hot ' })
    const second = await createGameCategory({ fr: 'Calme' })

    expect(first.id).toMatch(/^[a-z0-9-]{1,40}$/)
    expect(first).toEqual({ id: first.id, names: { fr: 'Soirée chaude', en: 'Hot' }, gameIds: [] })
    expect(second.id).not.toBe(first.id)
    expect(JSON.parse(rows.get(GAME_CATEGORIES_SETTING_KEY)!)).toEqual([first, second])
    expect(prismaMock.siteSetting.upsert).toHaveBeenLastCalledWith({
      where: { key: 'games.categories' },
      create: { key: 'games.categories', value: JSON.stringify([first, second]) },
      update: { value: JSON.stringify([first, second]) },
    })
  })

  it('part de la valeur stockée, et fait relire la liste tout de suite', async () => {
    const rows = storeSettings()
    expect(await getGameCategories()).toEqual([])
    rows.set(GAME_CATEGORIES_SETTING_KEY, JSON.stringify([{ id: 'deja', names: { fr: 'Déjà' }, gameIds: [] }]))

    const created = await createGameCategory({ fr: 'Neuve' })

    expect((await getGameCategories()).map((c) => c.id)).toEqual(['deja', created.id])
  })

  it('refuse un nom français vide, trop long ou absent, sans toucher à la base', async () => {
    const bad = [{ fr: '' }, { fr: '   ' }, { fr: 'x'.repeat(GAME_CATEGORY_LIMITS.maxNameLength + 1) }, { en: 'Hot' }, null, 'Chaud']
    for (const names of bad) {
      await expect(createGameCategory(names as never), JSON.stringify(names)).rejects.toBeInstanceOf(GameCategoryInvalidError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuse la 25e catégorie', async () => {
    const full = Array.from({ length: GAME_CATEGORY_LIMITS.maxCategories }, (_, i) => ({
      id: `c${i}`,
      names: { fr: `C${i}` },
      gameIds: [],
    }))
    storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify(full) })

    await expect(createGameCategory({ fr: 'De trop' })).rejects.toBeInstanceOf(GameCategoryLimitError)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('accepte la dernière place libre (24e)', async () => {
    const almost = Array.from({ length: GAME_CATEGORY_LIMITS.maxCategories - 1 }, (_, i) => ({
      id: `c${i}`,
      names: { fr: `C${i}` },
      gameIds: [],
    }))
    storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify(almost) })
    await expect(createGameCategory({ fr: 'Dernière' })).resolves.toBeTruthy()
  })

  it('laisse remonter une panne d’écriture', async () => {
    storeSettings()
    prismaMock.siteSetting.upsert.mockRejectedValue(new Error('locked'))
    await expect(createGameCategory({ fr: 'X' })).rejects.toThrow('locked')
  })
})

describe('updateGameCategory', () => {
  const seed = (extra: Record<string, unknown>[] = []) =>
    storeSettings({
      [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify([
        { id: 'un', names: { fr: 'Un', en: 'One' }, gameIds: [A] },
        { id: 'deux', names: { fr: 'Deux' }, gameIds: [] },
        ...extra,
      ]),
    })

  it('renomme : noms nettoyés et REMPLACÉS (une langue absente du patch disparaît), jeux et id intacts', async () => {
    const rows = seed()

    const { category: updated, changed } = await updateGameCategory('un', { names: { fr: '  Premier  choix ' } })

    expect(changed).toBe(true)
    expect(updated).toEqual({ id: 'un', names: { fr: 'Premier choix' }, gameIds: [A] })
    expect(JSON.parse(rows.get(GAME_CATEGORIES_SETTING_KEY)!).map((c: { id: string }) => c.id)).toEqual(['un', 'deux'])
  })

  it('change les jeux : liste complète, ordre du catalogue, sans doublon', async () => {
    const rows = seed()

    const { category: updated } = await updateGameCategory('deux', { gameIds: [C, A, A, B] })

    expect(updated.gameIds).toEqual([A, B, C])
    expect(JSON.parse(rows.get(GAME_CATEGORIES_SETTING_KEY)!)[1].gameIds).toEqual([A, B, C])
  })

  it('vider la liste de jeux est permis', async () => {
    seed()
    expect((await updateGameCategory('un', { gameIds: [] })).category.gameIds).toEqual([])
  })

  it('une modification sans effet n’écrit rien et rend changed faux', async () => {
    seed()
    expect((await updateGameCategory('un', { gameIds: [A] })).changed).toBe(false)
    expect((await updateGameCategory('un', { names: { fr: ' Un ', en: 'One' } })).changed).toBe(false)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('catégorie introuvable : GameCategoryNotFoundError, rien d’écrit', async () => {
    seed()
    await expect(updateGameCategory('fantome', { gameIds: [A] })).rejects.toBeInstanceOf(GameCategoryNotFoundError)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuse un nom invalide, un jeu inconnu ou retiré du code, une liste mal formée, un patch vide', async () => {
    seed()
    const bad: Array<[Parameters<typeof updateGameCategory>[1], string]> = [
      [{ names: { fr: '' } }, 'nom vide'],
      [{ names: { fr: 'x'.repeat(41) } }, 'nom long'],
      [{ names: { en: 'Only' } as never }, 'sans français'],
      [{ gameIds: ['nope'] }, 'jeu inconnu'],
      [{ gameIds: [A, retired] }, 'jeu retiré'],
      [{ gameIds: 'pmu' as never }, 'pas un tableau'],
      [{ gameIds: [3] as never }, 'pas un id'],
      [{}, 'patch vide'],
    ]
    for (const [patch, label] of bad) {
      await expect(updateGameCategory('un', patch), label).rejects.toBeInstanceOf(GameCategoryInvalidError)
    }
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('un patch invalide est refusé avant toute lecture de la base', async () => {
    await expect(updateGameCategory('fantome', { names: { fr: '' } })).rejects.toBeInstanceOf(GameCategoryInvalidError)
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
  })
})

describe('moveGameCategory', () => {
  const ids = (list: Array<{ id: string }>) => list.map((c) => c.id)
  const seed = () =>
    storeSettings({
      [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify(
        ['a', 'b', 'c'].map((id) => ({ id, names: { fr: id.toUpperCase() }, gameIds: [] }))
      ),
    })

  it('monte et descend d’un cran, écrit l’ordre et rend la liste complète', async () => {
    const rows = seed()

    expect(await moveGameCategory('b', 'up')).toMatchObject({ changed: true })
    expect(ids(JSON.parse(rows.get(GAME_CATEGORIES_SETTING_KEY)!))).toEqual(['b', 'a', 'c'])
    expect(ids((await moveGameCategory('b', 'down')).categories)).toEqual(['a', 'b', 'c'])
    expect(ids((await moveGameCategory('a', 'down')).categories)).toEqual(['b', 'a', 'c'])
    expect(ids(await getGameCategories())).toEqual(['b', 'a', 'c'])
  })

  it('aux bornes : la première ne monte pas, la dernière ne descend pas, changed faux, rien n’est écrit', async () => {
    seed()
    const top = await moveGameCategory('a', 'up')
    const bottom = await moveGameCategory('c', 'down')
    expect([ids(top.categories), top.changed]).toEqual([['a', 'b', 'c'], false])
    expect([ids(bottom.categories), bottom.changed]).toEqual([['a', 'b', 'c'], false])
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('une seule catégorie : aucun déplacement possible', async () => {
    storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify([{ id: 'seule', names: { fr: 'Seule' }, gameIds: [] }]) })
    expect(ids((await moveGameCategory('seule', 'up')).categories)).toEqual(['seule'])
    expect((await moveGameCategory('seule', 'down')).changed).toBe(false)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('introuvable : GameCategoryNotFoundError', async () => {
    seed()
    await expect(moveGameCategory('fantome', 'up')).rejects.toBeInstanceOf(GameCategoryNotFoundError)
  })
})

describe('setGameInCategory', () => {
  const seed = () =>
    storeSettings({
      [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify([
        { id: 'un', names: { fr: 'Un' }, gameIds: [B] },
        { id: 'deux', names: { fr: 'Deux' }, gameIds: [] },
      ]),
    })

  it('ajoute un jeu à partir de la valeur stockée, dans l’ordre du catalogue, et fait relire la liste', async () => {
    const rows = seed()
    expect((await getGameCategories())[0].gameIds).toEqual([B])
    rows.set(GAME_CATEGORIES_SETTING_KEY, JSON.stringify([{ id: 'un', names: { fr: 'Un' }, gameIds: [B, C] }]))

    const { category, changed } = await setGameInCategory('un', A, true)

    expect(changed).toBe(true)
    expect(category.gameIds).toEqual([A, B, C])
    expect((await getGameCategories())[0].gameIds).toEqual([A, B, C])
  })

  it('retire un jeu sans toucher aux autres', async () => {
    seed()
    const { category, changed } = await setGameInCategory('un', B, false)
    expect(changed).toBe(true)
    expect(category.gameIds).toEqual([])
  })

  it('déjà ajouté ou déjà absent : changed faux, rien d’écrit', async () => {
    seed()
    expect((await setGameInCategory('un', B, true)).changed).toBe(false)
    expect((await setGameInCategory('un', A, false)).changed).toBe(false)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('deux cases cochées en même temps gardent les deux jeux', async () => {
    seed()
    await Promise.all([setGameInCategory('deux', A, true), setGameInCategory('deux', C, true)])
    expect((await getGameCategories()).find((c) => c.id === 'deux')!.gameIds).toEqual([A, C])
  })

  it('refuse un jeu inconnu ou retiré, un booléen mal typé ; introuvable : GameCategoryNotFoundError', async () => {
    seed()
    for (const gameId of ['nope', retired, '']) {
      await expect(setGameInCategory('un', gameId, true), gameId).rejects.toBeInstanceOf(GameCategoryInvalidError)
    }
    await expect(setGameInCategory('un', A, 'oui' as never)).rejects.toBeInstanceOf(GameCategoryInvalidError)
    await expect(setGameInCategory('fantome', A, true)).rejects.toBeInstanceOf(GameCategoryNotFoundError)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })
})

describe('écritures concurrentes', () => {
  it('deux créations simultanées gardent les deux catégories', async () => {
    const rows = storeSettings()
    // Une lecture lente laisserait la seconde écriture lire la même valeur périmée si rien ne les ordonnait.
    const read = prismaMock.siteSetting.findUnique.getMockImplementation()!
    prismaMock.siteSetting.findUnique.mockImplementation(async (args: { where: { key: string } }) => {
      const value = await read(args)
      await new Promise((resolve) => setTimeout(resolve, 5))
      return value
    })

    const pending = Promise.all([createGameCategory({ fr: 'Une' }), createGameCategory({ fr: 'Autre' })])
    await vi.advanceTimersByTimeAsync(50)
    const [first, second] = await pending

    expect(JSON.parse(rows.get(GAME_CATEGORIES_SETTING_KEY)!)).toEqual([first, second])
  })

  it('une écriture en échec ne bloque pas les suivantes', async () => {
    storeSettings()
    prismaMock.siteSetting.upsert.mockRejectedValueOnce(new Error('locked'))
    const [failed, ok] = await Promise.allSettled([createGameCategory({ fr: 'Perdue' }), createGameCategory({ fr: 'Gardée' })])
    expect(failed.status).toBe('rejected')
    expect(ok.status).toBe('fulfilled')
  })

  it('catégories, jeux cachés, difficulté et « fait boire » partagent la même file sans se mélanger', async () => {
    const rows = storeSettings()
    await Promise.all([
      createGameCategory({ fr: 'Chaud' }),
      setGameHidden(A, true),
      setGameDifficulty(B, otherLevel(B)),
      setGameDrinkLevel(C, otherDrink(C)),
    ])
    expect(JSON.parse(rows.get(HIDDEN_GAMES_SETTING_KEY)!)).toEqual([A])
    expect(JSON.parse(rows.get(DIFFICULTY_SETTING_KEY)!)).toEqual({ [B]: otherLevel(B) })
    expect(JSON.parse(rows.get(DRINK_LEVEL_SETTING_KEY)!)).toEqual({ [C]: otherDrink(C) })
    expect(JSON.parse(rows.get(GAME_CATEGORIES_SETTING_KEY)!)).toHaveLength(1)
  })
})

describe('deleteGameCategory', () => {
  it('supprime la catégorie sans toucher aux autres', async () => {
    const rows = storeSettings({
      [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify([
        { id: 'a', names: { fr: 'A' }, gameIds: [A] },
        { id: 'b', names: { fr: 'B' }, gameIds: [B] },
      ]),
    })

    await deleteGameCategory('a')

    expect(JSON.parse(rows.get(GAME_CATEGORIES_SETTING_KEY)!)).toEqual([{ id: 'b', names: { fr: 'B' }, gameIds: [B] }])
    expect((await getGameCategories()).map((c) => c.id)).toEqual(['b'])
  })

  it('supprimer la dernière laisse une liste vide', async () => {
    const rows = storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify([{ id: 'a', names: { fr: 'A' }, gameIds: [] }]) })
    await deleteGameCategory('a')
    expect(rows.get(GAME_CATEGORIES_SETTING_KEY)).toBe('[]')
    expect(await getGameCategories()).toEqual([])
  })

  it('introuvable : GameCategoryNotFoundError, rien d’écrit', async () => {
    storeSettings()
    await expect(deleteGameCategory('fantome')).rejects.toBeInstanceOf(GameCategoryNotFoundError)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('laisse remonter une panne d’écriture', async () => {
    storeSettings({ [GAME_CATEGORIES_SETTING_KEY]: JSON.stringify([{ id: 'a', names: { fr: 'A' }, gameIds: [] }]) })
    prismaMock.siteSetting.upsert.mockRejectedValue(new Error('locked'))
    await expect(deleteGameCategory('a')).rejects.toThrow('locked')
  })
})

describe('getGameCatalogState : barème et catégories', () => {
  it('inclut niveaux « fait boire » et catégories, et leurs écritures font relire l’état tout de suite', async () => {
    storeSettings()
    const empty = await getGameCatalogState()
    expect(empty.drinkLevel).toEqual({})
    expect(empty.categories).toEqual([])

    await setGameDrinkLevel(A, otherDrink(A))
    const created = await createGameCategory({ fr: 'Chaud' })
    await updateGameCategory(created.id, { gameIds: [B] })
    await setGameInCategory(created.id, A, true)

    const state = await getGameCatalogState()
    expect(state.drinkLevel).toEqual({ [A]: otherDrink(A) })
    expect(state.categories).toEqual([{ id: created.id, names: { fr: 'Chaud' }, gameIds: [A, B] }])
  })

  it('base illisible : drinkLevel vaut {} et categories vaut []', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    const state = await getGameCatalogState()
    expect(state.drinkLevel).toEqual({})
    expect(state.categories).toEqual([])
  })

  it('l’état oublié repart avec des champs neufs, jamais partagés avec EMPTY_GAME_CATALOG', async () => {
    invalidateGameCatalogCaches({ forget: true })
    const state = await getGameCatalogState()
    expect(state.drinkLevel).not.toBe(EMPTY_GAME_CATALOG.drinkLevel)
    expect(state.categories).not.toBe(EMPTY_GAME_CATALOG.categories)
  })
})

describe('getStaffGameVibes', () => {
  it('lit la clé games.vibes de SiteSetting, ambiances dans l’ordre de SOIREE_VIBES', async () => {
    storeSettings({ [VIBES_SETTING_KEY]: JSON.stringify({ [V1]: ['grosse', 'apero'] }) })
    expect(await getStaffGameVibes()).toEqual({ [V1]: ['apero', 'grosse'] })
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'games.vibes' } })
  })

  it('valeur abîmée ou absente : aucun réglage', async () => {
    storeSettings({ [VIBES_SETTING_KEY]: '{pas du json' })
    expect(await getStaffGameVibes()).toEqual({})
    invalidateGameCatalogCaches({ forget: true })
    prismaMock.siteSetting.findUnique.mockResolvedValue(null)
    expect(await getStaffGameVibes()).toEqual({})
  })

  it('erreur de base : dernière valeur connue, sans lever', async () => {
    storeSettings({ [VIBES_SETTING_KEY]: JSON.stringify({ [V1]: [] }) })
    expect(await getStaffGameVibes()).toEqual({ [V1]: [] })
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    await vi.advanceTimersByTimeAsync(HIDDEN_IDS_TTL_MS + 1)
    expect(await getStaffGameVibes()).toEqual({ [V1]: [] })
  })

  it('garde le résultat 30 s', async () => {
    storeSettings()
    await getStaffGameVibes()
    await getStaffGameVibes()
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(HIDDEN_IDS_TTL_MS + 1)
    await getStaffGameVibes()
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(2)
  })
})

describe('setGameVibe', () => {
  it('ajoute une ambiance : upsert du JSON, changed vrai, caches invalidés', async () => {
    const rows = storeSettings()
    // « Peu » : apéro et ça monte par défaut ; la grosse soirée en plus sort du défaut.
    const result = await setGameVibe(V1, 'grosse', true)

    const expected = { [V1]: ['apero', 'monte', 'grosse'] }
    expect(result).toEqual({ vibes: expected, changed: true })
    const value = JSON.stringify(expected)
    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'games.vibes' },
      create: { key: 'games.vibes', value },
      update: { value },
    })
    expect(rows.get(VIBES_SETTING_KEY)).toBe(value)
    expect(await getStaffGameVibes()).toEqual(expected)
  })

  it('retire une ambiance du défaut du niveau', async () => {
    storeSettings()
    // « Moyen » : les trois par défaut.
    expect(await setGameVibe(V2, 'apero', false)).toEqual({ vibes: { [V2]: ['monte', 'grosse'] }, changed: true })
  })

  it('garde les autres jeux et l’ordre de SOIREE_VIBES', async () => {
    storeSettings({ [VIBES_SETTING_KEY]: JSON.stringify({ [V3]: ['grosse'] }) })
    const result = await setGameVibe(V3, 'apero', true)
    expect(result.vibes).toEqual({ [V3]: ['apero', 'grosse'] })
    const other = await setGameVibe(V1, 'grosse', true)
    expect(other.vibes).toEqual({ [V3]: ['apero', 'grosse'], [V1]: ['apero', 'monte', 'grosse'] })
  })

  it('un changement de niveau efface les ambiances redevenues son défaut, garde les autres', async () => {
    const level = codeDrink(V1)
    const to: 1 | 2 | 3 = level === 2 ? 3 : 2
    const same = defaultVibesForLevel(to)
    const rows = storeSettings({
      [VIBES_SETTING_KEY]: JSON.stringify({ [V1]: same, [V2]: ['grosse'] }),
    })
    await setGameDrinkLevel(V1, to)
    // Égale au défaut du nouveau niveau : l'entrée disparaît, le jeu suit de nouveau son niveau.
    expect(JSON.parse(rows.get(VIBES_SETTING_KEY)!)).toEqual({ [V2]: ['grosse'] })
    expect(await getStaffGameVibes()).toEqual({ [V2]: ['grosse'] })

    // Un réglage qui reste différent du défaut n'est pas touché.
    await setGameDrinkLevel(V2, codeDrink(V2) === 1 ? 3 : 1)
    expect(JSON.parse(rows.get(VIBES_SETTING_KEY)!)).toEqual({ [V2]: ['grosse'] })
  })

  it('revenir au défaut du niveau SUPPRIME l’entrée', async () => {
    const rows = storeSettings({
      [VIBES_SETTING_KEY]: JSON.stringify({ [V1]: ['apero', 'monte', 'grosse'], [V2]: ['grosse'] }),
    })
    const result = await setGameVibe(V1, 'grosse', false)
    expect(result).toEqual({ vibes: { [V2]: ['grosse'] }, changed: true })
    expect(rows.get(VIBES_SETTING_KEY)).toBe(JSON.stringify({ [V2]: ['grosse'] }))

    const last = await setGameVibe(V2, 'apero', true)
    expect(last.vibes).toEqual({ [V2]: ['apero', 'grosse'] })
    await setGameVibe(V2, 'monte', true)
    expect(rows.get(VIBES_SETTING_KEY)).toBe('{}')
  })

  it('une liste vide est permise et gardée', async () => {
    const rows = storeSettings()
    await setGameVibe(V1, 'apero', false)
    const result = await setGameVibe(V1, 'monte', false)
    expect(result).toEqual({ vibes: { [V1]: [] }, changed: true })
    expect(rows.get(VIBES_SETTING_KEY)).toBe(JSON.stringify({ [V1]: [] }))
    expect(await getStaffGameVibes()).toEqual({ [V1]: [] })
  })

  it('déjà dans cet état : changed faux, rien d’écrit', async () => {
    storeSettings({ [VIBES_SETTING_KEY]: JSON.stringify({ [V3]: ['grosse'] }) })
    expect(await setGameVibe(V1, 'apero', true)).toEqual({ vibes: { [V3]: ['grosse'] }, changed: false })
    expect(await setGameVibe(V3, 'grosse', true)).toEqual({ vibes: { [V3]: ['grosse'] }, changed: false })
    expect(await setGameVibe(V3, 'apero', false)).toEqual({ vibes: { [V3]: ['grosse'] }, changed: false })
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('le défaut se recalcule avec le niveau « fait boire » STOCKÉ, pas celui du code', async () => {
    // V1 est « Peu » dans le code ; réglé sur « Beaucoup », ses ambiances par défaut deviennent ça monte + grosse.
    storeSettings({ [DRINK_LEVEL_SETTING_KEY]: JSON.stringify({ [V1]: 3 }) })
    expect(await setGameVibe(V1, 'grosse', true)).toEqual({ vibes: {}, changed: false })
    expect(await setGameVibe(V1, 'apero', true)).toEqual({ vibes: { [V1]: ['apero', 'monte', 'grosse'] }, changed: true })
    // Retirer l'apéro ramène au défaut du niveau réglé : l'entrée disparaît.
    expect(await setGameVibe(V1, 'apero', false)).toEqual({ vibes: {}, changed: true })
  })

  it('relit le niveau en base, pas le cache périmé', async () => {
    const rows = storeSettings()
    expect(await getStaffGameDrinkLevel()).toEqual({})
    rows.set(DRINK_LEVEL_SETTING_KEY, JSON.stringify({ [V1]: 3 }))

    expect(await setGameVibe(V1, 'grosse', true)).toEqual({ vibes: {}, changed: false })
  })

  it('part des ambiances stockées, pas du cache périmé', async () => {
    const rows = storeSettings()
    expect(await getStaffGameVibes()).toEqual({})
    rows.set(VIBES_SETTING_KEY, JSON.stringify({ [V3]: ['grosse'] }))

    const result = await setGameVibe(V1, 'grosse', true)

    expect(result.vibes).toEqual({ [V3]: ['grosse'], [V1]: ['apero', 'monte', 'grosse'] })
  })

  it('n’écrit jamais dans une autre clé', async () => {
    const rows = storeSettings()
    await setGameVibe(V1, 'grosse', true)
    expect([...rows.keys()]).toEqual([VIBES_SETTING_KEY])
  })

  it('refuse un jeu inconnu, retiré du code ou hors Mode Soirée, une ambiance inconnue, un on non booléen — sans toucher à la base', async () => {
    const outside = STAFF_TOGGLEABLE_GAME_IDS.find((id) => !SOIREE_GAME_IDS.includes(id))
    for (const id of ['nope', retired, '', ...(outside ? [outside] : [])]) {
      await expect(setGameVibe(id, 'apero', true), id).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    for (const vibe of ['soiree', '', null, 1]) {
      await expect(setGameVibe(V1, vibe as never, true), String(vibe)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    for (const on of ['true', 1, null, undefined]) {
      await expect(setGameVibe(V1, 'apero', on as never), String(on)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('laisse remonter une panne d’écriture, et la valeur écrite sert de repli si la relecture échoue', async () => {
    storeSettings()
    prismaMock.siteSetting.upsert.mockRejectedValueOnce(new Error('locked'))
    await expect(setGameVibe(V1, 'grosse', true)).rejects.toThrow('locked')

    await setGameVibe(V1, 'grosse', true)
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect(await getStaffGameVibes()).toEqual({ [V1]: ['apero', 'monte', 'grosse'] })
  })

  it('deux écritures simultanées sur le même jeu gardent les deux changements', async () => {
    const rows = storeSettings()
    const read = prismaMock.siteSetting.findUnique.getMockImplementation()!
    prismaMock.siteSetting.findUnique.mockImplementation(async (args: { where: { key: string } }) => {
      const value = await read(args)
      await new Promise((resolve) => setTimeout(resolve, 5))
      return value
    })

    const pending = Promise.all([setGameVibe(V2, 'apero', false), setGameVibe(V2, 'grosse', false)])
    await vi.advanceTimersByTimeAsync(100)
    await pending

    expect(JSON.parse(rows.get(VIBES_SETTING_KEY)!)).toEqual({ [V2]: ['monte'] })
  })

  it('partage la file des autres réglages sans les mélanger', async () => {
    const rows = storeSettings()
    await Promise.all([setGameHidden(A, true), setGameVibe(V1, 'grosse', true), setGameDrinkLevel(C, otherDrink(C))])
    expect(JSON.parse(rows.get(HIDDEN_GAMES_SETTING_KEY)!)).toEqual([A])
    expect(JSON.parse(rows.get(VIBES_SETTING_KEY)!)).toEqual({ [V1]: ['apero', 'monte', 'grosse'] })
    expect(JSON.parse(rows.get(DRINK_LEVEL_SETTING_KEY)!)).toEqual({ [C]: otherDrink(C) })
  })
})

describe('getGameCatalogState : ambiances', () => {
  it('inclut les ambiances réglées, et setGameVibe fait relire l’état tout de suite', async () => {
    storeSettings({ [VIBES_SETTING_KEY]: JSON.stringify({ [V3]: ['grosse'] }) })
    expect((await getGameCatalogState()).vibes).toEqual({ [V3]: ['grosse'] })

    await setGameVibe(V1, 'grosse', true)

    expect((await getGameCatalogState()).vibes).toEqual({ [V3]: ['grosse'], [V1]: ['apero', 'monte', 'grosse'] })
  })

  it('base illisible : vibes vaut {}', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    const state = await getGameCatalogState()
    expect(state.vibes).toEqual({})
    expect(state.vibes).not.toBe(EMPTY_GAME_CATALOG.vibes)
  })
})

// Un candidat que le code laisse hors de la liste par défaut (Pyramide, Dégaine) et un jeu de la liste.
const ADDED = SOIREE_CANDIDATE_IDS.find((id) => !SOIREE_GAME_IDS.includes(id))!
const IN_LIST = SOIREE_GAME_IDS[0]
const onlineOnlyId = GAMES.find((g) => !g.hidden && g.onlineOnly)!.id

describe('getStaffSoireeGames', () => {
  it('lit la clé games.soiree de SiteSetting, en écartant ce qui égale le défaut', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({ [ADDED]: true, [IN_LIST]: true, nope: true, [onlineOnlyId]: true }),
    })
    expect(await getStaffSoireeGames()).toEqual({ [ADDED]: true })
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'games.soiree' } })
  })

  it('base illisible : {}, sans lever', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect(await getStaffSoireeGames()).toEqual({})
  })
})

describe('setGameInSoiree', () => {
  it('ajoute un candidat hors liste : la valeur true est stockée', async () => {
    const rows = storeSettings()
    expect(await setGameInSoiree(ADDED, true)).toEqual({ soiree: { [ADDED]: true }, changed: true })
    expect(JSON.parse(rows.get(SOIREE_SETTING_KEY)!)).toEqual({ [ADDED]: true })
    expect(SOIREE_SETTING_KEY).toBe('games.soiree')
  })

  it('sort un jeu de la liste : la valeur false est stockée', async () => {
    const rows = storeSettings()
    expect(await setGameInSoiree(IN_LIST, false)).toEqual({ soiree: { [IN_LIST]: false }, changed: true })
    expect(JSON.parse(rows.get(SOIREE_SETTING_KEY)!)).toEqual({ [IN_LIST]: false })
  })

  it('revenir au défaut supprime l’entrée, sans toucher aux autres', async () => {
    const rows = storeSettings({ [SOIREE_SETTING_KEY]: JSON.stringify({ [ADDED]: true, [IN_LIST]: false }) })
    expect(await setGameInSoiree(ADDED, false)).toEqual({ soiree: { [IN_LIST]: false }, changed: true })
    expect(JSON.parse(rows.get(SOIREE_SETTING_KEY)!)).toEqual({ [IN_LIST]: false })
    expect((await setGameInSoiree(IN_LIST, true)).soiree).toEqual({})
    expect(JSON.parse(rows.get(SOIREE_SETTING_KEY)!)).toEqual({})
  })

  it('un réglage déjà au bon état ne change rien et n’écrit rien', async () => {
    storeSettings()
    expect(await setGameInSoiree(IN_LIST, true)).toEqual({ soiree: {}, changed: false })
    expect(await setGameInSoiree(ADDED, false)).toEqual({ soiree: {}, changed: false })
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuse un jeu inconnu, retiré du code, en ligne uniquement, ou une valeur qui n’est pas un booléen', async () => {
    for (const id of ['jeu-inexistant', retired, onlineOnlyId]) {
      await expect(setGameInSoiree(id, true), id).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    for (const on of ['true', 1, null, undefined]) {
      await expect(setGameInSoiree(ADDED, on as never), String(on)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('part de la valeur stockée, pas du cache : deux écritures simultanées gardent les deux', async () => {
    const rows = storeSettings()
    const read = prismaMock.siteSetting.findUnique.getMockImplementation()!
    prismaMock.siteSetting.findUnique.mockImplementation(async (args: { where: { key: string } }) => {
      const value = await read(args)
      await new Promise((resolve) => setTimeout(resolve, 5))
      return value
    })
    const pending = Promise.all([setGameInSoiree(ADDED, true), setGameInSoiree(IN_LIST, false)])
    await vi.advanceTimersByTimeAsync(100)
    await pending
    expect(JSON.parse(rows.get(SOIREE_SETTING_KEY)!)).toEqual({ [ADDED]: true, [IN_LIST]: false })
  })

  it('laisse remonter une panne d’écriture ; la valeur écrite sert de repli si la relecture échoue', async () => {
    storeSettings()
    prismaMock.siteSetting.upsert.mockRejectedValueOnce(new Error('locked'))
    await expect(setGameInSoiree(ADDED, true)).rejects.toThrow('locked')

    await setGameInSoiree(ADDED, true)
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect(await getStaffSoireeGames()).toEqual({ [ADDED]: true })
  })

  it('l’état du catalogue est relu tout de suite', async () => {
    storeSettings()
    expect((await getGameCatalogState()).soiree).toEqual({})
    await setGameInSoiree(ADDED, true)
    expect((await getGameCatalogState()).soiree).toEqual({ [ADDED]: true })
  })
})

describe('getStaffFeaturedGameIds', () => {
  it('lit la clé games.featured de SiteSetting, dans l’ordre stocké', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([C, 'nope', A, C]) })
    expect(await getStaffFeaturedGameIds()).toEqual([C, A])
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'games.featured' } })
  })

  it('base illisible : [], sans lever', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect(await getStaffFeaturedGameIds()).toEqual([])
  })
})

describe('setGameFeatured', () => {
  it('ajoute en fin de liste, dans l’ordre de mise à la une', async () => {
    const rows = storeSettings()
    expect(await setGameFeatured(C, true)).toEqual({ featured: [C], changed: true })
    expect(await setGameFeatured(A, true)).toEqual({ featured: [C, A], changed: true })
    expect(JSON.parse(rows.get(FEATURED_SETTING_KEY)!)).toEqual([C, A])
    expect(FEATURED_SETTING_KEY).toBe('games.featured')
  })

  it('retire un jeu sans bousculer l’ordre des autres', async () => {
    const rows = storeSettings({ [FEATURED_SETTING_KEY]: JSON.stringify([C, A, B]) })
    expect(await setGameFeatured(A, false)).toEqual({ featured: [C, B], changed: true })
    expect(JSON.parse(rows.get(FEATURED_SETTING_KEY)!)).toEqual([C, B])
  })

  it('un jeu déjà à la une garde sa place ; retirer un absent ne change rien ; rien n’est écrit', async () => {
    storeSettings({ [FEATURED_SETTING_KEY]: JSON.stringify([C, A]) })
    expect(await setGameFeatured(C, true)).toEqual({ featured: [C, A], changed: false })
    expect(await setGameFeatured(B, false)).toEqual({ featured: [C, A], changed: false })
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it(`limite de ${FEATURED_LIMIT} : GameFeaturedLimitError au-delà, mais retirer puis ajouter passe`, async () => {
    const full = STAFF_TOGGLEABLE_GAME_IDS.slice(0, FEATURED_LIMIT)
    const extra = STAFF_TOGGLEABLE_GAME_IDS[FEATURED_LIMIT]
    const rows = storeSettings({ [FEATURED_SETTING_KEY]: JSON.stringify(full) })

    await expect(setGameFeatured(extra, true)).rejects.toBeInstanceOf(GameFeaturedLimitError)
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
    // Un jeu déjà à la une ne compte pas comme un ajout.
    expect((await setGameFeatured(full[0], true)).changed).toBe(false)

    await setGameFeatured(full[0], false)
    expect((await setGameFeatured(extra, true)).featured).toEqual([...full.slice(1), extra])
    expect(JSON.parse(rows.get(FEATURED_SETTING_KEY)!)).toEqual([...full.slice(1), extra])
  })

  it('refuse un jeu inconnu ou retiré du code, ou une valeur qui n’est pas un booléen', async () => {
    for (const id of ['jeu-inexistant', retired]) {
      await expect(setGameFeatured(id, true), id).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    for (const on of ['true', 1, null, undefined]) {
      await expect(setGameFeatured(A, on as never), String(on)).rejects.toBeInstanceOf(GameNotToggleableError)
    }
    expect(prismaMock.siteSetting.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
  })

  it('deux ajouts simultanés gardent les deux, dans l’ordre d’arrivée', async () => {
    const rows = storeSettings()
    const read = prismaMock.siteSetting.findUnique.getMockImplementation()!
    prismaMock.siteSetting.findUnique.mockImplementation(async (args: { where: { key: string } }) => {
      const value = await read(args)
      await new Promise((resolve) => setTimeout(resolve, 5))
      return value
    })
    const pending = Promise.all([setGameFeatured(B, true), setGameFeatured(A, true)])
    await vi.advanceTimersByTimeAsync(100)
    await pending
    expect(JSON.parse(rows.get(FEATURED_SETTING_KEY)!)).toEqual([B, A])
  })

  it('laisse remonter une panne d’écriture ; la valeur écrite sert de repli si la relecture échoue', async () => {
    storeSettings()
    prismaMock.siteSetting.upsert.mockRejectedValueOnce(new Error('locked'))
    await expect(setGameFeatured(A, true)).rejects.toThrow('locked')

    await setGameFeatured(A, true)
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    expect(await getStaffFeaturedGameIds()).toEqual([A])
  })

  it('l’état du catalogue est relu tout de suite', async () => {
    storeSettings()
    expect((await getGameCatalogState()).featured).toEqual([])
    await setGameFeatured(B, true)
    expect((await getGameCatalogState()).featured).toEqual([B])
  })

  it('base illisible : l’état vaut soiree {} et featured []', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('down'))
    const state = await getGameCatalogState()
    expect(state.soiree).toEqual({})
    expect(state.featured).toEqual([])
    expect(state.soiree).not.toBe(EMPTY_GAME_CATALOG.soiree)
    expect(state.featured).not.toBe(EMPTY_GAME_CATALOG.featured)
  })
})
