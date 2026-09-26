import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * État en direct du conteneur (onglet « Surveillance »). Ce qu'on vérifie
 * surtout : une mesure qui échoue ou qui pend ne fait tomber ni les autres ni
 * le processus, et rien d'une erreur ne passe dans la réponse ni les journaux.
 */

const { countMock, findUniqueMock, measureDiskHealthMock, summarizeMock, schedulerViewsMock } =
  vi.hoisted(() => ({
    countMock: vi.fn(),
    findUniqueMock: vi.fn(),
    measureDiskHealthMock: vi.fn(),
    summarizeMock: vi.fn(),
    schedulerViewsMock: vi.fn(),
  }))

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { count: countMock }, siteSetting: { findUnique: findUniqueMock } },
}))
vi.mock('@/lib/disk-health', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/disk-health')>()),
  measureDiskHealth: measureDiskHealthMock,
}))
vi.mock('@/lib/client-errors-server', () => ({ summarizeClientErrors: summarizeMock }))
vi.mock('@/lib/scheduler', () => ({ schedulerJobViews: schedulerViewsMock }))

import { collectOpsLive, OPS_LIVE_MEASURE_TIMEOUT_MS } from '@/lib/ops-live'
import { RETENTION_LAST_RUN_KEY } from '@/lib/retention-sweep'
import { acquireStream, resetStreamRegistry } from '@/lib/online/stream-registry'

const SCHEDULER = [
  {
    name: 'retention',
    cron: '30 4 * * *',
    tz: 'Europe/Paris',
    lastRun: { at: '2026-09-26T02:30:00.000Z', outcome: 'done', durationMs: 1200 },
  },
  { name: 'tables', cron: '*/5 * * * *', tz: 'Europe/Paris', lastRun: null },
]

const RETENTION_VALUE = JSON.stringify({
  at: '2026-09-26T02:30:00.000Z',
  ok: false,
  counts: { 'IpSeenLog.expired': 12 },
  failed: ['User.staleGuests'],
})

/** Tout ce qu'une mesure a journalisé, aplati. */
function loggedErrors(): string {
  return (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((call) => call.map(String).join(' '))
    .join('\n')
}

beforeEach(() => {
  vi.resetAllMocks()
  resetStreamRegistry()
  countMock.mockResolvedValue(1)
  findUniqueMock.mockResolvedValue({ key: RETENTION_LAST_RUN_KEY, value: RETENTION_VALUE })
  measureDiskHealthMock.mockResolvedValue({ freePct: 42 })
  summarizeMock.mockResolvedValue({ total24h: 7, groups: [{ name: 'TypeError', message: 'x' }] })
  schedulerViewsMock.mockReturnValue(SCHEDULER)
  vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abc1234')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  resetStreamRegistry()
})

describe('collectOpsLive : relevé nominal', () => {
  it('rassemble toutes les mesures du contrat', async () => {
    const releaseA = acquireStream('compte-a')!
    acquireStream('compte-a')
    acquireStream('compte-b')

    const live = await collectOpsLive()

    expect(live).toMatchObject({
      buildSha: 'abc1234',
      db: { up: true },
      disk: { freePct: 42 },
      streams: { total: 3, accounts: 2, maxPerAccount: 2 },
      clientErrors24h: 7,
      scheduler: SCHEDULER,
      retentionLastRun: { at: '2026-09-26T02:30:00.000Z', ok: false },
    })
    expect(live.db.latencyMs).toEqual(expect.any(Number))
    expect(live.db.latencyMs).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(live.uptimeSec)).toBe(true)
    expect(live.memory.rssMb).toBeGreaterThan(0)
    expect(Number.isInteger(live.memory.heapUsedMb)).toBe(true)
    releaseA()
  })

  it('interroge la base comme /api/health : une ligne de User, pas un SELECT 1', async () => {
    await collectOpsLive()
    expect(countMock).toHaveBeenCalledWith({ take: 1 })
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { key: RETENTION_LAST_RUN_KEY } })
  })

  it('« dev » quand l’image a été construite sans sha', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', '')
    expect((await collectOpsLive()).buildSha).toBe('dev')
  })

  it('réduit le témoin de conservation à { at, ok }', async () => {
    const { retentionLastRun } = await collectOpsLive()
    expect(retentionLastRun).toEqual({ at: '2026-09-26T02:30:00.000Z', ok: false })
  })

  it('rend null pour un témoin de conservation absent ou abîmé', async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    expect((await collectOpsLive()).retentionLastRun).toBeNull()
    findUniqueMock.mockResolvedValueOnce({ key: RETENTION_LAST_RUN_KEY, value: '{pas du json' })
    expect((await collectOpsLive()).retentionLastRun).toBeNull()
  })

  it('mesure la base SEULE, avant les autres lectures (connexion Prisma unique)', async () => {
    let releaseDb!: () => void
    countMock.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          releaseDb = () => resolve(1)
        })
    )
    const pending = collectOpsLive()
    await vi.waitFor(() => expect(countMock).toHaveBeenCalledTimes(1))
    expect(summarizeMock).not.toHaveBeenCalled()
    expect(findUniqueMock).not.toHaveBeenCalled()

    releaseDb()
    await pending
    expect(summarizeMock).toHaveBeenCalledTimes(1)
    expect(findUniqueMock).toHaveBeenCalledTimes(1)
  })
})

