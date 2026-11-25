import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GAMES } from './games'
import type { LocalDrinksReport } from './local-game-beacon'
import {
  DRINK_TALLY_MAX_WAIT_MS,
  DRINK_TALLY_ORPHAN_MAX_AGE_MS,
  DRINK_TALLY_SETTLE_MS,
  DRINK_TALLY_STORAGE_KEY,
  createDrinkTally,
} from './local-drink-tally'

const SKIP = { tally: 'skip' } as const
const CORRECTION = { tally: 'correction' } as const

/**
 * Cumul anonyme des gorgées des parties locales, côté téléphone : ce qui
 * compte (même règle que updatePlayerStats, sauf partie écartée), quand ça
 * part (calme de deux minutes, dix au plus, page cachée, partie neuve), ce
 * qui ne part jamais (« Sans alcool », jeu en ligne, gorgées sans
 * participation hors correction, solde d'une partie abandonnée), et ce qui
 * part (totaux de la table, rien d'un joueur).
 */

const LOCAL = GAMES.filter((g) => !g.hidden && !g.onlineOnly)
const [A, B] = LOCAL.map((g) => g.id)
const ONLINE_ONLY = GAMES.find((g) => g.onlineOnly)!

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    map,
  }
}

function setup(options: { soft?: boolean; storage?: ReturnType<typeof memoryStorage> | null } = {}) {
  const sent: LocalDrinksReport[] = []
  const state = { soft: options.soft ?? false }
  const storage = options.storage === undefined ? memoryStorage() : options.storage
  const tally = createDrinkTally({
    send: (report) => sent.push(report),
    isSoft: () => state.soft,
    storage: () => storage,
  })
  return { sent, tally, state, storage }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cumul d’une fin de partie', () => {
  it('les joueurs d’une même partie partent en UN relevé, après deux minutes de calme', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 4 })
    tally.note(A, { gamesPlayed: 1, totalDrinks: 0 })
    tally.note(A, { gamesPlayed: 1, totalDrinks: 7 })

    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS - 1)
    expect(sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 11, plays: 3 }])
    expect(Object.keys(sent[0]).sort()).toEqual(['drinks', 'event', 'gameId', 'plays'])

    vi.advanceTimersByTime(DRINK_TALLY_MAX_WAIT_MS)
    expect(sent).toHaveLength(1)
  })

  it('une statistique de plus relance l’attente : des gorgées arrivées après la partie partent avec elle', () => {
    const { sent, tally } = setup()
    // PMU en mode paris : la course compte la partie, le paiement suit.
    tally.note(A, { gamesPlayed: 1 })
    tally.note(A, { gamesPlayed: 1 })
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS - 1_000)
    tally.note(A, { totalDrinks: 6 })
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS - 1)
    expect(sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 6, plays: 2 }])
  })

  it('activité continue : tout part au plus dix minutes après la première statistique', () => {
    const { sent, tally } = setup()
    // Roue des gorgées : une partie par tour, un tour toutes les 30 s.
    for (let elapsed = 0; elapsed < DRINK_TALLY_MAX_WAIT_MS; elapsed += 30_000) {
      tally.note(A, { gamesPlayed: 1 })
      vi.advanceTimersByTime(30_000)
    }
    // 20 tours : un envoi, découpé en relevés de 15 participations au plus.
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 0, plays: 15 },
      { gameId: A, event: 'drinks', drinks: 0, plays: DRINK_TALLY_MAX_WAIT_MS / 30_000 - 15 },
    ])
  })

  it('plusieurs jeux : un relevé par jeu', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
    tally.note(B, { gamesPlayed: 1, totalDrinks: 5 })
    tally.note(A, { gamesPlayed: 1, totalDrinks: 3 })
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS)
    expect(sent).toHaveLength(2)
    expect(sent).toEqual(
      expect.arrayContaining([
        { gameId: A, event: 'drinks', drinks: 5, plays: 2 },
        { gameId: B, event: 'drinks', drinks: 5, plays: 1 },
      ])
    )
  })

  it('page cachée ou fermée (flush) : part tout de suite, sans doublon ensuite', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 3 })
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 3, plays: 1 }])
    vi.advanceTimersByTime(DRINK_TALLY_MAX_WAIT_MS)
    tally.flush()
    expect(sent).toHaveLength(1)
  })
})

