import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Le module importe le client Prisma pour `readLandingLaunchesStat` ; ici,
// tout passe par un chargeur injecté — aucune base.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  LAUNCHES_CACHE_TTL_MS,
  LAUNCHES_TOTAL_MIN,
  LAUNCHES_WEEK_MIN,
  LAUNCHES_WINDOW_MS,
  countLaunches,
  invalidateLaunchesCache,
  pickLaunchesStat,
  readLaunchesCached,
  type LaunchesClient,
  type LaunchesCounts,
} from '@/lib/landing-stats-server'

/**
 * Le compteur de la vitrine promet : un chiffre seulement au-dessus des
 * seuils (semaine d'abord, cumul arrondi ensuite, sinon rien), deux count()
 * exacts sur le journal, et un cache qui ne relit la base qu'une fois par
 * TTL — pannes comprises.
 */

describe('pickLaunchesStat (règle d’affichage)', () => {
  it('se tait sous les deux seuils', () => {
    expect(pickLaunchesStat(null)).toBeNull()
    expect(pickLaunchesStat({ week: LAUNCHES_WEEK_MIN - 1, total: LAUNCHES_TOTAL_MIN - 1 })).toBeNull()
    expect(pickLaunchesStat({ week: 0, total: 0 })).toBeNull()
  })

  it('préfère la semaine dès son seuil, telle quelle', () => {
    expect(pickLaunchesStat({ week: LAUNCHES_WEEK_MIN, total: 5000 })).toEqual({ period: 'week', count: LAUNCHES_WEEK_MIN })
    expect(pickLaunchesStat({ week: 73, total: 73 })).toEqual({ period: 'week', count: 73 })
  })

  it('retombe sur le cumul, arrondi à la dizaine inférieure (« plus de N »)', () => {
    expect(pickLaunchesStat({ week: 12, total: 137 })).toEqual({ period: 'total', count: 130 })
    expect(pickLaunchesStat({ week: 0, total: LAUNCHES_TOTAL_MIN })).toEqual({ period: 'total', count: LAUNCHES_TOTAL_MIN })
    expect(pickLaunchesStat({ week: 49, total: 109 })).toEqual({ period: 'total', count: 100 })
  })
})

describe('countLaunches (lecture du journal)', () => {
  it('compte la fenêtre de 7 jours et le cumul, sans rien d’autre', async () => {
    const calls: Array<{ where?: { startedAt?: { gte: Date } } } | undefined> = []
    const client: LaunchesClient = {
      onlineGameSession: {
        count: async (args) => {
          calls.push(args)
          return args?.where ? 12 : 345
        },
      },
    }
    const now = new Date('2026-09-23T20:00:00Z')
    await expect(countLaunches(client, now)).resolves.toEqual({ week: 12, total: 345 })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.where?.startedAt?.gte.getTime()).toBe(now.getTime() - LAUNCHES_WINDOW_MS)
    expect(calls[1]).toBeUndefined()
  })
})

describe('readLaunchesCached (cache 15 min sur globalThis)', () => {
  const counts = (week: number): LaunchesCounts => ({ week, total: 1000 })

  beforeEach(() => {
    vi.useFakeTimers()
    invalidateLaunchesCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ne relit pas la base pendant le TTL', async () => {
    const load = vi.fn().mockResolvedValue(counts(60))
    const first = await readLaunchesCached(load)
    vi.advanceTimersByTime(LAUNCHES_CACHE_TTL_MS - 1)
    const second = await readLaunchesCached(load)
    expect(load).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('relit une fois le TTL écoulé', async () => {
    const load = vi.fn().mockResolvedValueOnce(counts(60)).mockResolvedValueOnce(counts(61))
    await readLaunchesCached(load)
    vi.advanceTimersByTime(LAUNCHES_CACHE_TTL_MS)
    await expect(readLaunchesCached(load)).resolves.toEqual(counts(61))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('partage un seul chargement entre visites simultanées', async () => {
    const load = vi.fn().mockResolvedValue(counts(60))
    const [a, b, c] = await Promise.all([readLaunchesCached(load), readLaunchesCached(load), readLaunchesCached(load)])
    expect(load).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('garde la dernière valeur connue sur un échec, sans retenter avant le TTL', async () => {
    const load = vi.fn().mockResolvedValueOnce(counts(60)).mockRejectedValue(new Error('base indisponible'))
    await readLaunchesCached(load)
    vi.advanceTimersByTime(LAUNCHES_CACHE_TTL_MS)
    await expect(readLaunchesCached(load)).resolves.toEqual(counts(60))
    await expect(readLaunchesCached(load)).resolves.toEqual(counts(60))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('rend null sur un échec sans valeur connue — et se tait un TTL entier', async () => {
    const load = vi.fn().mockRejectedValue(new Error('base indisponible'))
    await expect(readLaunchesCached(load)).resolves.toBeNull()
    await expect(readLaunchesCached(load)).resolves.toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
