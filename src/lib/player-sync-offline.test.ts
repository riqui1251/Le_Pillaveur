import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoredPlayers, removePlayer, savePlayers, type Player } from './players'
import {
  CLOUD_BEHIND_KEY,
  CLOUD_TIMEOUT_MS,
  LAST_CLOUD_ACCOUNT_KEY,
  flushPlayersPush,
  isCloudBehindFor,
  markCloudBehind,
  pushPlayersToCloud,
  setCloudAccount,
  syncLocalWithCloud,
} from './player-sync'

/**
 * Jeux locaux HORS LIGNE (service worker) : la table se modifie sans réseau,
 * et le nuage ne doit pas défaire ces gestes au retour du réseau — ni faire
 * attendre la page des joueurs sans fin quand le réseau « pend ».
 */

function makePlayer(id: string, name: string, createdAt: number): Player {
  return {
    id,
    name,
    createdAt,
    stats: { gamesPlayed: 0, wins: 0, totalDrinks: 0 },
    preferences: { color: 'bg-red-500', icon: '🎮' },
  }
}

const names = (players: Player[]) => players.map((player) => player.name)

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

type Cloud = { players: Player[]; requests: Array<'GET' | 'PUT'>; down: boolean; putStatus: number | null }

/**
 * Faux nuage : en panne (`down`), chaque requête rejette comme le ferait le
 * navigateur ; `putStatus` fait répondre les PUT par ce code HTTP (refus).
 */
function fakeCloud(initial: Player[], down = false): Cloud {
  const cloud: Cloud = { players: initial, requests: [], down, putStatus: null }
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (cloud.down) throw new TypeError('Failed to fetch')
    if (init?.method === 'PUT') {
      cloud.requests.push('PUT')
      if (cloud.putStatus) return { ok: false, status: cloud.putStatus, json: async () => ({ error: 'refus' }) }
      cloud.players = JSON.parse(String(init.body)).players as Player[]
      return { ok: true, json: async () => ({ ok: true }) }
    }
    cloud.requests.push('GET')
    return { ok: true, json: async () => ({ players: cloud.players }) }
  }))
  return cloud
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: fakeStorage() })
  setCloudAccount(null)
})

afterEach(async () => {
  vi.useRealTimers()
  await flushPlayersPush()
  setCloudAccount(null)
  vi.unstubAllGlobals()
})

describe('marque « nuage en retard »', () => {
  it('est posée quand une poussée échoue, et retirée quand une poussée passe', async () => {
    const cloud = fakeCloud([], true)
    setCloudAccount('u1')
    await expect(pushPlayersToCloud([makePlayer('a', 'Ana', 1)])).rejects.toThrow()
    expect(isCloudBehindFor('u1')).toBe(true)
    cloud.down = false
    expect(await pushPlayersToCloud([makePlayer('a', 'Ana', 1)])).toBe(true)
    expect(isCloudBehindFor('u1')).toBe(false)
  })

  it('n’est PAS posée sur une réponse HTTP (500, 400) : le nuage est joignable, la fusion reste la règle', async () => {
    const cloud = fakeCloud([makePlayer('c', 'Chloé', 3)])
    setCloudAccount('u1')
    cloud.putStatus = 500
    expect(await pushPlayersToCloud([makePlayer('a', 'Ana', 1)])).toBe(false)
    expect(isCloudBehindFor('u1')).toBe(false)
    cloud.putStatus = 400
    expect(await pushPlayersToCloud([makePlayer('a', 'Ana', 1)])).toBe(false)
    expect(isCloudBehindFor('u1')).toBe(false)
    cloud.putStatus = null
    savePlayers([makePlayer('a', 'Ana', 1)])
    const result = await syncLocalWithCloud('u1')
    expect(cloud.requests).toContain('GET')
    expect(names(result).sort()).toEqual(['Ana', 'Chloé'])
  })

  it('vaut pour le dernier compte vu quand la session est inconnue (app ouverte hors ligne)', () => {
    setCloudAccount('u1')
    setCloudAccount(null) // nouveau chargement, /api/auth/me injoignable
    markCloudBehind()
    expect(window.localStorage.getItem(CLOUD_BEHIND_KEY)).toBe('u1')
    expect(window.localStorage.getItem(LAST_CLOUD_ACCOUNT_KEY)).toBe('u1')
  })

  it('reste sans objet pour un vrai visiteur, jamais de compte sur l’appareil', () => {
    markCloudBehind()
    expect(window.localStorage.getItem(CLOUD_BEHIND_KEY)).toBeNull()
  })
})

