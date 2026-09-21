import { schedule } from 'node-cron'
import { errorTrace } from '@/lib/error-trace'
import { runRetentionSweep } from '@/lib/retention-sweep'
import { cleanupAbandonedRooms } from '@/lib/online-room'
import { cleanupStaleCastRooms } from '@/lib/supervision-overview-server'
import { closeOrphanGameSessions } from '@/lib/online/game-sessions'

/**
 * PLANIFICATEUR DU SERVEUR — les ménages qui ne dépendent plus du trafic.
 *
 * Jusqu'ici, tout le ménage du site était porté par les visiteurs : le
 * balayage RGPD partait au premier /api/analytics/ping suivant un
 * redémarrage, et les salles abandonnées n'étaient purgées que si quelqu'un
 * créait une salle. Deux effets pervers :
 *  - un déploiement se fait le soir, donc le premier ping arrive EN PLEINE
 *    soirée : jusqu'à 100 comptes supprimés pendant le pic d'usage ;
 *  - un lundi sans visiteur ne purge rien du tout — salles fantômes, salles
 *    de cast TV et parties « en cours » qui ne finissent jamais.
 * Le serveur se réveille donc seul : une tâche de nuit pour les suppressions,
 * une tâche courte toutes les 5 minutes pour le ménage des tables.
 *
 * UN SEUL CONTENEUR EN PRODUCTION, donc aucun verrou en base : prod-deploy.sh
 * fait `docker rm -f` avant `docker run`, deux conteneurs ne se recouvrent
 * jamais. Le verrou mémoire de `runExclusive` suffit à empêcher qu'une tâche
 * se relance par-dessus elle-même. Le jour où l'on passerait à deux
 * conteneurs, il faudrait un verrou partagé (table SiteSetting, par exemple)
 * AVANT de dupliquer le processus.
 *
 * RGPD : les journaux de ce module ne portent que des noms de tâches, des
 * volumes et des noms de classes d'erreur (errorTrace) — jamais un pseudo, un
 * e-mail ni une IP. L'objet d'erreur complet n'y entre JAMAIS : un message
 * Prisma recopie la ligne fautive, et « retention » supprime des comptes.
 */

/**
 * Fuseau de référence des cadences. Paris plutôt qu'UTC : « 4 h 30 » doit
 * vouloir dire 4 h 30 pour l'exploitant comme pour les joueurs, l'été comme
 * l'hiver (le conteneur, lui, tourne en UTC).
 */
const TIMEZONE = 'Europe/Paris'

/** Une tâche telle qu'elle est ANNONCÉE (sans son corps) : nom, cadence, fuseau. */
export type ScheduledJob = { name: string; cron: string; tz: string }

/** Une tâche telle qu'elle est EXÉCUTÉE. */
type JobDefinition = ScheduledJob & { run: () => Promise<void> }

/**
 * Exécute une étape sans laisser son échec priver les suivantes de leur tour
 * (même principe que les blocs du balayage RGPD). Le libellé est fixe et sans
 * donnée personnelle.
 */
async function runStep(job: string, label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    console.error(`[scheduler] ${job} — étape « ${label} » en échec :`, errorTrace(error))
  }
}

/**
 * Ménage des tables, dans cet ordre et EN SÉRIE :
 *  1. les salles abandonnées partent (elles ferment au passage le journal des
 *     parties qu'elles portaient, à la date du dernier coup) ;
 *  2. les salles de cast TV dépassées partent à leur tour ;
 *  3. la réconciliation ferme ce qui reste ouvert sans salle — donc APRÈS les
 *     suppressions, sinon elle ne verrait pas le travail du même tour.
 * En série et non en parallèle : la base est un SQLite à écrivain unique, et
 * l'ordre ci-dessus fait gagner un tour à la réconciliation.
 */
async function cleanupTables(): Promise<void> {
  await runStep('tables', 'salles abandonnées', cleanupAbandonedRooms)
  await runStep('tables', 'salles de cast', cleanupStaleCastRooms)
  await runStep('tables', 'parties orphelines', async () => {
    const closed = await closeOrphanGameSessions()
    // Journalisé seulement quand il y a eu quelque chose à fermer : 288 tours
    // par jour, on ne remplit pas les journaux de « rien à faire ».
    if (closed > 0) console.log(`[scheduler] tables — ${closed} partie(s) orpheline(s) close(s)`)
  })
}

/**
 * Les tâches du serveur. Deux cadences seulement, choisies pour ce qu'elles
 * coûtent : la nuit pour ce qui supprime des comptes, un quart d'heure de
 * marge pour ce qui fait disparaître une table fantôme de l'écran d'accueil.
 */
const JOBS: readonly JobDefinition[] = [
  {
    name: 'retention',
    // 4 h 30, heure de Paris : le creux de la nuit. Les suppressions de
    // comptes (jusqu'à 100 par passage) ne tombent plus au milieu d'une
    // soirée du simple fait qu'on a déployé à 21 h.
    cron: '30 4 * * *',
    tz: TIMEZONE,
    // `force` : la garde des 6 h de runRetentionSweep sert au filet du ping,
    // pas ici — cette cadence EST la cadence voulue.
    run: () => runRetentionSweep({ force: true }),
  },
  {
    name: 'tables',
    // Toutes les 5 minutes : une salle abandonnée n'est purgée qu'après son
    // propre seuil (1 h), la cadence ne fait que garantir le passage. Court
    // et sans écriture quand il n'y a rien à faire.
    cron: '*/5 * * * *',
    tz: TIMEZONE,
    run: cleanupTables,
  },
]