describe('participations : la règle de updatePlayerStats', () => {
  it('gamesPlayed 0 ou absent : des gorgées sans partie, qui attendent la partie de ce jeu', () => {
    const { sent, tally } = setup()
    // Petit Buveur : les gorgées tour par tour, la partie comptée à la fin.
    tally.note(A, { totalDrinks: 2 })
    tally.note(A, { gamesPlayed: 0, totalDrinks: 3 })
    vi.advanceTimersByTime(DRINK_TALLY_MAX_WAIT_MS)
    tally.flush()
    expect(sent).toEqual([])

    tally.note(A, { gamesPlayed: 1 })
    tally.note(A, { gamesPlayed: 1 })
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS)
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 5, plays: 2 }])
  })

  it('des gorgées en attente pour un jeu ne partent pas avec la partie d’un autre', () => {
    const { sent, tally } = setup()
    tally.note(A, { totalDrinks: 4 })
    tally.note(B, { gamesPlayed: 1, totalDrinks: 1 })
    tally.flush()
    expect(sent).toEqual([{ gameId: B, event: 'drinks', drinks: 1, plays: 1 }])
  })

  it('une statistique sans partie ni gorgée (victoire seule) ne note rien', () => {
    const { sent, tally, storage } = setup()
    tally.note(A, { gamesPlayed: 0, totalDrinks: 0 })
    tally.note(A, {})
    expect(storage!.map.size).toBe(0)
    tally.flush()
    expect(sent).toEqual([])
  })

  it('gorgées négatives sans option : retranchées ; un solde négatif part à zéro gorgée', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 5 })
    tally.note(A, { totalDrinks: -2 })
    tally.flush()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 1 })
    tally.note(A, { totalDrinks: -4 })
    tally.flush()
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 3, plays: 1 },
      { gameId: A, event: 'drinks', drinks: 0, plays: 1 },
    ])
  })
})

describe('option « skip » : partie gardée par le téléphone, pas par le classement', () => {
  it('ni la participation ni les gorgées ne sont notées', () => {
    const { sent, tally, storage } = setup()
    // Purple quitté avant la première carte, 1220 avant le premier lancer, PMU libre.
    tally.note(A, { gamesPlayed: 1, totalDrinks: 0 }, SKIP)
    tally.note(A, { gamesPlayed: 1, totalDrinks: 3 }, SKIP)
    expect(storage!.map.size).toBe(0)
    tally.flush()
    expect(sent).toEqual([])
  })

  it('n’efface rien de ce qui attendait déjà', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 4 })
    tally.note(A, { gamesPlayed: 1 }, SKIP)
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 4, plays: 1 }])
  })
})

describe('option « correction » : gorgées arrivées après leur partie', () => {
  it('partie encore en attente : la correction part avec elle', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
    tally.note(A, { gamesPlayed: 1, totalDrinks: 1 })
    tally.note(A, { totalDrinks: 3 }, CORRECTION)
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS)
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 6, plays: 2 }])
  })

  it('partie déjà partie : la correction part seule, sans participation', () => {
    const { sent, tally, storage } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS)
    // Entracte du Mode Soirée, longtemps après la fin de la manche.
    tally.note(A, { totalDrinks: 3 }, CORRECTION)
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS)
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 2, plays: 1 },
      { gameId: A, event: 'drinks', drinks: 3, plays: 0 },
    ])
    expect(storage!.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
  })

  it('n’ajoute jamais de participation, même si on lui en passe une', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 2 }, CORRECTION)
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 2, plays: 0 }])
  })

  it('le « − » de l’entracte annule d’abord un « + » qui n’est pas encore parti', () => {
    const { sent, tally, storage } = setup()
    tally.note(A, { totalDrinks: 1 }, CORRECTION)
    tally.note(A, { totalDrinks: 1 }, CORRECTION)
    tally.note(A, { totalDrinks: -1 }, CORRECTION)
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 1, plays: 0 }])

    tally.note(A, { totalDrinks: 1 }, CORRECTION)
    tally.note(A, { totalDrinks: -1 }, CORRECTION)
    expect(storage!.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
    tally.flush()
    expect(sent).toHaveLength(1)
  })

  it('à la baisse : corrige la partie encore en attente, jamais en dessous de zéro', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 5 })
    tally.note(A, { totalDrinks: -2 }, CORRECTION)
    tally.flush()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
    tally.note(A, { totalDrinks: -10 }, CORRECTION)
    tally.flush()
    // Aucun solde négatif ne reste pour la partie suivante.
    tally.note(A, { gamesPlayed: 1, totalDrinks: 4 })
    tally.flush()
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 3, plays: 1 },
      { gameId: A, event: 'drinks', drinks: 0, plays: 1 },
      { gameId: A, event: 'drinks', drinks: 4, plays: 1 },
    ])
  })

  it('à la baisse, partie déjà partie : rien n’est envoyé ni gardé', () => {
    const { sent, tally, storage } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 5 })
    tally.flush()
    tally.note(A, { totalDrinks: -2 }, CORRECTION)
    expect(storage!.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
    tally.note(A, { gamesPlayed: 1, totalDrinks: 1 })
    tally.flush()
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 5, plays: 1 },
      { gameId: A, event: 'drinks', drinks: 1, plays: 1 },
    ])
  })

  it('les gorgées qui attendent leur partie (Petit Buveur) restent en attente, seule la correction part', () => {
    const { sent, tally } = setup()
    tally.note(A, { totalDrinks: 4 })
    tally.note(A, { totalDrinks: 2 }, CORRECTION)
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 2, plays: 0 }])
    tally.note(A, { gamesPlayed: 1 })
    tally.flush()
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 2, plays: 0 },
      { gameId: A, event: 'drinks', drinks: 4, plays: 1 },
    ])
  })
})

