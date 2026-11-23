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
  GameNotToggleableError,
  HIDDEN_GAMES_SETTING_KEY,
  HIDDEN_IDS_TTL_MS,
  PLAY_COUNTS_TTL_MS,
  getGameCatalogState,
  getGamePlayCounts30d,
  getStaffHiddenGameIds,
  invalidateGameCatalogCaches,
  isGameHiddenByStaff,
  setGameHidden,
} from './game-catalog-server'
import { STAFF_TOGGLEABLE_GAME_IDS } from './game-catalog'
import { GAMES } from './games'

const [A, B, C] = STAFF_TOGGLEABLE_GAME_IDS
const retired = GAMES.find((g) => g.hidden)!.id

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
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledTimes(1)
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
