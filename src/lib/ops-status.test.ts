import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPS_DETAIL_MAX_LENGTH,
  OPS_JOB_MAX_AGE_MS,
  OPS_STATUS_DEFAULT_DIR,
  OPS_STATUS_MAX_BYTES,
  opsJobState,
  parseOpsRecord,
  readOpsStatus,
} from '@/lib/ops-status'
import { OPS_JOB_IDS, type OpsJobId, type OpsJobRecord } from '@/lib/ops-status-types'

/**
 * Lecture des fichiers d'état des tâches root du VPS. Ces fichiers viennent de
 * scripts shell : on vérifie surtout ce qui est REFUSÉ, et que rien ne lève —
 * le panneau doit rester lisible précisément quand quelque chose a cassé.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const NOW = new Date('2026-09-26T10:00:00.000Z')

/** Ligne conforme au contrat, telle que l'écrirait la sauvegarde quotidienne. */
function dailyLine(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    job: 'backup-daily',
    ok: true,
    code: 'ok',
    // `date -Is` en heure de Paris : 03:00 locale = 01:00 UTC.
    at: '2026-09-26T03:00:02+02:00',
    detail: 'prod-2026-09-26_0300.db.gz',
    metrics: { sizeBytes: 1234567 },
    ...over,
  }
}

function record(over: Partial<OpsJobRecord> = {}): OpsJobRecord {
  return {
    v: 1,
    job: 'probe',
    ok: true,
    code: 'ok',
    at: NOW.toISOString(),
    detail: '',
    metrics: {},
    ...over,
  }
}

describe('OPS_JOB_MAX_AGE_MS', () => {
  it('suit les cadences du contrat', () => {
    expect(OPS_JOB_MAX_AGE_MS).toEqual({
      probe: 15 * MINUTE,
      'backup-daily': 26 * HOUR,
      'backup-hourly': 16 * HOUR,
      offsite: 26 * HOUR,
      disk: 26 * HOUR,
    })
  })

  it('couvre chaque tâche du contrat', () => {
    for (const job of OPS_JOB_IDS) expect(OPS_JOB_MAX_AGE_MS[job]).toBeGreaterThan(0)
  })
})

