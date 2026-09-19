import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOBBIES_CACHE_TTL_MS,
  invalidateLobbiesCache,
  readLobbiesCached,
  type LobbiesResponse,
} from '@/lib/online/lobbies-cache'

/**
 * Le cache du guichet promet trois choses : une réponse retenue pendant le
 * TTL, un seul chargement partagé par les sondages concurrents, et une
 * invalidation qui ne laisse jamais passer un résultat lu avant la mutation.
 * Le chargeur est injecté : aucune base, aucun mock de module.
 */

/** Une réponse reconnaissable : le guichet ne s'intéresse ici qu'à son identité. */
const response = (tag: string): LobbiesResponse => ({
  lobbies: [],
  liveGames: [],
  liveGamesTotal: 0,
  recentLaunches: [{ id: tag, gameId: 'menteur', isPrivate: false, playerCount: 3, startedAgoMinutes: 0 }],
})

/** Promesse pilotée à la main : le test décide quand le « chargement » aboutit. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
  // L'état vit sur globalThis : chaque cas repart d'un cache vide.
  invalidateLobbiesCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('readLobbiesCached', () => {
  it('sert la même réponse pendant le TTL sans recharger', async () => {
    const load = vi.fn().mockResolvedValue(response('a'))

    const first = await readLobbiesCached(load)
    vi.advanceTimersByTime(LOBBIES_CACHE_TTL_MS - 1)
    const second = await readLobbiesCached(load)

    expect(load).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('recharge une fois le TTL écoulé', async () => {
    const load = vi.fn().mockResolvedValueOnce(response('a')).mockResolvedValueOnce(response('b'))

    await readLobbiesCached(load)
    vi.advanceTimersByTime(LOBBIES_CACHE_TTL_MS)
    const later = await readLobbiesCached(load)

    expect(load).toHaveBeenCalledTimes(2)
    expect(later.recentLaunches[0].id).toBe('b')
  })

  it('partage une seule promesse entre les sondages concurrents', async () => {
    const pending = deferred<LobbiesResponse>()
    const load = vi.fn().mockReturnValue(pending.promise)

    const readers = [readLobbiesCached(load), readLobbiesCached(load), readLobbiesCached(load)]
    expect(load).toHaveBeenCalledTimes(1)

    pending.resolve(response('a'))
    const results = await Promise.all(readers)

    expect(results.every((r) => r === results[0])).toBe(true)
    // Le chargement terminé est retenu : le lecteur suivant ne recharge pas.
    await readLobbiesCached(load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('recharge dès le prochain lecteur après une invalidation, même dans le TTL', async () => {
    const load = vi.fn().mockResolvedValueOnce(response('a')).mockResolvedValueOnce(response('b'))

    await readLobbiesCached(load)
    invalidateLobbiesCache()
    const next = await readLobbiesCached(load)

    expect(load).toHaveBeenCalledTimes(2)
    expect(next.recentLaunches[0].id).toBe('b')
  })

  it('ne retient pas un chargement parti avant une invalidation', async () => {
    // Une table est créée PENDANT que le guichet se charge : ce chargement a pu
    // lire la base d'avant. Son lecteur le reçoit quand même (rien de mieux
    // sous la main), mais le cache ne le garde pas et le suivant recharge.
    const stale = deferred<LobbiesResponse>()
    const load = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(response('fresh'))

    const early = readLobbiesCached(load)
    invalidateLobbiesCache()
    stale.resolve(response('stale'))

    expect((await early).recentLaunches[0].id).toBe('stale')
    const next = await readLobbiesCached(load)
    expect(next.recentLaunches[0].id).toBe('fresh')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('après une invalidation, un nouveau lecteur ne rejoint pas la promesse périmée', async () => {
    const stale = deferred<LobbiesResponse>()
    const fresh = deferred<LobbiesResponse>()
    const load = vi.fn().mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)

    const early = readLobbiesCached(load)
    invalidateLobbiesCache()
    const late = readLobbiesCached(load)
    expect(load).toHaveBeenCalledTimes(2)

    fresh.resolve(response('fresh'))
    stale.resolve(response('stale'))
    expect((await late).recentLaunches[0].id).toBe('fresh')
    expect((await early).recentLaunches[0].id).toBe('stale')

    // La fin du chargement périmé ne libère pas la place du chargement frais,
    // qui reste retenu pour les lecteurs suivants.
    const again = await readLobbiesCached(load)
    expect(again.recentLaunches[0].id).toBe('fresh')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ne retient pas un chargement qui échoue et laisse le suivant réessayer', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('base indisponible'))
      .mockResolvedValueOnce(response('retry'))

    await expect(readLobbiesCached(load)).rejects.toThrow('base indisponible')
    const next = await readLobbiesCached(load)

    expect(next.recentLaunches[0].id).toBe('retry')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
