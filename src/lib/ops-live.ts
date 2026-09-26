import { prisma } from '@/lib/prisma'
import { errorTrace } from '@/lib/error-trace'
import { diskProbeDirs, measureDiskHealth } from '@/lib/disk-health'
import { streamCounts } from '@/lib/online/stream-registry'
import { summarizeClientErrors } from '@/lib/client-errors-server'
import { parseRetentionLastRun, RETENTION_LAST_RUN_KEY } from '@/lib/retention-sweep'
import type { OpsLive, SchedulerJobView } from '@/lib/ops-status-types'

/**
 * ÉTAT EN DIRECT DU CONTENEUR pour l'onglet « Surveillance » (fondateurs) :
 * ce que le processus Node sait de lui-même, là où les fichiers d'état
 * (src/lib/ops-status.ts) disent ce que l'hôte a fait cette nuit.
 *
 * Règle unique : CHAQUE MESURE EST ISOLÉE. Cet écran sert quand quelque chose
 * va mal — base verrouillée, disque plein, module manquant dans le build — et
 * c'est justement là qu'une mesure lève. Si elle entraînait les autres, le
 * panneau tomberait au moment précis où l'on en a besoin. Chaque mesure a donc
 * son repli (null, faux, liste vide) et son délai maximal.
 *
 * RGPD : uniquement des nombres, des dates, des noms de tâches et le sha du
 * build. Les journaux ne portent que le libellé fixe de la mesure et le nom de
 * classe de l'erreur (errorTrace) : un message Prisma recopie la ligne fautive.
 */

/**
 * Délai maximal d'une mesure. Au-delà, elle rend son repli : une requête
 * coincée derrière la connexion unique de Prisma (socket_timeout = 15 s) ne
 * doit pas tenir le panneau en attente. 5 s pour lire une ligne, c'est déjà
 * une panne du point de vue d'un joueur — « base injoignable » n'est pas un
 * mensonge.
 */
export const OPS_LIVE_MEASURE_TIMEOUT_MS = 5000

const BYTES_PER_MB = 1024 * 1024

class OpsMeasureTimeout extends Error {
  constructor() {
    super('délai dépassé')
    this.name = 'OpsMeasureTimeout'
  }
}

/**
 * Exécute une mesure avec son repli : jamais d'exception, jamais plus de
 * OPS_LIVE_MEASURE_TIMEOUT_MS d'attente.
 *
 * /!\ La mesure abandonnée au délai CONTINUE de tourner, et peut encore
 * rejeter plus tard. C'est sans danger TANT QU'ELLE PASSE PAR `Promise.race` :
 * la course s'abonne à chaque concurrent, le rejet tardif a donc un écouteur.
 * Ne jamais « optimiser » en attendant la mesure hors de la course — un rejet
 * sans écouteur met fin au processus sous Node 22, et tout le site tomberait
 * pour avoir ouvert l'onglet (le test du délai le vérifie).
 */
async function measure<T>(label: string, run: () => T | Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  // `.then(run)` : une mesure qui lève de façon synchrone devient un rejet,
  // rattrapé comme les autres.
  const pending = Promise.resolve().then(run)
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OpsMeasureTimeout()), OPS_LIVE_MEASURE_TIMEOUT_MS)
    })
    return await Promise.race([pending, timeout])
  } catch (error) {
    console.error(`[ops-live] mesure « ${label} » en échec :`, errorTrace(error))
    return fallback
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Même requête que /api/health (`count` borné à une ligne sur User) : elle
 * prouve que le volume est monté ET que le schéma est migré, là où un
 * `SELECT 1` répondrait sur un fichier recréé vide. Chronométrée ; le repli
 * (base injoignable) ne dit rien de l'erreur.
 */
async function measureDb(): Promise<OpsLive['db']> {
  const started = performance.now()
  await prisma.user.count({ take: 1 })
  return { up: true, latencyMs: Math.round(performance.now() - started) }
}

/** Témoin du balayage de conservation, réduit à ce que l'écran affiche. */
async function measureRetention(): Promise<OpsLive['retentionLastRun']> {
  const row = await prisma.siteSetting.findUnique({ where: { key: RETENTION_LAST_RUN_KEY } })
  const lastRun = parseRetentionLastRun(row?.value)
  // `counts` et `failed` restent dans l'onglet Vue d'ensemble : ici, seule la
  // question « est-il passé, et sans échec ? » compte.
  return lastRun ? { at: lastRun.at, ok: lastRun.ok } : null
}

/**
 * Tâches internes, chargées à la DEMANDE : le planificateur tire node-cron, le
 * seul module dont la présence dans `.next/standalone` dépend du traçage de
 * Next (voir instrumentation.ts). S'il manque, l'onglet doit s'afficher quand
 * même — et montrer une liste vide, qui dit justement que rien ne tourne.
 */
async function measureScheduler(): Promise<SchedulerJobView[]> {
  const { schedulerJobViews } = await import('@/lib/scheduler')
  return schedulerJobViews()
}

/**
 * Mémoire du processus, en Mo. `process.memoryUsage()` lit /proc et peut lever
 * (EMFILE quand le processus n'a plus de descripteur libre) : dans ce cas les
 * compteurs valent 0, faute de place pour « inconnu » dans le contrat.
 */
function measureMemory(): OpsLive['memory'] {
  try {
    const { rss, heapUsed } = process.memoryUsage()
    return { rssMb: Math.round(rss / BYTES_PER_MB), heapUsedMb: Math.round(heapUsed / BYTES_PER_MB) }
  } catch (error) {
    console.error('[ops-live] mesure « mémoire » en échec :', errorTrace(error))
    return { rssMb: 0, heapUsedMb: 0 }
  }
}

/**
 * Relevé complet, pour GET /api/admin/ops-status. Ne lève jamais.
 *
 * En DEUX temps, et ce n'est pas de la lenteur gratuite : Prisma n'a qu'UNE
 * connexion (src/lib/prisma.ts), qui sérialise les requêtes. Lancée en même
 * temps que les deux autres lectures, la mesure de latence compterait leur
 * attente et afficherait une base « lente » que nous aurions nous-mêmes
 * encombrée. Elle part donc seule (avec les mesures qui ne touchent pas la
 * base), puis viennent les lectures.
 */
export async function collectOpsLive(): Promise<OpsLive> {
  const [db, disk, scheduler, streams] = await Promise.all([
    measure<OpsLive['db']>('base', measureDb, { up: false, latencyMs: null }),
    measure<OpsLive['disk']>(
      'disque',
      () => measureDiskHealth(diskProbeDirs(process.env.DATABASE_URL, process.cwd())),
      null
    ),
    measure<OpsLive['scheduler']>('planificateur', measureScheduler, []),
    measure<OpsLive['streams']>('flux', streamCounts, { total: 0, accounts: 0, maxPerAccount: 0 }),
  ])
  const [clientErrors24h, retentionLastRun] = await Promise.all([
    measure<OpsLive['clientErrors24h']>(
      'plantages',
      async () => (await summarizeClientErrors()).total24h,
      null
    ),
    measure<OpsLive['retentionLastRun']>('conservation', measureRetention, null),
  ])

  return {
    buildSha: process.env.NEXT_PUBLIC_BUILD_SHA || 'dev',
    uptimeSec: Math.floor(process.uptime()),
    memory: measureMemory(),
    db,
    disk,
    streams,
    clientErrors24h,
    scheduler,
    retentionLastRun,
  }
}