describe('syncLocalWithCloud après une coupure', () => {
  it('pousse la liste locale telle quelle : un joueur supprimé hors ligne ne ressuscite pas', async () => {
    const ana = makePlayer('a', 'Ana', 1)
    const bob = makePlayer('b', 'Bob', 2)
    savePlayers([ana, bob])
    const cloud = fakeCloud([ana, bob], true)
    setCloudAccount('u1')
    removePlayer('b')
    await expect(pushPlayersToCloud(getStoredPlayers())).rejects.toThrow() // la poussée hors ligne
    cloud.down = false

    const result = await syncLocalWithCloud('u1')
    expect(names(result)).toEqual(['Ana'])
    expect(names(cloud.players)).toEqual(['Ana'])
    expect(cloud.requests).toEqual(['PUT']) // pas de GET : rien n’est fusionné
    expect(isCloudBehindFor('u1')).toBe(false)
  })

  it('refus définitif (4xx) de la poussée en retard : marque levée, fusion habituelle — pas de boucle', async () => {
    savePlayers([makePlayer('a', 'Ana', 1)])
    const cloud = fakeCloud([makePlayer('c', 'Chloé', 3)])
    setCloudAccount('u1')
    markCloudBehind()
    cloud.putStatus = 400
    const result = await syncLocalWithCloud('u1')
    expect(cloud.requests[0]).toBe('PUT')
    expect(cloud.requests).toContain('GET')
    expect(names(result).sort()).toEqual(['Ana', 'Chloé'])
    expect(isCloudBehindFor('u1')).toBe(false)
  })

  it('panne passagère (5xx) de la poussée en retard : marque gardée, on réessaiera', async () => {
    savePlayers([makePlayer('a', 'Ana', 1)])
    const cloud = fakeCloud([makePlayer('c', 'Chloé', 3)])
    setCloudAccount('u1')
    markCloudBehind()
    cloud.putStatus = 500
    await expect(syncLocalWithCloud('u1')).rejects.toThrow('cloud_behind')
    expect(cloud.requests).toEqual(['PUT'])
    expect(isCloudBehindFor('u1')).toBe(true)
    cloud.putStatus = null
    expect(names(await syncLocalWithCloud('u1'))).toEqual(['Ana'])
    expect(isCloudBehindFor('u1')).toBe(false)
  })

  it('laisse un AUTRE compte fusionner comme avant, et efface la marque', async () => {
    const ana = makePlayer('a', 'Ana', 1)
    savePlayers([ana])
    const cloud = fakeCloud([makePlayer('c', 'Chloé', 3)])
    setCloudAccount('u1')
    markCloudBehind()
    setCloudAccount('u2')
    const result = await syncLocalWithCloud('u2')
    expect(names(result).sort()).toEqual(['Ana', 'Chloé'])
    expect(cloud.requests[0]).toBe('GET')
    expect(window.localStorage.getItem(CLOUD_BEHIND_KEY)).toBeNull()
  })

  it('rejette aussitôt, sans requête, quand le navigateur se dit hors ligne', async () => {
    const cloud = fakeCloud([])
    vi.stubGlobal('navigator', { onLine: false })
    await expect(syncLocalWithCloud('u1')).rejects.toThrow()
    expect(cloud.requests).toEqual([])
  })
})

describe('réseau qui pend', () => {
  it('abandonne la lecture du nuage après le délai au lieu d’attendre sans fin', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
      })
    ))
    const sync = syncLocalWithCloud('u1')
    const outcome = sync.then(() => 'ok', () => 'rejected')
    await vi.advanceTimersByTimeAsync(CLOUD_TIMEOUT_MS + 1)
    expect(await outcome).toBe('rejected')
  })
})