describe('parseOpsRecord : ce qui est accepté', () => {
  it('rend une ligne conforme, date normalisée en ISO UTC', () => {
    expect(parseOpsRecord(dailyLine(), 'backup-daily', NOW)).toEqual({
      v: 1,
      job: 'backup-daily',
      ok: true,
      code: 'ok',
      at: '2026-09-26T01:00:02.000Z',
      detail: 'prod-2026-09-26_0300.db.gz',
      metrics: { sizeBytes: 1234567 },
    })
  })

  it('accepte chaque forme du contrat : sonde, abstention, échec disque', () => {
    const at = '2026-09-26T11:55:00+02:00'
    expect(
      parseOpsRecord(
        { v: 1, job: 'probe', ok: false, code: 'http_error', at, detail: 'HTTP 503', metrics: { httpCode: 503, ms: 412 } },
        'probe',
        NOW
      )
    ).toMatchObject({ ok: false, code: 'http_error', metrics: { httpCode: 503, ms: 412 } })
    expect(
      parseOpsRecord(
        { v: 1, job: 'offsite', ok: null, code: 'not_configured', at, detail: '', metrics: {} },
        'offsite',
        NOW
      )
    ).toMatchObject({ ok: null, code: 'not_configured', metrics: {} })
    expect(
      parseOpsRecord(
        { v: 1, job: 'disk', ok: false, code: 'over_threshold', at, detail: '', metrics: { usedPct: 83, thresholdPct: 80 } },
        'disk',
        NOW
      )
    ).toMatchObject({ ok: false, code: 'over_threshold', metrics: { usedPct: 83, thresholdPct: 80 } })
  })

  it('tolère une date légèrement dans le futur (recalage NTP)', () => {
    const at = new Date(NOW.getTime() + 4 * MINUTE).toISOString()
    expect(parseOpsRecord(dailyLine({ at }), 'backup-daily', NOW)).not.toBeNull()
  })

  it('tronque le détail et le ramène à de l’ASCII imprimable', () => {
    const long = parseOpsRecord(dailyLine({ detail: 'x'.repeat(500) }), 'backup-daily', NOW)
    expect(long?.detail).toHaveLength(OPS_DETAIL_MAX_LENGTH)

    const messy = parseOpsRecord(
      dailyLine({ detail: 'curl: (28) timeout\n\taprès 10 s\u0007' }),
      'backup-daily',
      NOW
    )
    expect(messy?.detail).toBe('curl: (28) timeout apr?s 10 s?')
  })

  it('réduit tout chemin absolu à son nom de fichier (la réponse ne montre pas l’arborescence)', () => {
    const detailOf = (detail: string) => parseOpsRecord(dailyLine({ detail }), 'backup-daily', NOW)?.detail
    expect(detailOf('code de sortie 1, voir /var/log/le-pillaveur-backup.log')).toBe(
      'code de sortie 1, voir le-pillaveur-backup.log'
    )
    expect(detailOf('R2 non configure (RCLONE_REMOTE ou /etc/le-pillaveur/rclone.conf manquant)')).toBe(
      'R2 non configure (RCLONE_REMOTE ou rclone.conf manquant)'
    )
    expect(detailOf('curl 77 : error setting certificate file: /etc/ssl/certs/ca-certificates.crt')).toBe(
      'curl 77 : error setting certificate file: ca-certificates.crt'
    )
    expect(detailOf('/opt/le-pillaveur-backups/prod-1.db.gz introuvable')).toBe('prod-1.db.gz introuvable')
    // Ce que les scripts écrivent vraiment reste intact : URL publique de la
    // sonde, point de montage « / » de la veille disque, nom de sauvegarde.
    expect(detailOf('GET https://lepillaveur.fr/api/health : HTTP 200')).toBe(
      'GET https://lepillaveur.fr/api/health : HTTP 200'
    )
    expect(detailOf('/ occupe a 78 % (seuil 80 %)')).toBe('/ occupe a 78 % (seuil 80 %)')
    expect(detailOf('prod-20260926-030000.db.gz')).toBe('prod-20260926-030000.db.gz')
    for (const detail of [
      'voir /var/log/x.log',
      'fichier=/etc/le-pillaveur/offsite.env',
      '(/root/.config/rclone/rclone.conf)',
    ]) {
      expect(detailOf(detail)).not.toMatch(/\/(etc|var|opt|root)\//)
    }
  })

  it('ne garde que les mesures numériques finies, aux noms sages', () => {
    // `1e400` écrit dans un fichier devient Infinity au JSON.parse : c'est ce
    // nombre-là, non fini, que la route doit écarter (un littéral 1e400 dans
    // le code est refusé par ESLint, no-loss-of-precision).
    const overflow: unknown = JSON.parse('1e400')
    const parsed = parseOpsRecord(
      dailyLine({
        metrics: { sizeBytes: 10, exitCode: '1', ms: overflow, bad: null, 'a b': 3, _x: 4, liste: [1] },
      }),
      'backup-daily',
      NOW
    )
    expect(parsed?.metrics).toEqual({ sizeBytes: 10 })
  })

  it('ne recopie aucune clé hors contrat (une IP ou un compte de débogage)', () => {
    const parsed = parseOpsRecord(
      dailyLine({ ip: '203.0.113.7', user: 'joueur@exemple.fr' }),
      'backup-daily',
      NOW
    )
    expect(Object.keys(parsed ?? {}).sort()).toEqual(
      ['at', 'code', 'detail', 'job', 'metrics', 'ok', 'v'].sort()
    )
    expect(JSON.stringify(parsed)).not.toMatch(/203\.0\.113|@/)
  })
})

describe('parseOpsRecord : ce qui est refusé', () => {
  const refus: Array<[string, unknown]> = [
    ['rien', undefined],
    ['null', null],
    ['un tableau', [dailyLine()]],
    ['une chaîne', JSON.stringify(dailyLine())],
    ['une autre version', dailyLine({ v: 2 })],
    ['une version en texte', dailyLine({ v: '1' })],
    ['une autre tâche que le fichier', dailyLine({ job: 'probe' })],
    ['ok absent', dailyLine({ ok: undefined })],
    ['ok en texte', dailyLine({ ok: 'true' })],
    ['ok numérique', dailyLine({ ok: 1 })],
    ['code absent', dailyLine({ code: undefined })],
    ['code hors snake_case', dailyLine({ code: 'Integrity-Failed' })],
    ['code vide', dailyLine({ code: '' })],
    ['date absente', dailyLine({ at: undefined })],
    ['date illisible', dailyLine({ at: 'hier soir' })],
    ['date non ISO que V8 accepterait', dailyLine({ at: 'Sat Sep 26 2026 03:00:00' })],
    ['date sans fuseau', dailyLine({ at: '2026-09-26T03:00:00' })],
    ['date impossible', dailyLine({ at: '2026-13-45T03:00:00+02:00' })],
    ['date à plus de 5 min dans le futur', dailyLine({ at: new Date(NOW.getTime() + 6 * MINUTE).toISOString() })],
    ['détail absent', dailyLine({ detail: undefined })],
    ['détail numérique', dailyLine({ detail: 42 })],
    ['mesures absentes', dailyLine({ metrics: undefined })],
    ['mesures nulles', dailyLine({ metrics: null })],
    ['mesures en tableau', dailyLine({ metrics: [1, 2] })],
  ]

  for (const [label, raw] of refus) {
    it(`refuse ${label}`, () => {
      expect(parseOpsRecord(raw, 'backup-daily', NOW)).toBeNull()
    })
  }
})

describe('opsJobState', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

  it('inconnu sans ligne', () => {
    expect(opsJobState(null, 'probe', NOW)).toBe('unknown')
  })

  it('ok quand le passage est réussi et récent, jusqu’au seuil inclus', () => {
    expect(opsJobState(record({ at: ago(5 * MINUTE) }), 'probe', NOW)).toBe('ok')
    expect(opsJobState(record({ at: ago(15 * MINUTE) }), 'probe', NOW)).toBe('ok')
  })

  it('en retard au-delà du seuil de la tâche', () => {
    expect(opsJobState(record({ at: ago(15 * MINUTE + 1) }), 'probe', NOW)).toBe('late')
    // Même âge, autre tâche : 20 h, c'est normal pour la quotidienne, pas pour l'horaire.
    const twentyHours = record({ at: ago(20 * HOUR) })
    expect(opsJobState(twentyHours, 'backup-daily', NOW)).toBe('ok')
    expect(opsJobState(twentyHours, 'backup-hourly', NOW)).toBe('late')
  })

  it('en échec quand le dernier passage a échoué, même ancien', () => {
    expect(opsJobState(record({ ok: false, code: 'failed' }), 'backup-daily', NOW)).toBe('failed')
    expect(opsJobState(record({ ok: false, at: ago(10 * 24 * HOUR) }), 'backup-daily', NOW)).toBe('failed')
  })

  it('abstention (ok = null) quand elle est récente, retard sinon', () => {
    expect(opsJobState(record({ ok: null, code: 'not_configured' }), 'offsite', NOW)).toBe('skipped')
    expect(opsJobState(record({ ok: null, at: ago(27 * HOUR) }), 'offsite', NOW)).toBe('late')
  })
})

