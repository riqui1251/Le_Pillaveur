import { describe, expect, it, vi } from 'vitest'
import { EMPTY_GAME_CATALOG } from '@/lib/game-catalog'
import { GAME_CATALOG_CACHE_KEY, GAME_CATALOG_MAX_AGE_MS, GAME_CATALOG_RETRY_MS, createGameCatalogStore } from './useGameCatalog'

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

const SERVER_STATE = { hiddenIds: ['plinko'], popular: { local: ['pmu', 'hi-lo'], online: ['imposteur'] } }

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
