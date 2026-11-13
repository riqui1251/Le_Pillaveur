import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COUPE_RULES_STORAGE_KEY,
  parseStoredCoupeOverrides,
  readCoupeOverrides,
  writeCoupeOverrides,
} from './custom-rules'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

const refusedStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('règles de la table gardées sur l’appareil', () => {
  it('vit dans la famille « lp-… » des mémoires de l’appareil', () => {
    expect(COUPE_RULES_STORAGE_KEY).toBe('lp-coupe-du-roi-rules')
  })

  it('contenu illisible ou étranger → aucune règle modifiée', () => {
    expect(parseStoredCoupeOverrides(null)).toEqual({})
    expect(parseStoredCoupeOverrides('')).toEqual({})
    expect(parseStoredCoupeOverrides('{pas du json')).toEqual({})
    expect(parseStoredCoupeOverrides('"texte"')).toEqual({})
    expect(parseStoredCoupeOverrides('[1,2]')).toEqual({})
    expect(parseStoredCoupeOverrides(JSON.stringify({ A: '  Cascade inversée ', X: 'inconnu', '7': '' }))).toEqual({
      A: 'Cascade inversée',
    })
  })

  it('écrit puis relit les règles nettoyées ; plus aucune règle → la clé disparaît', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })

    writeCoupeOverrides({ '5': ' Tout le monde chante ', '6': '   ' })
    expect(JSON.parse(storage.data.get(COUPE_RULES_STORAGE_KEY) ?? 'null')).toEqual({ '5': 'Tout le monde chante' })
    expect(readCoupeOverrides()).toEqual({ '5': 'Tout le monde chante' })

    writeCoupeOverrides({ '5': '  ' })
    expect(storage.data.has(COUPE_RULES_STORAGE_KEY)).toBe(false)
    expect(readCoupeOverrides()).toEqual({})
  })

  it('stockage refusé (navigation privée, quota) : rien ne lève', () => {
    vi.stubGlobal('window', { localStorage: refusedStorage })
    expect(readCoupeOverrides()).toEqual({})
    expect(() => writeCoupeOverrides({ A: 'Cascade' })).not.toThrow()
    expect(() => writeCoupeOverrides({})).not.toThrow()
  })

  it('côté serveur (pas de window) : lecture vide, écriture sans effet', () => {
    expect(readCoupeOverrides()).toEqual({})
    expect(() => writeCoupeOverrides({ A: 'Cascade' })).not.toThrow()
  })
})
