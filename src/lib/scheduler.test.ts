import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Les ménages eux-mêmes sont testés chez eux : ici on ne vérifie QUE le
// planificateur — cadences annoncées, verrou, isolement des erreurs,
// idempotence. `schedule` est remplacé (aucune minuterie posée dans un test),
// mais `validate` reste le vrai : c'est lui qui doit juger nos expressions.
const {
  scheduleMock,
  runRetentionSweepMock,
  cleanupAbandonedRoomsMock,
  cleanupStaleCastRoomsMock,
  closeOrphanGameSessionsMock,
  purgeOldClientErrorsMock,
} = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  runRetentionSweepMock: vi.fn(),
  cleanupAbandonedRoomsMock: vi.fn(),
  cleanupStaleCastRoomsMock: vi.fn(),
  closeOrphanGameSessionsMock: vi.fn(),
  purgeOldClientErrorsMock: vi.fn(),
}))

vi.mock('node-cron', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-cron')>()
  return { ...actual, schedule: scheduleMock }
})
vi.mock('@/lib/retention-sweep', () => ({ runRetentionSweep: runRetentionSweepMock }))
vi.mock('@/lib/online-room', () => ({ cleanupAbandonedRooms: cleanupAbandonedRoomsMock }))
vi.mock('@/lib/supervision-overview-server', () => ({
  cleanupStaleCastRooms: cleanupStaleCastRoomsMock,
}))
vi.mock('@/lib/online/game-sessions', () => ({
  closeOrphanGameSessions: closeOrphanGameSessionsMock,
}))
// Sans ce remplacement, l'étape « plantages anciens » ouvrait le VRAI client
// Prisma (deleteMany sur la base locale), son échec avalé par runStep.
vi.mock('@/lib/client-errors-server', () => ({
  purgeOldClientErrors: purgeOldClientErrorsMock,
  CLIENT_ERROR_RETENTION_DAYS: 30,
}))

import { validate } from 'node-cron'
import {
  SCHEDULER_GUARD,
  runExclusive,
  runScheduledJob,
  scheduledJobs,
  shouldStartScheduler,
  startScheduledJobs,
} from '@/lib/scheduler'

/**
 * Environnement d'un vrai serveur Next : le seul où les tâches se posent.
 * Sans NEXT_RUNTIME, volontairement — Next ne l'assigne jamais au processus
 * (substitution webpack à la compilation), le vrai serveur ne l'a pas.
 */
function serverEnv() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITEST', '')
}

/** Oublie que les tâches ont déjà été posées (la garde vit sur globalThis). */
function forgetScheduler() {
  delete (globalThis as Record<symbol, unknown>)[SCHEDULER_GUARD]
}

/** Options passées à node-cron, par expression. */
function scheduledWith(expression: string) {
  const call = scheduleMock.mock.calls.find(([cron]) => cron === expression)
  return call?.[2] as { timezone?: string; name?: string } | undefined
}

