import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_GAME_CATALOG, gameDifficulty, gameDrinkLevel, gameVibes } from '@/lib/game-catalog'
import { GAMES } from '@/lib/games'
import { SOIREE_CANDIDATE_IDS, SOIREE_GAME_IDS, soireeGameIdsWith } from '@/lib/soiree/catalog'
import {
  GAME_CATALOG_CACHE_KEY,
  GAME_CATALOG_MAX_AGE_MS,
  GAME_CATALOG_RETRY_MS,
  createGameCatalogStore,
  useFeaturedGameIds,
  useSoireeGameIds,
} from './useGameCatalog'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    data,
  }
}

const CODE_DRINK = (id: string) => GAMES.find((g) => g.id === id)!.drinkLevel
const OTHER_DRINK = CODE_DRINK('pmu') === 3 ? 1 : 3
const ADDED = SOIREE_CANDIDATE_IDS.find((id) => !SOIREE_GAME_IDS.includes(id))!
const CATEGORIES = [{ id: 'chaud', names: { fr: 'Chaud', en: 'Hot' }, gameIds: ['pmu', 'hi-lo'] }]
const SERVER_STATE = {
  hiddenIds: ['plinko'],
  difficulty: { pmu: 3 },
  drinkLevel: { pmu: OTHER_DRINK },
  categories: CATEGORIES,
  vibes: { pmu: ['grosse'] },
  soiree: { [ADDED]: true, 'hi-lo': false },
  featured: ['hi-lo', 'pmu'],
  popular: { local: ['pmu', 'hi-lo'], online: ['imposteur'] },
}

function setup(options: { stored?: unknown; fetchState?: (fresh: boolean) => Promise<unknown> } = {}) {
  let clock = 1_000
  const storage = memoryStorage(options.stored === undefined ? {} : { [GAME_CATALOG_CACHE_KEY]: JSON.stringify(options.stored) })
  const fetchState = vi.fn(options.fetchState ?? (async () => SERVER_STATE))
  const store = createGameCatalogStore({ fetchState, storage: () => storage, now: () => clock })
  return { store, storage, fetchState, advance: (ms: number) => (clock += ms) }
}

/**
 * Le catalogue réglé par l'équipe arrive du serveur mais doit s'afficher tout
 * de suite et hors ligne : copie de l'appareil d'abord, serveur ensuite, une
 * seule requête pour tous les écrans.
 */