describe('partie neuve (begin) et âge des gorgées sans participation', () => {
  it('une partie neuve jette les gorgées sans participation d’une partie abandonnée', () => {
    const { sent, tally, storage } = setup()
    // Petit Buveur abandonné en route : des gorgées, pas de victoire.
    tally.note(A, { totalDrinks: 6 })
    tally.begin(A)
    expect(storage!.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
    tally.note(A, { totalDrinks: 1 })
    tally.note(A, { gamesPlayed: 1 })
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 1, plays: 1 }])
  })

  it('une partie neuve envoie tout de suite la partie complète qui attendait : la suivante ne s’y mêle pas', () => {
    const { sent, tally } = setup()
    tally.note(A, { totalDrinks: 3 })
    tally.note(A, { gamesPlayed: 1 })
    tally.begin(A)
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 3, plays: 1 }])
    // « Rejouer », puis la revanche est abandonnée : ses gorgées attendent.
    tally.note(A, { totalDrinks: 5 })
    tally.flush()
    expect(sent).toHaveLength(1)
  })

  it('ne touche qu’au jeu qui recommence', () => {
    const { sent, tally } = setup()
    tally.note(B, { totalDrinks: 5 })
    tally.begin(A)
    tally.note(B, { gamesPlayed: 1 })
    tally.flush()
    expect(sent).toEqual([{ gameId: B, event: 'drinks', drinks: 5, plays: 1 }])
  })

  it('des gorgées sans participation ne survivent pas à douze heures', () => {
    const { sent, tally, storage } = setup()
    tally.note(A, { totalDrinks: 6 })
    vi.advanceTimersByTime(DRINK_TALLY_ORPHAN_MAX_AGE_MS - 1)
    tally.note(B, { totalDrinks: 2 })
    tally.note(B, { gamesPlayed: 1 })
    tally.flush()
    // Encore là juste avant l'échéance.
    expect(JSON.parse(storage!.map.get(DRINK_TALLY_STORAGE_KEY)!)).toEqual({
      [A]: { drinks: 6, plays: 0, loose: 0, at: expect.any(Number) },
    })
    vi.advanceTimersByTime(2)
    tally.flush()
    expect(storage!.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
    tally.note(A, { gamesPlayed: 1 })
    tally.flush()
    expect(sent).toEqual([
      { gameId: B, event: 'drinks', drinks: 2, plays: 1 },
      { gameId: A, event: 'drinks', drinks: 0, plays: 1 },
    ])
  })

  it('une participation trop tardive ne récupère pas un solde périmé', () => {
    const { sent, tally } = setup()
    tally.note(A, { totalDrinks: 6 })
    vi.advanceTimersByTime(DRINK_TALLY_ORPHAN_MAX_AGE_MS + 1)
    tally.note(A, { gamesPlayed: 1, totalDrinks: 1 })
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 1, plays: 1 }])
  })
})

describe('jamais compté', () => {
  it('ambiance « Sans alcool » : ni gorgée ni partie, même si l’ambiance revient ensuite', () => {
    const { sent, tally, state } = setup({ soft: true })
    tally.note(A, { gamesPlayed: 1, totalDrinks: 4 })
    tally.note(A, { gamesPlayed: 1 })
    state.soft = false
    tally.flush()
    vi.advanceTimersByTime(DRINK_TALLY_MAX_WAIT_MS)
    expect(sent).toEqual([])
  })

  it('jeu en ligne uniquement ou inconnu', () => {
    const { sent, tally } = setup()
    tally.note(ONLINE_ONLY.id, { gamesPlayed: 1, totalDrinks: 4 })
    tally.note('jeu-inconnu', { gamesPlayed: 1, totalDrinks: 4 })
    tally.flush()
    expect(sent).toEqual([])
  })
})