describe('collectOpsLive : chaque mesure est isolée', () => {
  it('base en panne : up = false, sans rien de l’erreur, le reste intact', async () => {
    countMock.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on joueur@exemple.fr from 203.0.113.7'), {
        code: 'P1001',
      })
    )
    const live = await collectOpsLive()

    expect(live.db).toEqual({ up: false, latencyMs: null })
    expect(live.disk).toEqual({ freePct: 42 })
    expect(live.clientErrors24h).toBe(7)
    expect(JSON.stringify(live)).not.toMatch(/@|203\.0\.113/)
    expect(console.error).toHaveBeenCalledWith('[ops-live] mesure « base » en échec :', 'Error P1001')
    expect(loggedErrors()).not.toMatch(/@|203\.0\.113/)
  })

  it('toutes les mesures en panne à la fois : un relevé quand même, avec les replis', async () => {
    countMock.mockRejectedValue(new Error('base'))
    measureDiskHealthMock.mockRejectedValue(new Error('disque'))
    summarizeMock.mockRejectedValue(new Error('plantages'))
    findUniqueMock.mockRejectedValue(new Error('conservation'))
    schedulerViewsMock.mockImplementation(() => {
      throw new Error('node-cron introuvable')
    })

    const live = await collectOpsLive()

    expect(live).toMatchObject({
      buildSha: 'abc1234',
      db: { up: false, latencyMs: null },
      disk: null,
      streams: { total: 0, accounts: 0, maxPerAccount: 0 },
      clientErrors24h: null,
      scheduler: [],
      retentionLastRun: null,
    })
    for (const label of ['base', 'disque', 'plantages', 'conservation', 'planificateur']) {
      expect(console.error).toHaveBeenCalledWith(`[ops-live] mesure « ${label} » en échec :`, 'Error')
    }
  })

  it('une mesure qui pend rend son repli au délai, et son rejet tardif ne tue pas le processus', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // Requête coincée derrière la connexion unique, qui finit par lever APRÈS
    // le délai : sans le `.catch` de measure(), ce rejet serait non géré.
    countMock.mockImplementation(
      () =>
        new Promise<number>((_, reject) => {
          setTimeout(() => reject(new Error('socket timeout')), OPS_LIVE_MEASURE_TIMEOUT_MS + 5000)
        })
    )

    const pending = collectOpsLive()
    await vi.advanceTimersByTimeAsync(OPS_LIVE_MEASURE_TIMEOUT_MS)
    const live = await pending

    expect(live.db).toEqual({ up: false, latencyMs: null })
    expect(live.clientErrors24h).toBe(7)
    expect(console.error).toHaveBeenCalledWith('[ops-live] mesure « base » en échec :', 'OpsMeasureTimeout')

    // Le rejet tardif arrive : vitest échouerait sur un rejet non géré.
    await vi.advanceTimersByTimeAsync(5000)
  })
})
