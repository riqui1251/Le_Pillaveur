'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock3,
  RefreshCw,
  ServerCog,
} from 'lucide-react'
import { ErrorState, KpiPlaque, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { formatPresenceDuration, type DurationUnits } from '@/lib/format-presence'
import {
  OPS_JOB_IDS,
  type OpsJobId,
  type OpsJobState,
  type OpsJobView,
  type OpsLive,
  type OpsStatusResponse,
  type SchedulerJobView,
} from '@/lib/ops-status-types'
import { PARIS_TIME_ZONE } from '@/lib/paris-time'
import { RETENTION_RUN_STALE_MS } from '@/lib/supervision/retention-run'
import { cn } from '@/lib/utils'

/**
 * « Surveillance » : l'état du serveur, pour les fondateurs seulement.
 *
 * Deux moitiés, qui ne se recouvrent pas :
 * - les TÂCHES ROOT du VPS (sonde, sauvegardes, copie hors serveur, veille
 *   disque) : l'application ne les voit pas tourner, elle relit les fichiers
 *   d'état qu'elles déposent (src/lib/ops-status-types.ts) ;
 * - le conteneur EN DIRECT : ce que le processus Node sait de lui-même.
 *
 * Panneau AUTONOME, comme les plantages côté joueur, mais rafraîchi toutes
 * les 60 s : c'est un écran qu'on laisse ouvert pour surveiller. Cette boucle
 * ne double pas celle de la page (F40) : Radix démonte le contenu d'un onglet
 * fermé, donc le minuteur n'existe que tant que l'onglet est affiché — et il
 * se tait quand l'onglet du NAVIGATEUR passe en arrière-plan.
 *
 * Cet écran n'est PAS l'alerte : quand le site tombe, il tombe avec lui.
 * L'alerte part de healthchecks.io, que la sonde externe ne ping plus.
 */

/** Une minute : la tâche la plus rapide (la sonde) passe toutes les 5 min. */
const REFRESH_MS = 60_000

type IconType = ComponentType<{ className?: string }>

/**
 * Clés du catalogue : les identifiants de tâches sont en kebab-case (noms des
 * fichiers d'état), le catalogue de messages reste en camelCase.
 */
const JOB_MESSAGE_KEY: Record<OpsJobId, string> = {
  probe: 'probe',
  'backup-daily': 'backupDaily',
  'backup-hourly': 'backupHourly',
  offsite: 'offsite',
  disk: 'disk',
}

type CodeFamily = 'probe' | 'backup' | 'offsite' | 'disk'

/** Les deux sauvegardes sortent du MÊME script : mêmes codes, mêmes phrases. */
const CODE_FAMILY: Record<OpsJobId, CodeFamily> = {
  probe: 'probe',
  'backup-daily': 'backup',
  'backup-hourly': 'backup',
  offsite: 'offsite',
  disk: 'disk',
}

/**
 * Codes que l'interface sait traduire. Un code hors liste (script du serveur
 * plus récent que l'application) s'affiche brut plutôt que sous la forme
 * d'une clé de traduction manquante.
 */
const KNOWN_CODES: Record<CodeFamily, readonly string[]> = {
  probe: ['ok', 'http_error', 'keyword_missing', 'unreachable'],
  backup: ['ok', 'integrity_failed', 'gzip_failed', 'failed'],
  offsite: ['ok', 'not_configured', 'no_local_backup', 'stale_local_backup', 'gzip_failed', 'failed'],
  disk: ['ok', 'over_threshold', 'df_failed'],
}

/**
 * Seuil de la veille disque (DISK_ALERT_PCT par défaut de
 * scripts/vps-disk-watch.sh), tant que disk.json n'a pas donné le vrai.
 */
const DEFAULT_DISK_THRESHOLD_PCT = 80

/** Tâches internes que le catalogue sait nommer (src/lib/scheduler.ts). */
const KNOWN_SCHEDULER_JOBS: readonly string[] = ['retention', 'tables']

const STATE_STYLES: Record<OpsJobState, { icon: IconType; pill: string; row: string }> = {
  ok: {
    icon: CircleCheck,
    pill: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    row: 'border-white/10 bg-white/[0.02]',
  },
  late: {
    icon: Clock3,
    pill: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
    row: 'border-amber-400/30 bg-amber-500/[0.05]',
  },
  failed: {
    icon: CircleX,
    pill: 'border-suit-red/50 bg-suit-red/20 text-red-200',
    row: 'border-suit-red/40 bg-suit-red/[0.07]',
  },
  skipped: {
    icon: CircleMinus,
    pill: 'border-white/20 bg-white/[0.06] text-white/70',
    row: 'border-white/10 bg-white/[0.02]',
  },
  unknown: {
    icon: CircleDashed,
    pill: 'border-dashed border-white/25 text-white/70',
    row: 'border-dashed border-white/10 bg-white/[0.01]',
  },
}

/** Issue d'un tour de tâche interne, rendue avec la pastille d'état équivalente. */
const OUTCOME_STATE: Record<NonNullable<SchedulerJobView['lastRun']>['outcome'], OpsJobState> = {
  done: 'ok',
  failed: 'failed',
  skipped: 'late',
}

/** http_error → httpError : les codes des scripts sont en snake_case. */
function camelCode(code: string): string {
  return code.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function finiteMetric(metrics: Record<string, number> | undefined, key: string): number | null {
  const value = metrics?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Pastille d'état : icône ET mot, jamais la couleur seule (daltonisme,
 * capture d'écran en noir et blanc envoyée à quelqu'un d'autre).
 */
function StatePill({ state, label }: { state: OpsJobState; label: string }) {
  const { icon: Icon, pill } = STATE_STYLES[state]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
        pill
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

function useDurationUnits(): DurationUnits {
  const t = useTranslations('supervision.units')
  return { s: t('s'), min: t('min'), h: t('h'), d: t('d') }
}

/** « 26/09/2026 03:00 » à l'heure de Paris, et « il y a 5 heures ». */
function useWhen(now: number) {
  const format = useFormatter()
  return (iso: string): { date: string; relative: string } | null => {
    const at = new Date(iso).getTime()
    if (!Number.isFinite(at)) return null
    return {
      date: format.dateTime(at, { dateStyle: 'short', timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
      // Une horloge de navigateur en retard de quelques secondes sur celle du
      // serveur afficherait « dans 3 secondes » : on borne au présent.
      relative: format.relativeTime(Math.min(at, now), now),
    }
  }
}

export function OpsStatusPanel() {
  const t = useTranslations('supervision.ops')
  const tStates = useTranslations('supervision.states')
  const format = useFormatter()
  const [data, setData] = useState<OpsStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const tRef = useRef(t)
  tRef.current = t
  /** Requête en cours : la suivante l'annule (dernier appel gagnant), le démontage aussi. */
  const abortRef = useRef<AbortController | null>(null)
  /** Début du dernier chargement, pour le retour au premier plan. */
  const lastLoadRef = useRef(0)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    lastLoadRef.current = Date.now()
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/ops-status', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      // Pas de `body.error` : adminErrorResponse le rédige en français quelle
      // que soit la langue (« Accès refusé »), et il se retrouverait collé à
      // une phrase traduite dans le bandeau de rafraîchissement. 403 = session
      // expirée ou grade retiré pendant que l'onglet restait ouvert.
      if (!res.ok) throw new Error(tRef.current(res.status === 403 ? 'forbidden' : 'loadError'))
      // Réponse d'un serveur antérieur à la route, ou page d'erreur du proxy.
      if (!body || typeof body !== 'object' || !body.live || !Array.isArray(body.jobs)) {
        throw new Error(tRef.current('loadError'))
      }
      setData(body as OpsStatusResponse)
      setError(null)
    } catch (e) {
      if (controller.signal.aborted) return
      // TypeError = échec réseau de fetch (« Failed to fetch », en anglais
      // quelle que soit la langue) : le message traduit dit la même chose.
      setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current('loadError'))
    } finally {
      if (abortRef.current === controller) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      // Onglet du navigateur caché : personne ne regarde, on n'interroge pas.
      if (document.visibilityState === 'visible') void load()
    }, REFRESH_MS)
    // De retour au premier plan après une absence : relecture immédiate
    // plutôt qu'un écran vieux de plusieurs minutes jusqu'au prochain tour.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadRef.current >= REFRESH_MS) {
        void load()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      const pending = abortRef.current
      abortRef.current = null
      pending?.abort()
    }
  }, [load])

  // Référence des durées relatives : l'horloge du navigateur au rendu. Chaque
  // tour du minuteur (succès ou échec) rend à nouveau le panneau.
  const now = Date.now()
  const generatedAt = data ? new Date(data.generatedAt).getTime() : NaN
  const refreshedAt = Number.isFinite(generatedAt)
    ? format.dateTime(generatedAt, { timeStyle: 'medium', timeZone: PARIS_TIME_ZONE })
    : null

  const headerActions = (
    <>
      {refreshedAt && (
        <span className="text-[11px] tabular-nums text-white/60">{t('refreshedAt', { time: refreshedAt })}</span>
      )}
      <button
        type="button"
        onClick={() => void load()}
        aria-busy={refreshing}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.06] px-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden />
        {t('refresh')}
      </button>
    </>
  )

  // Seuil réel de la veille disque quand disk.json le donne. La plaque
  // « disque libre » ne s'allume pas pour autant au même instant que la
  // veille : celle-ci compare le Use% de `df -P` (used / (used + avail)),
  // la mesure en direct est l'espace DISPONIBLE pour l'application (statfs,
  // bavail / blocks), réserve root comptée comme occupée — un à deux points
  // plus pessimiste. L'indice de la plaque le dit, pour que les deux lignes
  // ne semblent pas se contredire.
  const diskView = data?.jobs.find((view) => view.job === 'disk')
  const diskThresholdPct = finiteMetric(diskView?.record?.metrics, 'thresholdPct') ?? DEFAULT_DISK_THRESHOLD_PCT

  return (
    <div className="space-y-4">
      <SectionCard
        icon={ServerCog}
        title={t('jobs.title')}
        // La description de SectionCard est en /45 : trop pâle pour un texte
        // qu'on doit lire, on la remonte ici.
        description={<span className="text-white/60">{t('jobs.desc')}</span>}
        actions={headerActions}
        bodyClassName="space-y-3"
      >
        {!data ? (
          error ? (
            <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load()} />
          ) : (
            <SkeletonRows rows={OPS_JOB_IDS.length} />
          )
        ) : (
          <>
            {/* Échec d'un tour alors qu'un état est déjà affiché : on le
                garde (un redémarrage du conteneur dure quelques secondes)
                mais on dit qu'il n'est plus frais. */}
            {error && (
              <div
                role="status"
                className="flex flex-wrap items-center gap-2 rounded-xl border border-suit-red/40 bg-suit-red/10 px-3 py-2 text-xs text-red-200"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 break-words">
                  {t('refreshFailed', { time: refreshedAt ?? '—' })} {error}
                </span>
              </div>
            )}

            {!data.statusDirFound && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t('jobs.noStatusDir')}</p>
                  <p className="mt-0.5 text-xs text-amber-100/80">{t('jobs.noStatusDirHint')}</p>
                </div>
              </div>
            )}

            <ul className="space-y-2">
              {OPS_JOB_IDS.map((id) => (
                <JobRow
                  key={id}
                  // Réponse sans cette tâche (serveur plus ancien que
                  // l'interface) : présentée comme inconnue.
                  view={data.jobs.find((view) => view.job === id) ?? { job: id, state: 'unknown', record: null, maxAgeMs: 0 }}
                  now={now}
                  statusDirFound={data.statusDirFound}
                />
              ))}
            </ul>

            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-white/60">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span className="min-w-0">{t('jobs.alertNote')}</span>
            </p>
          </>
        )}
      </SectionCard>

      {data && <LiveSection live={data.live} generatedAt={generatedAt} diskThresholdPct={diskThresholdPct} now={now} />}
    </div>
  )
}

