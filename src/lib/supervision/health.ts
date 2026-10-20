import type { OpsJobId, OpsJobState, OpsJobView } from '@/lib/ops-status-types'
import type { RetentionLastRun } from '@/lib/retention-sweep'
import { RETENTION_RUN_STALE_MS, retentionRunStatus } from '@/lib/supervision/retention-run'

/**
 * Bandeau santé de la Salle — module PUR : quelles pastilles afficher d'après
 * ce que la page a déjà chargé. Aucun appel réseau ni traduction ici : la page
 * passe ses données et sa fonction de traduction (`text`), le test une fausse.
 */

export type HealthTone = 'ok' | 'warn' | 'bad'

export type HealthKey = 'probe' | 'backups' | 'ops' | 'retention' | 'crashes' | 'stalled'

export type HealthPill = {
  key: HealthKey
  tone: HealthTone
  /** Nom court (« Site », « Sauvegardes »…). */
  label: string
  /** État en clair, affiché après le nom dans une pastille d'alerte. */
  detail: string
}

/** Clé de la pastille verte qui regroupe tout ce qui va bien. */
export const HEALTH_OK_GROUP = 'ok'

/**
 * Traduction d'une clé du namespace `supervision` (« health.labels.probe »,
 * « ops.state.late »…), valeurs ICU comprises.
 */
export type HealthText = (key: string, values?: Record<string, string | number>) => string

export type HealthInput = {
  /**
   * Tâches root du VPS (fondateurs seulement). undefined : pas chargées ou
   * rôle sans accès — aucune pastille ; null : lecture en échec.
   */
  opsJobs?: readonly OpsJobView[] | null
  /** Dernier ménage. undefined : inconnu (vue non chargée, serveur antérieur) ; null : jamais passé. */
  retention?: RetentionLastRun | null
  /** Plantages côté joueur des dernières 24 h. undefined : pas chargés ; null : lecture en échec. */
  crashes24h?: number | null
  /**
   * Tables de JEU sans signe de vie, comptées en base hors diffusion TV : le
   * comptage de la tuile « Tables figées », pas la liste plafonnée. undefined :
   * vue non chargée.
   */
  stalledTables?: number
  now: number
}

const BACKUP_JOBS: readonly OpsJobId[] = ['backup-daily', 'backup-hourly', 'offsite']

/** Clé du catalogue d'une tâche (noms de fichiers en kebab-case, catalogue en camelCase). */
const JOB_MESSAGE_KEY: Record<OpsJobId, string> = {
  probe: 'probe',
  'backup-daily': 'backupDaily',
  'backup-hourly': 'backupHourly',
  offsite: 'offsite',
  disk: 'disk',
}

const TONE_RANK: Record<HealthTone, number> = { ok: 0, warn: 1, bad: 2 }

/**
 * Ton d'une tâche root. « Sans effet » (copie hors serveur non configurée,
 * choix délibéré) reste vert : une pastille orange permanente apprendrait à
 * ignorer le bandeau — l'onglet Serveur continue de l'écrire. « Inconnu »
 * (aucune ligne lisible, dossier non monté) n'est jamais présenté comme sain.
 */
export function jobTone(state: OpsJobState): HealthTone {
  if (state === 'failed') return 'bad'
  if (state === 'late' || state === 'unknown') return 'warn'
  return 'ok'
}

function worstTone(tones: readonly HealthTone[]): HealthTone {
  return tones.reduce<HealthTone>((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst), 'ok')
}

function jobView(jobs: readonly OpsJobView[], job: OpsJobId): OpsJobView {
  // Réponse sans cette tâche (serveur plus ancien) : inconnue, comme l'onglet Serveur.
  return jobs.find((view) => view.job === job) ?? { job, state: 'unknown', record: null, maxAgeMs: 0 }
}

