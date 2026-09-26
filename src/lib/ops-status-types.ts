/**
 * Contrat partagé de l'onglet « Surveillance » (fondateurs seulement).
 *
 * Deux moitiés :
 * - les FICHIERS D'ÉTAT que les tâches root du VPS (sauvegardes, copie
 *   off-site, veille disque, sonde externe) écrivent dans
 *   /var/lib/le-pillaveur-status/<job>.json, monté en lecture seule dans le
 *   conteneur sous /app/ops-status ;
 * - la RÉPONSE de GET /api/admin/ops-status, que lit le panneau.
 *
 * Les fichiers d'état sont écrits par des scripts shell : une ligne JSON,
 * écriture atomique (fichier temporaire puis mv). Aucune donnée personnelle :
 * des codes, des horodatages, des nombres, un nom de fichier de sauvegarde.
 */

/** Ordre d'affichage : la sonde d'abord (le site répond-il ?), puis la nuit. */
export const OPS_JOB_IDS = ['probe', 'backup-daily', 'backup-hourly', 'offsite', 'disk'] as const
export type OpsJobId = (typeof OPS_JOB_IDS)[number]

/**
 * Une ligne écrite par un script. `ok` vaut `null` quand la tâche s'est
 * volontairement abstenue (copie off-site non configurée) : ni succès ni échec.
 * `code` est un identifiant stable en snake_case, traduit par l'interface ;
 * `detail` est un complément technique court, ASCII, affiché tel quel.
 */
export type OpsJobRecord = {
  v: 1
  job: OpsJobId
  ok: boolean | null
  code: string
  at: string
  detail: string
  metrics: Record<string, number>
}

/**
 * - ok      : dernier passage réussi, et assez récent ;
 * - late    : dernier passage trop ancien pour la cadence de la tâche (la
 *             tâche ne tourne plus, ou le serveur était éteint) ;
 * - failed  : dernier passage en échec ;
 * - skipped : dernier passage volontairement sans effet (ok = null) ;
 * - unknown : aucune ligne lisible — fichier absent (tâche jamais passée),
 *             fichier invalide, ou dossier non monté (statusDirFound).
 */
export type OpsJobState = 'ok' | 'late' | 'failed' | 'skipped' | 'unknown'

export type OpsJobView = {
  job: OpsJobId
  state: OpsJobState
  record: OpsJobRecord | null
  /** Âge maximal accepté avant de passer « en retard », en millisecondes. */
  maxAgeMs: number
}

export type SchedulerJobView = {
  name: string
  cron: string
  tz: string
  /** Dernier tour DEPUIS LE DÉMARRAGE du conteneur (rien n'est persisté). */
  lastRun: { at: string; outcome: 'done' | 'failed' | 'skipped'; durationMs: number } | null
}

export type OpsLive = {
  /** NEXT_PUBLIC_BUILD_SHA, « dev » en local. */
  buildSha: string
  /** Secondes depuis le démarrage du processus Node. */
  uptimeSec: number
  memory: { rssMb: number; heapUsedMb: number }
  db: { up: boolean; latencyMs: number | null }
  disk: { freePct: number } | null
  streams: { total: number; accounts: number; maxPerAccount: number }
  /** Plantages côté joueur remontés ces dernières 24 h ; null si illisible. */
  clientErrors24h: number | null
  scheduler: SchedulerJobView[]
  /** Dernier balayage de conservation (persisté en base, survit aux redémarrages). */
  retentionLastRun: { at: string; ok: boolean } | null
}

export type OpsStatusResponse = {
  generatedAt: string
  live: OpsLive
  jobs: OpsJobView[]
  /** Faux tant que le dossier monté est absent (conteneur lancé sans le volume). */
  statusDirFound: boolean
}