/**
 * Une tâche root : nom, cadence, pastille, dernier passage, phrase traduite
 * du code, et le détail technique tel que le script l'a écrit.
 *
 * Sans ligne lisible, l'écran n'invente pas de cause : « inconnu » recouvre un
 * fichier absent (tâche jamais passée), un fichier invalide (JSON cassé,
 * version plus récente que l'interface, date dans le futur) et un dossier non
 * monté. Seul ce dernier cas se distingue (statusDirFound), et il le dit.
 */
function JobRow({ view, now, statusDirFound }: { view: OpsJobView; now: number; statusDirFound: boolean }) {
  const t = useTranslations('supervision.ops')
  const format = useFormatter()
  const units = useDurationUnits()
  const when = useWhen(now)
  const key = JOB_MESSAGE_KEY[view.job]
  const record = view.record
  const last = record ? when(record.at) : null

  let phrase: string | null = null
  if (record) {
    const family = CODE_FAMILY[view.job]
    if (KNOWN_CODES[family].includes(record.code)) {
      const metric = (name: string) => finiteMetric(record.metrics, name)
      const asNumber = (name: string) => {
        const value = metric(name)
        return value === null ? '—' : format.number(value, { maximumFractionDigits: 0 })
      }
      // Codes HTTP et de sortie : des identifiants, pas des quantités — sans
      // séparateur de milliers.
      const asCode = (name: string) => {
        const value = metric(name)
        return value === null ? '—' : String(value)
      }
      const sizeBytes = metric('sizeBytes')
      // Toutes les valeurs à chaque phrase : chacune ne lit que les siennes,
      // et une métrique absente s'affiche « — » au lieu de casser le message.
      phrase = t(`codes.${family}.${camelCode(record.code)}`, {
        ms: asNumber('ms'),
        httpCode: asCode('httpCode'),
        exitCode: asCode('exitCode'),
        sizeMb:
          sizeBytes === null ? '—' : format.number(sizeBytes / 1_048_576, { maximumSignificantDigits: 3 }),
        usedPct: asNumber('usedPct'),
        thresholdPct: asNumber('thresholdPct'),
      })
    } else {
      phrase = t('codes.unknown', { code: record.code })
    }
  }

  return (
    <li className={cn('min-w-0 rounded-xl border px-3 py-2.5', STATE_STYLES[view.state].row)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{t(`job.${key}.name`)}</p>
          <p className="flex items-center gap-1 text-xs text-white/60">
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
            {t(`job.${key}.cadence`)}
          </p>
        </div>
        <StatePill state={view.state} label={t(`state.${view.state}`)} />
      </div>

      {view.state === 'late' && view.maxAgeMs > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-200">
          {t('jobs.lateHint', { duration: formatPresenceDuration(view.maxAgeMs / 1000, units) })}
        </p>
      )}

      {record ? (
        <>
          {phrase && <p className="mt-2 break-words text-sm text-white/80">{phrase}</p>}
          <p className="mt-1 text-xs text-white/60">
            {last ? t('jobs.lastRun', { date: last.date, relative: last.relative }) : t('jobs.lastRunUnreadable')}
          </p>
          {record.detail && (
            // Complément technique écrit par le script (ASCII, sans donnée
            // personnelle) : affiché tel quel, en petit.
            <p className="mt-1 break-all font-mono text-[11px] text-white/60" title={t('jobs.detailLabel')}>
              {record.detail}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-white/60">{t(statusDirFound ? 'jobs.noRecord' : 'jobs.noRecordNoDir')}</p>
      )}
    </li>
  )
}

/** Le conteneur tel qu'il se voit : plaques, tâches internes, balayage de conservation. */
function LiveSection({
  live,
  generatedAt,
  diskThresholdPct,
  now,
}: {
  live: OpsLive
  generatedAt: number
  diskThresholdPct: number
  now: number
}) {
  const t = useTranslations('supervision.ops')
  const format = useFormatter()
  const units = useDurationUnits()
  const when = useWhen(now)

  const number = (value: number) => format.number(value, { maximumFractionDigits: 0 })
  const duration = (ms: number) =>
    ms < 1000
      ? t('units.ms', { value: number(ms) })
      : t('units.s', { value: format.number(ms / 1000, { maximumFractionDigits: 1 }) })

  const startedAt = Number.isFinite(generatedAt) ? generatedAt - live.uptimeSec * 1000 : NaN
  const diskUsedPct = live.disk ? 100 - live.disk.freePct : null
  const diskAlert = diskUsedPct !== null && diskUsedPct >= diskThresholdPct

  const retention = live.retentionLastRun
  const retentionAt = retention ? new Date(retention.at).getTime() : NaN
  // Date illisible = trop ancien, jamais « récent » (même règle que la Salle).
  const retentionStale = retention !== null && (!Number.isFinite(retentionAt) || now - retentionAt > RETENTION_RUN_STALE_MS)
  const retentionState: OpsJobState = !retention ? 'unknown' : !retention.ok ? 'failed' : retentionStale ? 'late' : 'ok'
  const retentionWhen = retention ? when(retention.at) : null

  return (
    <SectionCard
      icon={Activity}
      title={t('live.title')}
      description={<span className="text-white/60">{t('live.desc')}</span>}
      bodyClassName="space-y-4"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiPlaque
          label={t('live.version')}
          value={
            <span className="min-w-0 break-all font-mono text-xl sm:text-2xl" title={live.buildSha}>
              {live.buildSha.slice(0, 12)}
            </span>
          }
          hint={t('live.versionHint')}
        />
        <KpiPlaque
          label={t('live.uptime')}
          value={formatPresenceDuration(live.uptimeSec, units)}
          hint={
            Number.isFinite(startedAt)
              ? t('live.uptimeHint', {
                  date: format.dateTime(startedAt, { dateStyle: 'short', timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
                })
              : undefined
          }
        />
        <KpiPlaque
          label={t('live.memory')}
          value={t('units.mb', { value: number(live.memory.rssMb) })}
          hint={t('live.memoryHint', { value: number(live.memory.heapUsedMb) })}
        />
        <KpiPlaque
          label={t('live.db')}
          value={
            !live.db.up
              ? t('live.dbDown')
              : live.db.latencyMs !== null
                ? t('units.ms', { value: number(live.db.latencyMs) })
                : t('live.dbUp')
          }
          hint={live.db.up ? t('live.dbHint') : t('live.dbDownHint')}
          tone={live.db.up ? 'default' : 'alert'}
        />
        <KpiPlaque
          label={t('live.disk')}
          value={live.disk ? t('units.pct', { value: number(live.disk.freePct) }) : '—'}
          // En alerte, le TEXTE change aussi : la couleur seule ne se lit ni
          // pour un daltonien ni sur une capture en noir et blanc, et « 20 % »
          // libre contre un seuil exprimé en occupé obligeait à calculer.
          hint={
            diskUsedPct === null
              ? t('live.unreadable')
              : diskAlert
                ? t('live.diskOver', { used: number(diskUsedPct), pct: number(diskThresholdPct) })
                : t('live.diskHint', { pct: number(diskThresholdPct) })
          }
          tone={diskAlert ? 'alert' : 'default'}
        />
        <KpiPlaque
          label={t('live.streams')}
          value={live.streams.total}
          hint={t('live.streamsHint', { accounts: live.streams.accounts, max: live.streams.maxPerAccount })}
        />
        <KpiPlaque
          label={t('live.crashes')}
          value={live.clientErrors24h ?? '—'}
          hint={live.clientErrors24h === null ? t('live.unreadable') : t('live.crashesHint')}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{t('scheduler.title')}</h3>
        {live.scheduler.length === 0 ? (
          <p className="text-xs text-white/60">{t('scheduler.empty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {live.scheduler.map((job) => {
              const known = KNOWN_SCHEDULER_JOBS.includes(job.name)
              const lastRun = job.lastRun
              const lastWhen = lastRun ? when(lastRun.at) : null
              return (
                <li
                  key={job.name}
                  className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {known ? t(`scheduler.names.${job.name}`) : job.name}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-white/60">
                      {known && <span>{t(`scheduler.cadence.${job.name}`)}</span>}
                      <span className="font-mono">{job.cron}</span>
                      {!known && <span>{job.tz}</span>}
                    </p>
                  </div>
                  {lastRun ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                      {lastRun.outcome in OUTCOME_STATE ? (
                        <StatePill state={OUTCOME_STATE[lastRun.outcome]} label={t(`scheduler.outcome.${lastRun.outcome}`)} />
                      ) : (
                        // Issue inconnue de cette interface : affichée brute.
                        <StatePill state="unknown" label={String(lastRun.outcome)} />
                      )}
                      <span>
                        {t('scheduler.lastRun', {
                          relative: lastWhen?.relative ?? '—',
                          duration: duration(lastRun.durationMs),
                        })}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-white/60">{t('scheduler.noRunYet')}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs leading-relaxed text-white/60">{t('scheduler.note')}</p>
      </div>

      <div className={cn('min-w-0 rounded-xl border px-3 py-2.5', STATE_STYLES[retentionState].row)}>
        <div className="flex flex-wrap items-center gap-2">
          <StatePill state={retentionState} label={t(`state.${retentionState}`)} />
          <span className="min-w-0 break-words text-xs text-white/80">
            {!retention
              ? t('retention.never')
              : retentionWhen
                ? t('retention.lastRun', { date: retentionWhen.date, relative: retentionWhen.relative })
                : t('retention.lastRunUnreadable')}
          </span>
        </div>
        {retention && !retention.ok && <p className="mt-1.5 text-xs text-red-200">{t('retention.failedHint')}</p>}
        {retentionStale && (
          <p className="mt-1.5 text-xs text-amber-200">
            {t('retention.staleHint', { hours: Math.round(RETENTION_RUN_STALE_MS / 3_600_000) })}
          </p>
        )}
      </div>
    </SectionCard>
  )
}
