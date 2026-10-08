import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPlayer,
  getStoredPlayers,
  removePlayer,
  savePlayers,
  updatePlayer,
  updatePlayerPreferences,
  type Player,
} from './players'
import {
  flushPlayersPush,
  pushPlayersToCloud,
  schedulePlayersPush,
  syncLocalWithCloud,
} from './player-sync'

/**
 * La resynchro au retour sur la page (focus, visibilitychange, pageshow) ne
 * doit jamais effacer un changement fait sur ce poste :
 *  - pendant sa requête : le clic suit le retour de focus de quelques
 *    millisecondes (dans le panneau navigateur de l'app de bureau, CHAQUE clic
 *    redonne le focus à la fenêtre, d'où une perte à tous les coups) ;
 *  - juste avant elle, quand la poussée vers le nuage n'est pas encore arrivée.
 * Elle doit aussi continuer d'apporter les joueurs ajoutés sur un autre appareil.
 */

function makePlayer(id: string, name: string, createdAt: number, color = 'bg-red-500'): Player {
  return {
    id,
    name,
    createdAt,
    stats: { gamesPlayed: 0, wins: 0, totalDrinks: 0 },
    preferences: { color, icon: '🎮' },
  }
}

const names = (players: Player[]) => players.map((player) => player.name)

/** localStorage minimal. */
function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

/**
 * Faux nuage. Un GET répond la liste telle qu'elle était à l'ARRIVÉE de la
 * requête ; un PUT n'enregistre qu'une fois relâché. Retenir l'un ou l'autre
 * permet de glisser un geste de l'utilisateur pendant l'aller-retour.
 */
function fakeCloud(initial: Player[]) {
  const cloud = {
    players: initial,
    requests: [] as Array<'GET' | 'PUT'>,
    holdGet: null as Promise<void> | null,
    holdPut: null as Promise<void> | null,
  }
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      cloud.requests.push('PUT')
      const sent = JSON.parse(String(init.body)).players as Player[]
      if (cloud.holdPut) await cloud.holdPut
      cloud.players = sent
      return { ok: true, json: async () => ({ ok: true }) }
    }
    cloud.requests.push('GET')
    const answer = cloud.players
    if (cloud.holdGet) await cloud.holdGet
    return { ok: true, json: async () => ({ players: answer }) }
  }))
  return cloud
}

/** Laisse filer les promesses en cours (une vraie tâche, pas une micro-tâche). */
const nextTask = () => new Promise((done) => setTimeout(done, 0))

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: fakeStorage() })
})

afterEach(async () => {
  vi.useRealTimers()
  // Rien ne doit déborder sur le test suivant (poussée programmée au niveau du module).
  await flushPlayersPush()
  vi.unstubAllGlobals()
})

describe('syncLocalWithCloud — geste pendant la requête', () => {
  it('garde un joueur ajouté pendant la requête (clic « Ajouter » juste après le focus)', async () => {
    const cloud = fakeCloud([])
    const answer = deferred()
    cloud.holdGet = answer.promise

    const sync = syncLocalWithCloud()
    await vi.waitFor(() => expect(cloud.requests).toContain('GET'))

    // Ce que fait addPlayers dans usePlayers : écriture locale + poussée immédiate.
    void pushPlayersToCloud(addPlayer('Léa'))
    answer.resolve()

    const result = await sync
    await flushPlayersPush()
    expect(names(result)).toEqual(['Léa'])
    expect(names(getStoredPlayers())).toEqual(['Léa'])
    expect(names(cloud.players)).toEqual(['Léa'])
  })

  it('ne ressuscite pas un joueur supprimé pendant la requête', async () => {
    const lea = makePlayer('p1', 'Léa', 1)
    const tom = makePlayer('p2', 'Tom', 2)
    savePlayers([lea, tom])
    const cloud = fakeCloud([lea, tom])
    const answer = deferred()
    cloud.holdGet = answer.promise

    const sync = syncLocalWithCloud()
    await vi.waitFor(() => expect(cloud.requests).toContain('GET'))
    void pushPlayersToCloud(removePlayer('p2'))
    answer.resolve()

    const result = await sync
    await flushPlayersPush()
    expect(names(result)).toEqual(['Léa'])
    expect(names(getStoredPlayers())).toEqual(['Léa'])
    expect(names(cloud.players)).toEqual(['Léa'])
  })

  it('ne ramène pas l’ancien nom d’un joueur renommé pendant la requête', async () => {
    const lea = makePlayer('p1', 'Léa', 1)
    savePlayers([lea])
    const cloud = fakeCloud([lea])
    const answer = deferred()
    cloud.holdGet = answer.promise

    const sync = syncLocalWithCloud()
    await vi.waitFor(() => expect(cloud.requests).toContain('GET'))
    void pushPlayersToCloud(updatePlayer('p1', { name: 'Léonie' }))
    answer.resolve()

    const result = await sync
    expect(names(result)).toEqual(['Léonie'])
    expect(names(getStoredPlayers())).toEqual(['Léonie'])
  })

  it('garde une couleur choisie pendant la requête', async () => {
    const lea = makePlayer('p1', 'Léa', 1, 'bg-red-500')
    savePlayers([lea])
    const cloud = fakeCloud([lea])
    const answer = deferred()
    cloud.holdGet = answer.promise

    const sync = syncLocalWithCloud()
    await vi.waitFor(() => expect(cloud.requests).toContain('GET'))
    updatePlayerPreferences('p1', { color: 'bg-blue-500' })
    answer.resolve()

    const result = await sync
    expect(result[0]?.preferences.color).toBe('bg-blue-500')
    expect(getStoredPlayers()[0]?.preferences.color).toBe('bg-blue-500')
  })

  it('rend la liste à jour quand un ajout arrive pendant son propre envoi', async () => {
    // usePlayers affiche ce que la resynchro renvoie : une liste figée avant
    // l'envoi effacerait l'ajout de l'écran, puis du stockage.
    savePlayers([makePlayer('p1', 'Léa', 1)])
    const cloud = fakeCloud([makePlayer('p9', 'Max', 2)])
    const stored = deferred()
    cloud.holdPut = stored.promise

    const sync = syncLocalWithCloud()
    await vi.waitFor(() => expect(cloud.requests).toEqual(['GET', 'PUT']))
    addPlayer('Tom')
    stored.resolve()

    const result = await sync
    expect(names(result)).toEqual(['Léa', 'Max', 'Tom'])
    expect(names(getStoredPlayers())).toEqual(['Léa', 'Max', 'Tom'])
  })
})