describe('bornes de la route', () => {
  it('plus de 15 participations : découpé en relevés de 15 au plus, sans perdre une gorgée', () => {
    const { sent, tally } = setup()
    for (let i = 0; i < 35; i += 1) tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
    tally.flush()
    expect(sent.map((r) => r.plays)).toEqual([15, 15, 5])
    expect(sent.reduce((sum, r) => sum + r.drinks, 0)).toBe(70)
    for (const report of sent) expect(report.drinks).toBeLessThanOrEqual(20 * report.plays)
  })

  it('plus de 20 gorgées par participation : écrêté, l’excédent abandonné', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 90 })
    tally.note(A, { gamesPlayed: 1, totalDrinks: 0 })
    tally.flush()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 1 })
    tally.flush()
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 40, plays: 2 },
      { gameId: A, event: 'drinks', drinks: 1, plays: 1 },
    ])
  })

  it('une correction sans participation : écrêtée à 300 gorgées (20 × 15)', () => {
    const { sent, tally } = setup()
    tally.note(A, { totalDrinks: 450 }, CORRECTION)
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 300, plays: 0 }])
  })

  it('gorgées non entières : arrondies à l’envoi ; valeur non finie ignorée', () => {
    const { sent, tally } = setup()
    tally.note(A, { gamesPlayed: 1, totalDrinks: 1.4 })
    tally.note(A, { gamesPlayed: 1, totalDrinks: 1.4 })
    tally.note(A, { gamesPlayed: 1, totalDrinks: Number.NaN })
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 3, plays: 3 }])
  })
})

describe('stockage de l’appareil', () => {
  it('le cumul survit à un onglet tué : la page suivante l’envoie avec sa partie', () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    first.tally.note(A, { totalDrinks: 6 })
    first.tally.note(A, { gamesPlayed: 1 })
    expect(JSON.parse(storage.map.get(DRINK_TALLY_STORAGE_KEY)!)).toEqual({
      [A]: { drinks: 6, plays: 1, loose: 0, at: expect.any(Number) },
    })

    // Onglet tué avant l'envoi : une nouvelle page repart du stockage.
    vi.clearAllTimers()
    const next = setup({ storage })
    next.tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
    next.tally.flush()
    expect(first.sent).toEqual([])
    expect(next.sent).toEqual([{ gameId: A, event: 'drinks', drinks: 8, plays: 2 }])
    expect(storage.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
  })

  it('deux onglets ne renvoient pas le même cumul', () => {
    const storage = memoryStorage()
    const one = setup({ storage })
    const two = setup({ storage })
    one.tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
    one.tally.flush()
    two.tally.flush()
    expect(one.sent).toHaveLength(1)
    expect(two.sent).toEqual([])
  })

  it('stockage illisible ou bricolé : entrées détraquées jetées, jamais une rafale de relevés', () => {
    const storage = memoryStorage({
      [DRINK_TALLY_STORAGE_KEY]: JSON.stringify({
        [A]: { drinks: 4, plays: 1 },
        [B]: { drinks: 10, plays: 1_000_000 },
        [ONLINE_ONLY.id]: { drinks: 4, plays: 2 },
        'jeu-inconnu': { drinks: 4, plays: 2 },
      }),
    })
    const { sent, tally } = setup({ storage })
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 4, plays: 1 }])

    storage.map.set(DRINK_TALLY_STORAGE_KEY, '{pas du json')
    expect(() => tally.note(A, { gamesPlayed: 1 })).not.toThrow()
    tally.flush()
    expect(sent).toEqual([
      { gameId: A, event: 'drinks', drinks: 4, plays: 1 },
      { gameId: A, event: 'drinks', drinks: 0, plays: 1 },
    ])
  })

  it('sans stockage (navigation privée) : le cumul reste en mémoire', () => {
    const { sent, tally } = setup({ storage: null })
    tally.note(A, { totalDrinks: 3 })
    tally.note(A, { gamesPlayed: 1 })
    tally.flush()
    expect(sent).toEqual([{ gameId: A, event: 'drinks', drinks: 3, plays: 1 }])
  })
})