describe('catalogue des jeux côté navigateur', () => {
  it('rien de gardé : l’état par défaut du code', () => {
    const { store } = setup()
    expect(store.getSnapshot()).toEqual({ state: EMPTY_GAME_CATALOG, source: 'default' })
  })

  it('montre la copie de l’appareil avant toute réponse', () => {
    const { store } = setup({ stored: SERVER_STATE })
    expect(store.getSnapshot()).toEqual({ state: SERVER_STATE, source: 'cache' })
  })

  it('une copie d’avant la difficulté reste lisible : difficulty vaut {}', () => {
    const { store } = setup({ stored: { hiddenIds: ['plinko'], popular: { local: [], online: [] } } })
    expect(store.getSnapshot().source).toBe('cache')
    expect(store.getSnapshot().state.difficulty).toEqual({})
  })

  it('une copie d’avant la liste de la soirée et la une reste lisible : soiree vaut {}, featured vaut []', () => {
    const { store } = setup({ stored: { hiddenIds: [], difficulty: {}, popular: { local: [], online: [] } } })
    expect(store.getSnapshot().source).toBe('cache')
    expect(store.getSnapshot().state.soiree).toEqual({})
    expect(store.getSnapshot().state.featured).toEqual([])
  })

  it('relit soiree et featured de la réponse du serveur, dans l’ordre de mise à la une', async () => {
    const { store } = setup()
    await store.refresh()
    const { soiree, featured } = store.getSnapshot().state
    expect(soiree).toEqual({ [ADDED]: true, 'hi-lo': false })
    expect(featured).toEqual(['hi-lo', 'pmu'])
    const ids = soireeGameIdsWith(soiree)
    expect(ids).toContain(ADDED)
    expect(ids).not.toContain('hi-lo')
  })

  it('une copie d’avant le barème et les catégories reste lisible : drinkLevel vaut {}, categories vaut []', () => {
    const { store } = setup({ stored: { hiddenIds: ['plinko'], difficulty: { pmu: 3 }, popular: { local: [], online: [] } } })
    expect(store.getSnapshot().source).toBe('cache')
    expect(store.getSnapshot().state.drinkLevel).toEqual({})
    expect(store.getSnapshot().state.categories).toEqual([])
  })

  it('le barème du serveur passe par gameDrinkLevel, comme useGameDrinkLevel', async () => {
    const { store } = setup()
    await store.refresh()
    const { drinkLevel } = store.getSnapshot().state
    expect(gameDrinkLevel('pmu', drinkLevel)).toBe(OTHER_DRINK)
    expect(gameDrinkLevel('hi-lo', drinkLevel)).toBe(CODE_DRINK('hi-lo'))
  })

  it('les catégories du serveur sont gardées dans l’ordre, sur l’appareil aussi', async () => {
    const { store, storage } = setup()
    await store.refresh()
    expect(store.getSnapshot().state.categories).toEqual(CATEGORIES)
    expect(JSON.parse(storage.data.get(GAME_CATALOG_CACHE_KEY) ?? 'null').categories).toEqual(CATEGORIES)

    const reopened = setup({ stored: JSON.parse(storage.data.get(GAME_CATALOG_CACHE_KEY)!) })
    expect(reopened.store.getSnapshot().state.categories).toEqual(CATEGORIES)
  })

  it('les ambiances du serveur passent par gameVibes, comme useGameVibes, et le défaut suit le niveau réglé', async () => {
    const { store, storage } = setup()
    await store.refresh()
    const { vibes, drinkLevel } = store.getSnapshot().state
    expect(gameVibes('pmu', vibes, drinkLevel)).toEqual(['grosse'])
    expect(gameVibes('hi-lo', vibes, drinkLevel)).toEqual(gameVibes('hi-lo', {}, {}))
    expect(JSON.parse(storage.data.get(GAME_CATALOG_CACHE_KEY) ?? 'null').vibes).toEqual({ pmu: ['grosse'] })
  })

  it('une copie d’avant les ambiances reste lisible : vibes vaut {}', () => {
    const { store } = setup({ stored: { hiddenIds: [], drinkLevel: { pmu: OTHER_DRINK }, popular: { local: [], online: [] } } })
    expect(store.getSnapshot().source).toBe('cache')
    expect(store.getSnapshot().state.vibes).toEqual({})
  })

  it('la difficulté du serveur passe par gameDifficulty, comme useGameDifficulty', async () => {
    const { store } = setup()
    await store.refresh()
    const { difficulty } = store.getSnapshot().state
    expect(gameDifficulty('pmu', difficulty)).toBe(3)
    expect(gameDifficulty('hi-lo', difficulty)).toBe(gameDifficulty('hi-lo', {}))
  })

  it('une copie abîmée ne cache rien', () => {
    const { store, storage } = setup()
    storage.data.set(GAME_CATALOG_CACHE_KEY, '{pas du json')
    expect(store.getSnapshot().source).toBe('default')
  })

  it('la réponse du serveur remplace la copie, la garde et prévient les écrans', async () => {
    const { store, storage } = setup({ stored: EMPTY_GAME_CATALOG })
    const listener = vi.fn()
    store.subscribe(listener)
    await store.refresh()
    expect(store.getSnapshot()).toEqual({ state: SERVER_STATE, source: 'server' })
    expect(JSON.parse(storage.data.get(GAME_CATALOG_CACHE_KEY) ?? 'null')).toEqual(SERVER_STATE)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('hors ligne ou réponse illisible : la copie reste affichée', async () => {
    const offline = setup({ stored: SERVER_STATE, fetchState: async () => Promise.reject(new Error('offline')) })
    await offline.store.refresh()
    expect(offline.store.getSnapshot()).toEqual({ state: SERVER_STATE, source: 'cache' })

    const garbled = setup({ stored: SERVER_STATE, fetchState: async () => ({ hiddenIds: 'plinko' }) })
    await garbled.store.refresh()
    expect(garbled.store.getSnapshot().source).toBe('cache')
  })

  it('plusieurs écrans montés ensemble partagent une requête, puis plus rien avant l’échéance', async () => {
    const { store, fetchState, advance } = setup()
    store.ensureFresh()
    store.ensureFresh()
    await store.refresh()
    expect(fetchState).toHaveBeenCalledTimes(1)

    advance(GAME_CATALOG_MAX_AGE_MS - 1)
    store.ensureFresh()
    expect(fetchState).toHaveBeenCalledTimes(1)

    advance(1)
    store.ensureFresh()
    expect(fetchState).toHaveBeenCalledTimes(2)
  })

  it('après un échec, redemande au bout du délai court', async () => {
    const { store, fetchState, advance } = setup({ fetchState: async () => Promise.reject(new Error('offline')) })
    await store.refresh()
    store.ensureFresh()
    expect(fetchState).toHaveBeenCalledTimes(1)
    advance(GAME_CATALOG_RETRY_MS)
    store.ensureFresh()
    expect(fetchState).toHaveBeenCalledTimes(2)
  })

  it('un rafraîchissement forcé contourne le cache HTTP même avec une requête en vol', async () => {
    const { store, fetchState } = setup()
    store.ensureFresh()
    await store.refresh(true)
    expect(fetchState).toHaveBeenNthCalledWith(1, false)
    expect(fetchState).toHaveBeenNthCalledWith(2, true)
  })
})

describe('useSoireeGameIds et useFeaturedGameIds', () => {
  const render = (hook: () => unknown) =>
    renderToStaticMarkup(createElement(() => createElement('i', { 'data-v': JSON.stringify(hook()) })))

  it('sans réponse lue : la liste du code, et aucun jeu à la une', () => {
    expect(render(useSoireeGameIds)).toContain(JSON.stringify(SOIREE_GAME_IDS).replace(/"/g, '&quot;'))
    expect(render(useFeaturedGameIds)).toContain('[]')
  })
})