describe('syncLocalWithCloud — changement pas encore arrivé au nuage', () => {
  it('envoie d’abord la poussée programmée (couleur changée puis focus avant 800 ms)', async () => {
    const lea = makePlayer('p1', 'Léa', 1, 'bg-red-500')
    savePlayers([lea])
    const cloud = fakeCloud([lea])
    vi.useFakeTimers()

    // Ce que fait usePlayers : écriture locale, poussée différée de 800 ms.
    updatePlayerPreferences('p1', { color: 'bg-blue-500' })
    schedulePlayersPush()
    vi.advanceTimersByTime(100)

    const result = await syncLocalWithCloud()
    // La poussée programmée part AVANT la lecture (la fusion peut ensuite renvoyer la sienne).
    expect(cloud.requests.slice(0, 2)).toEqual(['PUT', 'GET'])
    expect(result[0]?.preferences.color).toBe('bg-blue-500')
    expect(getStoredPlayers()[0]?.preferences.color).toBe('bg-blue-500')
    expect(cloud.players[0]?.preferences.color).toBe('bg-blue-500')

    // Et elle n'est pas repartie une seconde fois à son échéance.
    const sent = cloud.requests.length
    vi.advanceTimersByTime(1_000)
    expect(cloud.requests).toHaveLength(sent)
  })

  it('attend l’enregistrement d’une poussée déjà partie avant de relire le nuage', async () => {
    const lea = makePlayer('p1', 'Léa', 1)
    const tom = makePlayer('p2', 'Tom', 2)
    savePlayers([lea, tom])
    const cloud = fakeCloud([lea, tom])
    const stored = deferred()
    cloud.holdPut = stored.promise

    // Suppression écrite et envoyée, mais pas encore enregistrée côté serveur.
    void pushPlayersToCloud(removePlayer('p2'))
    const sync = syncLocalWithCloud()
    await nextTask()
    expect(cloud.requests).toEqual(['PUT'])

    stored.resolve()
    const result = await sync
    expect(cloud.requests.slice(0, 2)).toEqual(['PUT', 'GET'])
    expect(names(result)).toEqual(['Léa'])
    expect(names(cloud.players)).toEqual(['Léa'])
  })
})

describe('syncLocalWithCloud — autres appareils', () => {
  it('apporte toujours les joueurs ajoutés ailleurs et renvoie la fusion au nuage', async () => {
    savePlayers([makePlayer('p1', 'Léa', 1)])
    const cloud = fakeCloud([makePlayer('p9', 'Max', 2)])

    const result = await syncLocalWithCloud()
    expect(names(result)).toEqual(['Léa', 'Max'])
    expect(names(getStoredPlayers())).toEqual(['Léa', 'Max'])
    expect(names(cloud.players)).toEqual(['Léa', 'Max'])
  })

  it('reste une union quand rien n’a bougé ici pendant la requête', async () => {
    const lea = makePlayer('p1', 'Léa', 1, 'bg-red-500')
    savePlayers([lea])
    // Même joueur, statistiques plus avancées sur l'autre appareil.
    const cloud = fakeCloud([{ ...lea, stats: { gamesPlayed: 4, wins: 2, totalDrinks: 7 } }])

    const result = await syncLocalWithCloud()
    expect(result[0]?.stats).toMatchObject({ gamesPlayed: 4, wins: 2, totalDrinks: 7 })
    expect(cloud.requests).toContain('GET')
  })
})

describe('schedulePlayersPush', () => {
  it('n’envoie qu’une poussée, avec la liste du moment, pour des changements rapprochés', async () => {
    const cloud = fakeCloud([])
    vi.useFakeTimers()

    // Deux instances de usePlayers (page + barre des joueurs) qui programment chacune.
    savePlayers([makePlayer('p1', 'Léa', 1)])
    schedulePlayersPush()
    savePlayers([makePlayer('p1', 'Léa', 1), makePlayer('p2', 'Tom', 2)])
    schedulePlayersPush()
    vi.advanceTimersByTime(799)
    expect(cloud.requests).toEqual([])

    vi.advanceTimersByTime(1)
    await flushPlayersPush()
    expect(cloud.requests).toEqual(['PUT'])
    expect(names(cloud.players)).toEqual(['Léa', 'Tom'])
  })

  it('ne fait rien partir quand il n’y a rien à pousser', async () => {
    const cloud = fakeCloud([])
    await flushPlayersPush()
    expect(cloud.requests).toEqual([])
  })
})