it('un envoyeur qui lève ne remonte jamais jusqu’à la fin de partie', () => {
  const tally = createDrinkTally({
    send: () => {
      throw new Error('réseau')
    },
    isSoft: () => false,
    storage: () => null,
  })
  tally.note(A, { gamesPlayed: 1, totalDrinks: 2 })
  expect(() => tally.flush()).not.toThrow()
  expect(() => vi.advanceTimersByTime(DRINK_TALLY_MAX_WAIT_MS)).not.toThrow()
})

/**
 * Instance de la page, dans une page simulée : module rechargé à chaque test
 * pour repartir d'une mémoire vierge.
 */
describe('depuis la page', () => {
  async function loadInPage(options: { ambianceAttribute?: string | null; storedAmbiance?: string } = {}) {
    vi.resetModules()
    const storage = memoryStorage(options.storedAmbiance ? { 'lp-ambiance-mode': options.storedAmbiance } : {})
    const win = Object.assign(new EventTarget(), { localStorage: storage, location: { pathname: '/fr/soiree' } })
    const doc = Object.assign(new EventTarget(), {
      visibilityState: 'visible' as DocumentVisibilityState,
      documentElement: { getAttribute: (name: string) => (name === 'data-ambiance' ? options.ambianceAttribute ?? null : null) },
    })
    const sendBeacon = vi.fn((_url: string, _body: Blob) => true)
    vi.stubGlobal('window', win)
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', { sendBeacon, userAgent: 'test' })
    vi.stubGlobal('fetch', vi.fn())
    const mod = await import('./local-drink-tally')
    return { mod, win, doc, sendBeacon, storage }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('part en beacon vers la route après le calme, corps JSON des quatre champs', async () => {
    const { mod, sendBeacon } = await loadInPage()
    mod.noteLocalGameDrinks(A, { gamesPlayed: 1, totalDrinks: 3 })
    mod.noteLocalGameDrinks(A, { gamesPlayed: 1, totalDrinks: 2 })
    expect(sendBeacon).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS)
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0]
    expect(url).toBe('/api/analytics/local-game')
    expect(JSON.parse(await blob.text())).toEqual({ gameId: A, event: 'drinks', drinks: 5, plays: 2 })
  })

  it('page cachée ou quittée : envoi immédiat', async () => {
    const { mod, win, doc, sendBeacon } = await loadInPage()
    mod.noteLocalGameDrinks(A, { gamesPlayed: 1, totalDrinks: 3 })
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(sendBeacon).toHaveBeenCalledTimes(1)

    mod.noteLocalGameDrinks(B, { gamesPlayed: 1, totalDrinks: 1 })
    win.dispatchEvent(new Event('pagehide'))
    expect(sendBeacon).toHaveBeenCalledTimes(2)
  })

  it('« Sans alcool » sur la page (compte) ou sur l’appareil : rien ne part', async () => {
    for (const options of [{ ambianceAttribute: 'soft' }, { storedAmbiance: 'soft' }]) {
      const { mod, win, sendBeacon, storage } = await loadInPage(options)
      mod.noteLocalGameDrinks(A, { gamesPlayed: 1, totalDrinks: 3 })
      win.dispatchEvent(new Event('pagehide'))
      vi.advanceTimersByTime(DRINK_TALLY_MAX_WAIT_MS)
      expect(sendBeacon).not.toHaveBeenCalled()
      expect(storage.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
      vi.unstubAllGlobals()
    }
  })

  it('une correction part seule en beacon, sans participation', async () => {
    const { mod, sendBeacon } = await loadInPage()
    mod.noteLocalGameDrinks(A, { totalDrinks: 2 }, { tally: 'correction' })
    vi.advanceTimersByTime(DRINK_TALLY_SETTLE_MS)
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(JSON.parse(await sendBeacon.mock.calls[0][1].text())).toEqual({ gameId: A, event: 'drinks', drinks: 2, plays: 0 })
  })

  it('partie neuve : le solde sans participation est jeté, rien ne part', async () => {
    const { mod, win, sendBeacon, storage } = await loadInPage()
    mod.noteLocalGameDrinks(A, { totalDrinks: 4 })
    mod.beginLocalGameDrinks(A)
    expect(storage.map.has(DRINK_TALLY_STORAGE_KEY)).toBe(false)
    win.dispatchEvent(new Event('pagehide'))
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('côté serveur (pas de window) : ne fait rien, sans lever', async () => {
    vi.resetModules()
    const mod = await import('./local-drink-tally')
    expect(() => mod.noteLocalGameDrinks(A, { gamesPlayed: 1, totalDrinks: 3 })).not.toThrow()
    expect(() => mod.beginLocalGameDrinks(A)).not.toThrow()
  })
})