/**
 * Les tâches annoncées, recopiées : de quoi les afficher ou les vérifier sans
 * pouvoir toucher à la liste réelle ni en exécuter une. Pure.
 */
export function scheduledJobs(): ScheduledJob[] {
  return JOBS.map(({ name, cron, tz }) => ({ name, cron, tz }))
}

/** Tâches en cours, par nom : le verrou anti-recouvrement. */
const running = new Set<string>()

/**
 * Issue d'un tour : exécuté, exécuté mais en échec, ou sauté parce que le
 * tour précédent n'était pas fini.
 */
export type JobOutcome = 'done' | 'failed' | 'skipped'

/**
 * Enveloppe de tout ce que lance le planificateur :
 *  - JAMAIS deux exécutions concurrentes de la même tâche — un balayage plus
 *    long que sa cadence empilerait sinon les passages jusqu'à saturer la
 *    base (mémoire seulement : voir l'en-tête, un seul conteneur) ;
 *  - aucune erreur ne s'échappe : une tâche qui lève est journalisée, et le
 *    processus continue.
 * Exportée pour les tests.
 */
export async function runExclusive(
  name: string,
  run: () => Promise<unknown>
): Promise<JobOutcome> {
  if (running.has(name)) {
    console.warn(`[scheduler] ${name} : tour précédent encore en cours, ce tour est sauté`)
    return 'skipped'
  }
  running.add(name)
  try {
    await run()
    return 'done'
  } catch (error) {
    console.error(`[scheduler] ${name} : échec`, errorTrace(error))
    return 'failed'
  } finally {
    // Dans le `finally` : une tâche qui lève doit rendre son verrou, sinon
    // elle ne repartirait plus jamais jusqu'au redémarrage.
    running.delete(name)
  }
}

/**
 * Lance UNE tâche par son nom, avec son verrou : ce que déclenche chaque
 * cadence, et ce qu'un point d'entrée d'exploitation (« lancer maintenant »)
 * réutiliserait sans risque de recouvrement. Un nom inconnu ne lève pas.
 */
export async function runScheduledJob(name: string): Promise<JobOutcome | 'unknown'> {
  const job = JOBS.find((candidate) => candidate.name === name)
  if (!job) {
    console.error(`[scheduler] tâche inconnue : ${name}`)
    return 'unknown'
  }
  return runExclusive(job.name, job.run)
}

/**
 * Garde d'idempotence, sur globalThis et non en variable de module : en
 * développement, le rechargement à chaud réévalue le module et poserait une
 * deuxième série de tâches à chaque édition. `Symbol.for` : la clé est la
 * même d'un module à l'autre sans risque de collision avec une autre
 * bibliothèque. Exportée pour les tests.
 */
export const SCHEDULER_GUARD: unique symbol = Symbol.for('lepillaveur.scheduler.started')

type SchedulerGlobal = typeof globalThis & { [SCHEDULER_GUARD]?: true }

/**
 * Ce processus doit-il porter le planificateur ? Pure, testée.
 *
 * - pendant `next build` : rien — la construction importe le code serveur
 *   pour le pré-rendu, elle n'a aucune raison de purger la base ;
 * - sous vitest : rien, un test ne doit jamais poser de minuterie de fond.
 *
 * /!\ Le RUNTIME n'est PAS vérifié ici, et ce n'est pas un oubli. `NEXT_RUNTIME`
 * n'existe qu'à la COMPILATION : webpack remplace l'expression littérale
 * `process.env.NEXT_RUNTIME` par 'nodejs' ou 'edge' dans chaque bundle, mais
 * Next n'assigne jamais cette variable au processus (vérifié dans
 * node_modules/next/dist/server : aucune affectation). Lue sur l'objet `env`
 * reçu en paramètre, elle vaut donc `undefined` en production — et une garde
 * `env.NEXT_RUNTIME !== 'nodejs'` empêchait le planificateur de démarrer, en
 * silence, sur le vrai serveur (constaté au test de fumée du standalone :
 * aucune ligne « tâches planifiées » dans les journaux). Le runtime est la
 * responsabilité de src/instrumentation.ts, qui teste l'expression littérale
 * et n'importe ce module que dans le bundle Node.
 */
export function shouldStartScheduler(env: NodeJS.ProcessEnv): boolean {
  if (env.NEXT_PHASE === 'phase-production-build') return false
  if (env.NODE_ENV === 'test' || env.VITEST) return false
  return true
}

/**
 * Pose les tâches. Appelée une fois au démarrage du serveur, depuis
 * `instrumentation.ts` — synchrone (elle ne fait qu'enregistrer des
 * cadences), idempotente, et sans effet là où elle n'a rien à faire.
 */
export function startScheduledJobs(): void {
  if (!shouldStartScheduler(process.env)) return

  const globalWithGuard = globalThis as SchedulerGlobal
  if (globalWithGuard[SCHEDULER_GUARD]) return
  globalWithGuard[SCHEDULER_GUARD] = true

  for (const job of JOBS) {
    schedule(
      job.cron,
      () => {
        void runScheduledJob(job.name).catch(() => {
          // runExclusive attrape déjà tout ; ce filet garantit qu'aucun rejet
          // non géré ne remonte — Node 22 met fin au processus pour cela.
        })
      },
      { timezone: job.tz, name: job.name }
    )
  }
  console.log(`[scheduler] ${JOBS.length} tâches planifiées (${TIMEZONE})`)
}
