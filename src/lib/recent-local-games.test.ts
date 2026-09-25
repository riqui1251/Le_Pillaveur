import { afterEach, describe, expect, it, vi } from 'vitest'

import { GAMES } from './games'
import {
  RECENT_LOCAL_GAMES_KEY,
  RECENT_LOCAL_GAMES_MAX,
  localGameIdFromPath,
  parseRecentLocalGames,
  pushRecentLocalGame,
  readRecentLocalGames,
  recordRecentLocalGame,
} from './recent-local-games'

// Jeux tirés du registre plutôt qu'écrits en dur : publier ou masquer un jeu
// ne doit pas casser ces tests, seulement changer les exemples.
const LOCAL = GAMES.filter((g) => !g.hidden && !g.onlineOnly)
const ONLINE_ONLY = GAMES.find((g) => g.onlineOnly && !g.hidden)
const HIDDEN = GAMES.find((g) => g.hidden)
const [A, B, C, D] = LOCAL.map((g) => g.id)

describe('registre de test', () => {
  it('offre assez de jeux locaux publiés pour les exemples', () => {
    expect(LOCAL.length).toBeGreaterThan(RECENT_LOCAL_GAMES_MAX)
    expect(ONLINE_ONLY).toBeDefined()
    expect(HIDDEN).toBeDefined()
  })
})

describe('localGameIdFromPath', () => {
  it('reconnaît la page exacte d’un jeu local publié', () => {
    expect(localGameIdFromPath(LOCAL[0].path)).toBe(LOCAL[0].id)
  })

  it('ignore les jeux en ligne uniquement et les jeux masqués', () => {
    expect(localGameIdFromPath(ONLINE_ONLY!.path)).toBeNull()
    expect(localGameIdFromPath(HIDDEN!.path)).toBeNull()
  })

  it('ignore tout ce qui n’est pas le chemin exact d’un jeu', () => {
    expect(localGameIdFromPath(`${LOCAL[0].path}/`)).toBeNull()
    expect(localGameIdFromPath(`${LOCAL[0].path}/regles`)).toBeNull()
    expect(localGameIdFromPath('/jeux')).toBeNull()
    expect(localGameIdFromPath('')).toBeNull()
    expect(localGameIdFromPath(null)).toBeNull()
    expect(localGameIdFromPath(undefined)).toBeNull()
  })
})

describe('parseRecentLocalGames', () => {
  it('rend une liste vide pour une absence, du JSON illisible ou autre chose qu’un tableau', () => {
    expect(parseRecentLocalGames(null)).toEqual([])
    expect(parseRecentLocalGames('')).toEqual([])
    expect(parseRecentLocalGames('{pas du json')).toEqual([])
    expect(parseRecentLocalGames(JSON.stringify({ id: A }))).toEqual([])
    expect(parseRecentLocalGames(JSON.stringify(A))).toEqual([])
  })

  it('écarte les inconnus, les doublons, les non-chaînes et les jeux non locaux', () => {
    const raw = JSON.stringify([A, 'jeu-disparu', A, 42, null, ONLINE_ONLY!.id, HIDDEN!.id, B])
    expect(parseRecentLocalGames(raw)).toEqual([A, B])
  })

  it('borne la liste au maximum affiché', () => {
    expect(parseRecentLocalGames(JSON.stringify([A, B, C, D]))).toEqual([A, B, C])
  })
})

describe('pushRecentLocalGame', () => {
  it('place le jeu lancé en tête', () => {
    expect(pushRecentLocalGame([A, B], C)).toEqual([C, A, B])
  })

  it('remonte un jeu déjà présent sans le dupliquer', () => {
    expect(pushRecentLocalGame([A, B, C], C)).toEqual([C, A, B])
  })

  it('fait tomber le plus ancien au-delà du maximum', () => {
    expect(pushRecentLocalGame([A, B, C], D)).toEqual([D, A, B])
  })

  it('laisse la liste intacte pour un jeu non éligible', () => {
    expect(pushRecentLocalGame([A, B], ONLINE_ONLY!.id)).toEqual([A, B])
    expect(pushRecentLocalGame([A, B], HIDDEN!.id)).toEqual([A, B])
    expect(pushRecentLocalGame([A, B], 'jeu-disparu')).toEqual([A, B])
  })

  it('ne modifie pas la liste reçue', () => {
    const list = [A, B]
    pushRecentLocalGame(list, C)
    expect(list).toEqual([A, B])
  })
})

/** localStorage minimal, avec un compteur d'écritures. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    writes: 0,
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null
    },
    setItem(key: string, value: string) {
      this.writes += 1
      data.set(key, value)
    },
    removeItem(key: string) {
      data.delete(key)
    },
  }
}

describe('stockage de l’appareil', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('n’écrit ni ne lit rien côté serveur', () => {
    expect(readRecentLocalGames()).toEqual([])
    expect(() => recordRecentLocalGame(A)).not.toThrow()
  })

  it('enregistre puis relit les derniers jeux, le plus récent en tête', () => {
    const storage = fakeStorage()
    vi.stubGlobal('window', { localStorage: storage })
    recordRecentLocalGame(A)
    recordRecentLocalGame(B)
    recordRecentLocalGame(A)
    expect(readRecentLocalGames()).toEqual([A, B])
    expect(JSON.parse(storage.getItem(RECENT_LOCAL_GAMES_KEY)!)).toEqual([A, B])
  })

  it('ne réécrit pas quand le jeu est déjà en tête', () => {
    const storage = fakeStorage({ [RECENT_LOCAL_GAMES_KEY]: JSON.stringify([A, B]) })
    vi.stubGlobal('window', { localStorage: storage })
    recordRecentLocalGame(A)
    expect(storage.writes).toBe(0)
  })

  it('n’enregistre pas un jeu en ligne uniquement', () => {
    const storage = fakeStorage()
    vi.stubGlobal('window', { localStorage: storage })
    recordRecentLocalGame(ONLINE_ONLY!.id)
    expect(storage.writes).toBe(0)
    expect(readRecentLocalGames()).toEqual([])
  })

  it('ne stocke que des identifiants de jeu', () => {
    const storage = fakeStorage()
    vi.stubGlobal('window', { localStorage: storage })
    recordRecentLocalGame(A)
    const stored = JSON.parse(storage.getItem(RECENT_LOCAL_GAMES_KEY)!) as unknown[]
    expect(stored.every((id) => typeof id === 'string' && LOCAL.some((g) => g.id === id))).toBe(true)
  })

  it('survit à un stockage qui refuse lecture et écriture', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem() {
          throw new Error('SecurityError')
        },
        setItem() {
          throw new Error('QuotaExceededError')
        },
      },
    })
    expect(readRecentLocalGames()).toEqual([])
    expect(() => recordRecentLocalGame(A)).not.toThrow()
  })
})