beforeEach(() => {
  forgetScheduler()
  scheduleMock.mockReset()
  runRetentionSweepMock.mockReset().mockResolvedValue(undefined)
  cleanupAbandonedRoomsMock.mockReset().mockResolvedValue(undefined)
  cleanupStaleCastRoomsMock.mockReset().mockResolvedValue(undefined)
  closeOrphanGameSessionsMock.mockReset().mockResolvedValue(0)
  purgeOldClientErrorsMock.mockReset().mockResolvedValue(0)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  forgetScheduler()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('les tâches annoncées', () => {
  it('sont celles du contrat, avec leurs cadences et leur fuseau', () => {
    expect(scheduledJobs()).toEqual([
      { name: 'retention', cron: '30 4 * * *', tz: 'Europe/Paris' },
      { name: 'tables', cron: '*/5 * * * *', tz: 'Europe/Paris' },
    ])
  })

  it('ont toutes une expression cron valide', () => {
    for (const job of scheduledJobs()) {
      expect(validate(job.cron), `${job.name} : ${job.cron}`).toBe(true)
    }
  })

  it('sont recopiées : toucher à la liste reçue ne change rien', () => {
    const jobs = scheduledJobs()
    jobs.pop()
    jobs[0].cron = '* * * * *'
    expect(scheduledJobs()).toHaveLength(2)
    expect(scheduledJobs()[0].cron).toBe('30 4 * * *')
  })
})

describe('verrou anti-recouvrement', () => {
  it('ne relance jamais une tâche par-dessus elle-même', async () => {
    let finish!: () => void
    const slow = new Promise<void>((resolve) => {
      finish = resolve
    })
    const run = vi.fn(() => slow)

    const first = runExclusive('lente', run)
    // Deuxième tour pendant que le premier court : sauté, sans second appel.
    await expect(runExclusive('lente', run)).resolves.toBe('skipped')
    expect(run).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      '[scheduler] lente : tour précédent encore en cours, ce tour est sauté'
    )

    finish()
    await expect(first).resolves.toBe('done')
    // Verrou rendu : le tour suivant repart normalement.
    await expect(runExclusive('lente', run)).resolves.toBe('done')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('est propre à chaque tâche : une tâche lente n’en bloque pas une autre', async () => {
    let finish!: () => void
    const slow = new Promise<void>((resolve) => {
      finish = resolve
    })
    const first = runExclusive('alpha', () => slow)
    await expect(runExclusive('beta', async () => {})).resolves.toBe('done')
    finish()
    await first
  })

  it('attrape les erreurs, journalise sans donnée personnelle et rend le verrou', async () => {
    // Message volontairement porteur d'un e-mail : c'est exactement ce qu'un
    // message Prisma recopie de la ligne fautive, et la tâche « retention »
    // supprime des comptes. Le journal ne doit garder que le NOM de la classe.
    const boom = vi.fn().mockRejectedValue(new Error('UNIQUE constraint failed: joueur@exemple.fr'))
    await expect(runExclusive('fragile', boom)).resolves.toBe('failed')
    expect(console.error).toHaveBeenCalledWith('[scheduler] fragile : échec', 'Error')
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.map(String).join(' '))
      .join('\n')
    expect(logged).not.toMatch(/@/)
    await expect(runExclusive('fragile', async () => {})).resolves.toBe('done')
  })

  it('garde le code Prisma, qui dit ce qui a lâché sans rien recopier de la ligne', async () => {
    const conflict = Object.assign(new Error('UNIQUE constraint failed'), { code: 'P2002' })
    await expect(runExclusive('fragile', () => Promise.reject(conflict))).resolves.toBe('failed')
    expect(console.error).toHaveBeenCalledWith('[scheduler] fragile : échec', 'Error P2002')
  })
})

describe('exécution des tâches', () => {
  it('« retention » balaie en passant outre la garde des 6 h', async () => {
    await expect(runScheduledJob('retention')).resolves.toBe('done')
    expect(runRetentionSweepMock).toHaveBeenCalledWith({ force: true })
  })

  it('« tables » purge les salles, puis les salles de cast, réconcilie, puis purge les plantages', async () => {
    const order: string[] = []
    cleanupAbandonedRoomsMock.mockImplementation(async () => {
      order.push('salles')
    })
    cleanupStaleCastRoomsMock.mockImplementation(async () => {
      order.push('cast')
    })
    closeOrphanGameSessionsMock.mockImplementation(async () => {
      order.push('orphelines')
      return 0
    })
    purgeOldClientErrorsMock.mockImplementation(async () => {
      order.push('plantages')
      return 0
    })

    await expect(runScheduledJob('tables')).resolves.toBe('done')
    expect(order).toEqual(['salles', 'cast', 'orphelines', 'plantages'])
  })

  it('« tables » : une étape en échec ne prive pas les suivantes de leur tour', async () => {
    cleanupAbandonedRoomsMock.mockRejectedValue(new Error('base verrouillée'))
    await expect(runScheduledJob('tables')).resolves.toBe('done')
    expect(cleanupStaleCastRoomsMock).toHaveBeenCalledTimes(1)
    expect(closeOrphanGameSessionsMock).toHaveBeenCalledTimes(1)
    expect(purgeOldClientErrorsMock).toHaveBeenCalledTimes(1)
  })

  it('ne lève pas sur un nom inconnu', async () => {
    await expect(runScheduledJob('inconnue')).resolves.toBe('unknown')
  })
})

describe('shouldStartScheduler', () => {
  // Tel que le voit le VRAI serveur de production : Next n'assigne jamais
  // NEXT_RUNTIME au processus (la variable n'existe qu'à la compilation, par
  // substitution webpack), elle est donc ABSENTE de `process.env` au démarrage.
  const server = { NODE_ENV: 'production' } as NodeJS.ProcessEnv

  it('accepte le serveur Node de production — sans NEXT_RUNTIME dans process.env', () => {
    expect(shouldStartScheduler(server)).toBe(true)
  })

  it('ne se laisse pas tromper par une valeur de NEXT_RUNTIME posée à la main', () => {
    // Le runtime est la responsabilité de instrumentation.ts, pas de cette
    // garde : elle ne doit ni exiger ni lire cette variable.
    expect(shouldStartScheduler({ ...server, NEXT_RUNTIME: 'nodejs' })).toBe(true)
  })

  it('refuse la construction et les tests', () => {
    const refus: NodeJS.ProcessEnv[] = [
      { ...server, NEXT_PHASE: 'phase-production-build' },
      { ...server, NODE_ENV: 'test' },
      { ...server, VITEST: 'true' },
    ]
    for (const env of refus) expect(shouldStartScheduler(env)).toBe(false)
  })
})

describe('startScheduledJobs', () => {
  it('pose chaque tâche avec sa cadence et son fuseau', () => {
    serverEnv()
    startScheduledJobs()

    expect(scheduleMock).toHaveBeenCalledTimes(2)
    expect(scheduledWith('30 4 * * *')).toMatchObject({ timezone: 'Europe/Paris', name: 'retention' })
    expect(scheduledWith('*/5 * * * *')).toMatchObject({ timezone: 'Europe/Paris', name: 'tables' })
  })

  it('est idempotente : trois appels ne posent qu’une série de tâches', () => {
    serverEnv()
    startScheduledJobs()
    startScheduledJobs()
    startScheduledJobs()
    expect(scheduleMock).toHaveBeenCalledTimes(2)
  })

  it('ne pose rien pendant la construction ni sous test', () => {
    for (const env of [
      { NEXT_PHASE: 'phase-production-build' },
      { NODE_ENV: 'test' },
    ]) {
      forgetScheduler()
      vi.unstubAllEnvs()
      serverEnv()
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
      startScheduledJobs()
    }
    expect(scheduleMock).not.toHaveBeenCalled()
  })

  it('la cadence déclenche bien la tâche, sans rejet non géré', async () => {
    serverEnv()
    startScheduledJobs()
    const [, handler] = scheduleMock.mock.calls.find(([cron]) => cron === '*/5 * * * *') as [
      string,
      () => void,
    ]
    // Le rappel de node-cron ne rend pas la main sur la tâche : il ne doit ni
    // lever ni laisser un rejet derrière lui.
    expect(handler()).toBeUndefined()
    await vi.waitFor(() => expect(cleanupAbandonedRoomsMock).toHaveBeenCalledTimes(1))
  })
})
