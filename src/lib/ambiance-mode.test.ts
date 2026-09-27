import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AMBIANCE_STORAGE_KEY,
  parseRequestedAmbianceMode,
  readLocalAmbianceMode,
  writeLocalAmbianceMode,
} from './ambiance-mode'

/**
 * Ambiance de l'appareil. Décision du propriétaire (politique alcool de Google
 * Play) : DANS L'APP seulement, premier lancement « Sans alcool » ; l'alcool y
 * reste accessible par un choix explicite. Le site web ne change pas.
 */

/** Stockage minimal en mémoire, ou qui refuse tout (navigation privée, quota). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

const refusedStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
}

/** Page du site (web) ou de la coquille Capacitor (app), avec son stockage. */
function stubPage({ app, storage }: { app: boolean; storage: unknown }) {
  vi.stubGlobal('window', {
    localStorage: storage,
    dispatchEvent: vi.fn(),
    ...(app ? { Capacitor: { isNativePlatform: () => true } } : {}),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readLocalAmbianceMode', () => {
  it('hors navigateur (rendu serveur) : alcool, comme le premier rendu', () => {
    expect(readLocalAmbianceMode()).toBe('alcool')
  })

  it('site web sans choix mémorisé : alcool, inchangé', () => {
    stubPage({ app: false, storage: memoryStorage() })
    expect(readLocalAmbianceMode()).toBe('alcool')
  })

  it('app sans choix mémorisé : Sans alcool au premier lancement', () => {
    stubPage({ app: true, storage: memoryStorage() })
    expect(readLocalAmbianceMode()).toBe('soft')
  })

  it('app : un choix explicite est respecté, alcool compris', () => {
    stubPage({ app: true, storage: memoryStorage({ [AMBIANCE_STORAGE_KEY]: 'alcool' }) })
    expect(readLocalAmbianceMode()).toBe('alcool')

    stubPage({ app: true, storage: memoryStorage({ [AMBIANCE_STORAGE_KEY]: 'soft' }) })
    expect(readLocalAmbianceMode()).toBe('soft')
  })

  it('site web : le choix « Sans alcool » mémorisé est relu', () => {
    stubPage({ app: false, storage: memoryStorage({ [AMBIANCE_STORAGE_KEY]: 'soft' }) })
    expect(readLocalAmbianceMode()).toBe('soft')
  })

  it('valeur inconnue en stockage : alcool, comme avant (ce n’est pas une clé absente)', () => {
    stubPage({ app: false, storage: memoryStorage({ [AMBIANCE_STORAGE_KEY]: 'bière' }) })
    expect(readLocalAmbianceMode()).toBe('alcool')

    stubPage({ app: true, storage: memoryStorage({ [AMBIANCE_STORAGE_KEY]: 'bière' }) })
    expect(readLocalAmbianceMode()).toBe('alcool')
  })

  it('stockage refusé : défaut du support (alcool sur le web, Sans alcool dans l’app)', () => {
    stubPage({ app: false, storage: refusedStorage })
    expect(readLocalAmbianceMode()).toBe('alcool')

    stubPage({ app: true, storage: refusedStorage })
    expect(readLocalAmbianceMode()).toBe('soft')
  })

  it('pont Capacitor présent mais hors plateforme native : traité comme le web', () => {
    vi.stubGlobal('window', {
      localStorage: memoryStorage(),
      Capacitor: { isNativePlatform: () => false },
    })
    expect(readLocalAmbianceMode()).toBe('alcool')
  })
})

describe('writeLocalAmbianceMode', () => {
  it('app : choisir l’alcool l’inscrit, et il survit à la relecture', () => {
    const storage = memoryStorage()
    stubPage({ app: true, storage })
    expect(readLocalAmbianceMode()).toBe('soft')

    writeLocalAmbianceMode('alcool')

    expect(storage.getItem(AMBIANCE_STORAGE_KEY)).toBe('alcool')
    expect(readLocalAmbianceMode()).toBe('alcool')
  })

  it('prévient la page même quand le stockage refuse', () => {
    stubPage({ app: false, storage: refusedStorage })
    writeLocalAmbianceMode('soft')
    const w = window as unknown as { dispatchEvent: ReturnType<typeof vi.fn> }
    expect(w.dispatchEvent).toHaveBeenCalledTimes(1)
  })
})

describe('parseRequestedAmbianceMode', () => {
  it('accepte les deux ambiances', () => {
    expect(parseRequestedAmbianceMode('soft')).toBe('soft')
    expect(parseRequestedAmbianceMode('alcool')).toBe('alcool')
  })

  it('ignore tout le reste (null : défaut du schéma)', () => {
    for (const value of [undefined, null, '', 'SOFT', ' soft', 'sans-alcool', 1, true, {}, ['soft']]) {
      expect(parseRequestedAmbianceMode(value)).toBeNull()
    }
  })
})