describe('readOpsStatus', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ops-status-'))
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(dir, { recursive: true, force: true })
  })

  const write = (job: OpsJobId, content: string) => writeFile(path.join(dir, `${job}.json`), content)
  const line = (job: OpsJobId, over: Record<string, unknown> = {}) =>
    JSON.stringify({ ...dailyLine(), job, at: NOW.toISOString(), ...over }) + '\n'

  it('rend chaque tâche dans l’ordre du contrat, avec son seuil', async () => {
    for (const job of OPS_JOB_IDS) await write(job, line(job))
    const status = await readOpsStatus(dir, NOW)
    expect(status.statusDirFound).toBe(true)
    expect(status.jobs.map((view) => view.job)).toEqual([...OPS_JOB_IDS])
    for (const view of status.jobs) {
      expect(view.state).toBe('ok')
      expect(view.maxAgeMs).toBe(OPS_JOB_MAX_AGE_MS[view.job])
      expect(view.record?.job).toBe(view.job)
    }
  })

  it('dossier absent : ne lève pas, tout est inconnu', async () => {
    const status = await readOpsStatus(path.join(dir, 'pas-monte'), NOW)
    expect(status.statusDirFound).toBe(false)
    expect(status.jobs).toHaveLength(OPS_JOB_IDS.length)
    for (const view of status.jobs) {
      expect(view).toMatchObject({ state: 'unknown', record: null })
    }
  })

  it('un fichier cassé ne fait tomber que sa propre tâche', async () => {
    await write('probe', line('probe', { ok: false, code: 'unreachable' }))
    await write('backup-daily', '{"v":1,"job":"backup-daily","ok":tr')
    await write('backup-hourly', '')
    await write('offsite', line('probe'))
    // Un dossier au nom du fichier : stat répond, mais ce n'est pas un fichier.
    await mkdir(path.join(dir, 'disk.json'))

    const status = await readOpsStatus(dir, NOW)
    const byJob = Object.fromEntries(status.jobs.map((view) => [view.job, view]))
    expect(byJob.probe).toMatchObject({ state: 'failed', record: { code: 'unreachable' } })
    for (const job of ['backup-daily', 'backup-hourly', 'offsite', 'disk']) {
      expect(byJob[job], job).toMatchObject({ state: 'unknown', record: null })
    }
  })

  it('refuse un fichier trop gros sans le décoder', async () => {
    const padded = JSON.stringify({ ...JSON.parse(line('probe')), detail: 'x'.repeat(OPS_STATUS_MAX_BYTES) })
    await write('probe', padded)
    const status = await readOpsStatus(dir, NOW)
    expect(status.jobs[0]).toMatchObject({ job: 'probe', state: 'unknown', record: null })
  })

  it('traite un fichier daté dans le futur comme invalide', async () => {
    await write('probe', line('probe', { at: new Date(NOW.getTime() + HOUR).toISOString() }))
    const status = await readOpsStatus(dir, NOW)
    expect(status.jobs[0]).toMatchObject({ state: 'unknown', record: null })
  })

  it('signale le retard d’une tâche qui ne tourne plus', async () => {
    await write('disk', line('disk', { at: new Date(NOW.getTime() - 30 * HOUR).toISOString() }))
    const status = await readOpsStatus(dir, NOW)
    expect(status.jobs.find((view) => view.job === 'disk')?.state).toBe('late')
  })

  it('lit OPS_STATUS_DIR à chaque appel, /app/ops-status sinon', async () => {
    expect(OPS_STATUS_DEFAULT_DIR).toBe('/app/ops-status')
    await write('probe', line('probe'))
    vi.stubEnv('OPS_STATUS_DIR', dir)
    const status = await readOpsStatus(undefined, NOW)
    expect(status.statusDirFound).toBe(true)
    expect(status.jobs[0].state).toBe('ok')
  })
})