function jobPhrase(view: OpsJobView, text: HealthText): string {
  return text('health.jobState', {
    job: text(`ops.job.${JOB_MESSAGE_KEY[view.job]}.name`),
    state: text(`ops.state.${view.state}`),
  })
}

/**
 * Pastilles dans l'ordre de lecture : site, sauvegardes, ménage, plantages,
 * tables. Une entrée non chargée n'en produit aucune — le bandeau n'affirme
 * jamais qu'un état inconnu va bien.
 */
export function healthPills(input: HealthInput, text: HealthText): HealthPill[] {
  const pills: HealthPill[] = []
  const label = (key: HealthKey) => text(`health.labels.${key}`)

  if (input.opsJobs === null) {
    pills.push({ key: 'ops', tone: 'warn', label: label('ops'), detail: text('health.opsUnreadable') })
  } else if (input.opsJobs !== undefined) {
    const probe = jobView(input.opsJobs, 'probe')
    pills.push({ key: 'probe', tone: jobTone(probe.state), label: label('probe'), detail: text(`ops.state.${probe.state}`) })

    const backups = BACKUP_JOBS.map((job) => jobView(input.opsJobs ?? [], job))
    const tone = worstTone(backups.map((view) => jobTone(view.state)))
    // En alerte, seules les tâches en cause sont nommées ; sinon toutes.
    const shown = tone === 'ok' ? backups : backups.filter((view) => jobTone(view.state) !== 'ok')
    // Toutes dans le même état : l'état seul, plutôt que trois fois le même mot dans une pastille.
    const sameState = shown.length > 1 && shown.every((view) => view.state === shown[0].state)
    pills.push({
      key: 'backups',
      tone,
      label: label('backups'),
      detail: sameState
        ? text(`ops.state.${shown[0].state}`)
        : shown.map((view) => jobPhrase(view, text)).join(' · '),
    })
  }

  if (input.retention === null) {
    pills.push({ key: 'retention', tone: 'warn', label: label('retention'), detail: text('health.retentionNever') })
  } else if (input.retention !== undefined) {
    const status = retentionRunStatus(input.retention, input.now)
    const hours = Math.round(RETENTION_RUN_STALE_MS / 3_600_000)
    const detail =
      status.failed.length > 0 || status.errored
        ? text('health.retentionFailed', { count: status.failed.length })
        : status.stale
          ? text('health.retentionStale', { hours })
          : text('health.retentionOk', { hours })
    pills.push({ key: 'retention', tone: status.alert ? 'bad' : 'ok', label: label('retention'), detail })
  }

  if (input.crashes24h === null) {
    pills.push({ key: 'crashes', tone: 'warn', label: label('crashes'), detail: text('health.crashesUnreadable') })
  } else if (input.crashes24h !== undefined) {
    pills.push({
      key: 'crashes',
      tone: input.crashes24h > 0 ? 'warn' : 'ok',
      label: label('crashes'),
      detail: text('health.crashes', { count: input.crashes24h }),
    })
  }

  if (input.stalledTables !== undefined) {
    pills.push({
      key: 'stalled',
      tone: input.stalledTables > 0 ? 'bad' : 'ok',
      label: label('stalled'),
      detail: text('health.stalled', { count: input.stalledTables }),
    })
  }

  return pills
}

/**
 * Alertes d'abord, les plus graves en tête (ordre de lecture conservé à
 * gravité égale) ; tout ce qui va bien rejoint UNE pastille verte.
 */
export function splitHealthPills(pills: readonly HealthPill[]): { alerts: HealthPill[]; ok: HealthPill[] } {
  const alerts = pills
    .map((pill, index) => ({ pill, index }))
    .filter(({ pill }) => pill.tone !== 'ok')
    .sort((a, b) => TONE_RANK[b.pill.tone] - TONE_RANK[a.pill.tone] || a.index - b.index)
    .map(({ pill }) => pill)
  return { alerts, ok: pills.filter((pill) => pill.tone === 'ok') }
}
