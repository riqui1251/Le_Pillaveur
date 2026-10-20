import { describe, expect, it } from 'vitest'
import type { OpsJobId, OpsJobState, OpsJobView } from '@/lib/ops-status-types'
import { healthPills, jobTone, splitHealthPills, type HealthPill, type HealthText } from '@/lib/supervision/health'

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const RECENT = new Date(NOW - 60 * 60 * 1000).toISOString()
const OLD = new Date(NOW - 25 * 60 * 60 * 1000).toISOString()

/** Fausse traduction : la clé, puis ses valeurs — assez pour vérifier ce qui est demandé. */
const text: HealthText = (key, values) => (values ? `${key}${JSON.stringify(values)}` : key)

function job(id: OpsJobId, state: OpsJobState): OpsJobView {
  return { job: id, state, record: null, maxAgeMs: 0 }
}

const allOk: OpsJobView[] = [
  job('probe', 'ok'),
  job('backup-daily', 'ok'),
  job('backup-hourly', 'ok'),
  job('offsite', 'ok'),
  job('disk', 'ok'),
]

const okRun = { at: RECENT, ok: true, counts: { IpSeenLog: 2 }, failed: [] }

function byKey(pills: HealthPill[]): Record<string, HealthPill> {
  return Object.fromEntries(pills.map((pill) => [pill.key, pill]))
}

describe('jobTone', () => {
  it('échec rouge, retard et inconnu orange, sans effet vert', () => {
    expect(jobTone('failed')).toBe('bad')
    expect(jobTone('late')).toBe('warn')
    expect(jobTone('unknown')).toBe('warn')
    expect(jobTone('ok')).toBe('ok')
    expect(jobTone('skipped')).toBe('ok')
  })
})

describe('healthPills', () => {
  it('rien de chargé : aucune pastille, jamais un « tout va bien » présumé', () => {
    expect(healthPills({ now: NOW }, text)).toEqual([])
  })

  it('tout va bien : une pastille par entrée, toutes vertes, dans l’ordre de lecture', () => {
    const pills = healthPills(
      { opsJobs: allOk, retention: okRun, crashes24h: 0, stalledTables: 0, now: NOW },
      text
    )
    expect(pills.map((pill) => pill.key)).toEqual(['probe', 'backups', 'retention', 'crashes', 'stalled'])
    expect(pills.every((pill) => pill.tone === 'ok')).toBe(true)
    expect(pills[0].label).toBe('health.labels.probe')
  })

  it('sans accès aux tâches root (opsJobs absent) : ni site ni sauvegardes', () => {
    const pills = healthPills({ retention: okRun, crashes24h: 0, stalledTables: 0, now: NOW }, text)
    expect(pills.map((pill) => pill.key)).toEqual(['retention', 'crashes', 'stalled'])
  })

  it('lecture de la surveillance en échec : une pastille orange, pas de faux vert', () => {
    const pills = byKey(healthPills({ opsJobs: null, now: NOW }, text))
    expect(Object.keys(pills)).toEqual(['ops'])
    expect(pills.ops.tone).toBe('warn')
    expect(pills.ops.detail).toBe('health.opsUnreadable')
  })

  it('sonde en échec : rouge, son état en clair', () => {
    const jobs = allOk.map((view) => (view.job === 'probe' ? job('probe', 'failed') : view))
    const pills = byKey(healthPills({ opsJobs: jobs, now: NOW }, text))
    expect(pills.probe.tone).toBe('bad')
    expect(pills.probe.detail).toBe('ops.state.failed')
  })

  it('sauvegardes : le pire des trois, et seules les tâches en cause nommées', () => {
    const jobs = allOk.map((view) =>
      view.job === 'backup-hourly' ? job('backup-hourly', 'late') : view.job === 'offsite' ? job('offsite', 'failed') : view
    )
    const pills = byKey(healthPills({ opsJobs: jobs, now: NOW }, text))
    expect(pills.backups.tone).toBe('bad')
    expect(pills.backups.detail).toBe(
      'health.jobState{"job":"ops.job.backupHourly.name","state":"ops.state.late"} · ' +
        'health.jobState{"job":"ops.job.offsite.name","state":"ops.state.failed"}'
    )
  })

  it('la veille disque n’entre pas dans « Sauvegardes »', () => {
    const jobs = allOk.map((view) => (view.job === 'disk' ? job('disk', 'failed') : view))
    expect(byKey(healthPills({ opsJobs: jobs, now: NOW }, text)).backups.tone).toBe('ok')
  })

  it('tâche absente de la réponse (serveur antérieur) : inconnue, donc orange', () => {
    const pills = byKey(healthPills({ opsJobs: [job('probe', 'ok')], now: NOW }, text))
    expect(pills.probe.tone).toBe('ok')
    expect(pills.backups.tone).toBe('warn')
  })

  it('sauvegardes toutes dans le même état : l’état une seule fois', () => {
    const pills = byKey(healthPills({ opsJobs: [job('probe', 'ok')], now: NOW }, text))
    expect(pills.backups.detail).toBe('ops.state.unknown')
  })

  it('copie hors serveur non configurée (sans effet) : reste verte', () => {
    const jobs = allOk.map((view) => (view.job === 'offsite' ? job('offsite', 'skipped') : view))
    const pills = byKey(healthPills({ opsJobs: jobs, now: NOW }, text))
    expect(pills.backups.tone).toBe('ok')
    expect(pills.backups.detail).toContain('ops.state.skipped')
  })

  it('ménage : jamais passé orange, échec ou passage trop ancien rouge', () => {
    expect(byKey(healthPills({ retention: null, now: NOW }, text)).retention).toMatchObject({
      tone: 'warn',
      detail: 'health.retentionNever',
    })
    expect(
      byKey(healthPills({ retention: { at: RECENT, ok: false, counts: {}, failed: ['IpSeenLog'] }, now: NOW }, text))
        .retention
    ).toMatchObject({ tone: 'bad', detail: 'health.retentionFailed{"count":1}' })
    expect(byKey(healthPills({ retention: { ...okRun, at: OLD }, now: NOW }, text)).retention).toMatchObject({
      tone: 'bad',
      detail: 'health.retentionStale{"hours":24}',
    })
    expect(byKey(healthPills({ retention: okRun, now: NOW }, text)).retention.tone).toBe('ok')
  })

  it('plantages : orange dès le premier, orange aussi quand illisibles', () => {
    expect(byKey(healthPills({ crashes24h: 3, now: NOW }, text)).crashes).toMatchObject({
      tone: 'warn',
      detail: 'health.crashes{"count":3}',
    })
    expect(byKey(healthPills({ crashes24h: null, now: NOW }, text)).crashes.tone).toBe('warn')
    expect(byKey(healthPills({ crashes24h: 0, now: NOW }, text)).crashes.tone).toBe('ok')
  })

  it('tables figées : rouge dès la première', () => {
    expect(byKey(healthPills({ stalledTables: 2, now: NOW }, text)).stalled).toMatchObject({
      tone: 'bad',
      detail: 'health.stalled{"count":2}',
    })
    expect(byKey(healthPills({ stalledTables: 0, now: NOW }, text)).stalled.tone).toBe('ok')
  })
})

describe('splitHealthPills', () => {
  it('rouges puis oranges en tête, ordre de lecture gardé à gravité égale ; les vertes à part', () => {
    const pills = healthPills(
      {
        opsJobs: allOk.map((view) => (view.job === 'probe' ? job('probe', 'late') : view)),
        retention: { ...okRun, at: OLD },
        crashes24h: 4,
        stalledTables: 1,
        now: NOW,
      },
      text
    )
    const { alerts, ok } = splitHealthPills(pills)
    expect(alerts.map((pill) => pill.key)).toEqual(['retention', 'stalled', 'probe', 'crashes'])
    expect(ok.map((pill) => pill.key)).toEqual(['backups'])
  })

  it('rien en alerte : tout dans le groupe vert', () => {
    const { alerts, ok } = splitHealthPills(
      healthPills({ retention: okRun, crashes24h: 0, stalledTables: 0, now: NOW }, text)
    )
    expect(alerts).toEqual([])
    expect(ok).toHaveLength(3)
  })
})
