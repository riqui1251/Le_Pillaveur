import { prisma } from '@/lib/prisma'

/**
 * Réglages de fonctionnement du fichier SQLite, posés une fois au démarrage du
 * processus (src/instrumentation.ts).
 *
 * Pourquoi ici et pas dans une migration : une migration décrit le SCHÉMA, pas
 * la façon dont le moteur ouvre le fichier. Deux des trois PRAGMA ci-dessous
 * ne vivent d'ailleurs que le temps d'une connexion.
 *
 * - `busy_timeout=5000` (par connexion) : quand un autre écrivain tient le
 *   verrou, SQLite attend jusqu'à 5 s au lieu de rendre « database is locked »
 *   immédiatement. Posé EN PREMIER, car le passage en WAL ci-dessous a lui
 *   aussi besoin d'un verrou exclusif bref : sans ce délai, un conteneur de
 *   sauvegarde qui lit la base au même instant ferait échouer la bascule.
 *   VÉRIFIÉ sur le client généré du dépôt : le connecteur SQLite de Prisma
 *   pose DÉJÀ 5000 ms de lui-même sur chaque connexion neuve (une lecture de
 *   `PRAGMA busy_timeout` sur un client nu rend 5000). Cet ordre est donc une
 *   confirmation explicite, pas la seule ligne de défense : si le pool recycle
 *   sa connexion, Prisma remet le délai tout seul. Le passer par l'URL de
 *   datasource ne servirait à rien — le paramètre y est accepté puis ignoré.
 * - `journal_mode=WAL` (PERSISTANT, écrit dans l'en-tête du fichier) :
 *   lecteurs et écrivain cessent de se bloquer mutuellement. C'est ce qui
 *   évite qu'un samedi soir — dix tablées qui écrivent leurs coups pendant que
 *   les pages lisent — dégénère en « database is locked ».
 * - `synchronous=NORMAL` (par connexion) : en WAL, la durabilité est garantie
 *   au point de contrôle (checkpoint) et non à chaque transaction. Une coupure
 *   de courant du VPS peut donc coûter les toutes dernières transactions
 *   écrites — quelques coups de la partie en cours, au pire. C'est le
 *   compromis assumé pour des parties de soirée : aucune donnée n'a de valeur
 *   comptable ou légale à la seconde près, et FULL impose un fsync par
 *   transaction que le disque du VPS paie cher. La base elle-même n'est jamais
 *   corrompue par ce réglage (c'est la garantie de WAL) : on ne perd que la
 *   fin de la file.
 *
 * Tout échec est AVALÉ, et ISOLÉ PRAGMA par PRAGMA : une base ouverte en
 * lecture seule (volume monté `:ro`, permissions cassées) doit laisser le site
 * démarrer et répondre, pas l'empêcher de servir. Isolé, parce qu'un seul
 * try/catch autour des trois ferait dépendre le SEUL réglage persistant (WAL)
 * de la réussite de deux réglages de confort qui, eux, ne durent que le temps
 * d'une connexion. Le défaut se voit dans les logs du conteneur.
 *
 * /!\ `$queryRawUnsafe` pour busy_timeout et journal_mode, `$executeRawUnsafe`
 * pour synchronous — ce n'est pas un détail de style. SQLite RETOURNE UNE
 * LIGNE pour `PRAGMA busy_timeout = N` comme pour `PRAGMA journal_mode = WAL`,
 * et le connecteur SQLite de Prisma refuse tout ordre rendu à executeRaw qui
 * produit des lignes : « Execute returned results, which is not allowed in
 * SQLite. ». Vérifié sur le client généré du dépôt. `PRAGMA synchronous = X`,
 * lui, ne rend rien et passe par executeRaw.
 */

/** Ligne rendue par un PRAGMA : une colonne, dont on ne connaît que le nom. */
type PragmaRow = Record<string, unknown>

const globalForDbSetup = globalThis as unknown as {
  sqliteRuntimeSettings: Promise<void> | undefined
}

/**
 * Applique les réglages SQLite, au plus une fois par processus.
 *
 * La garde est sur `globalThis` (et non une variable de module) pour la même
 * raison que le client Prisma : le serveur `standalone` peut charger ce module
 * depuis plusieurs bundles, et les PRAGMA n'ont aucune raison d'être rejoués.
 * C'est la PROMESSE qui est mémorisée : deux appels concurrents attendent la
 * même exécution au lieu d'en lancer deux.
 */
export async function ensureSqliteRuntimeSettings(): Promise<void> {
  if (!globalForDbSetup.sqliteRuntimeSettings) {
    globalForDbSetup.sqliteRuntimeSettings = applySqliteRuntimeSettings()
  }
  await globalForDbSetup.sqliteRuntimeSettings
}

/**
 * Oublie la garde. Réservé aux tests : en production, rejouer les PRAGMA n'a
 * aucun intérêt et masquerait une double initialisation.
 */
export function resetSqliteRuntimeSettingsForTests(): void {
  globalForDbSetup.sqliteRuntimeSettings = undefined
}

async function applySqliteRuntimeSettings(): Promise<void> {
  // Chacun dans son propre filet : WAL est le seul réglage PERSISTANT du lot,
  // il ne doit jamais être privé de son tour par l'échec d'un voisin.
  await tryPragma('busy_timeout', () => prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000'))

  // La seule façon de voir qu'on n'est PAS en WAL : SQLite rend le mode de
  // journal réellement en place (base en lecture seule, système de fichiers
  // qui ne gère pas la mémoire partagée). Sans cette lecture, une base restée
  // en DELETE passerait inaperçue jusqu'au premier soir de charge.
  await tryPragma('journal_mode', async () => {
    const rows = await prisma.$queryRawUnsafe<PragmaRow[]>('PRAGMA journal_mode = WAL')
    const mode = readFirstValue(rows)
    if (mode !== 'wal') {
      console.warn(
        `[db-setup] journal SQLite resté en « ${mode ?? 'inconnu'} » au lieu de WAL : ` +
          'base ouverte en lecture seule ou volume non inscriptible ?'
      )
    }
  })

  await tryPragma('synchronous', () => prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL'))
}

/**
 * Joue un PRAGMA sans jamais laisser son échec remonter ni priver les suivants
 * de leur tour. Aucune donnée personnelle dans la trace : un PRAGMA ne porte
 * ni pseudo, ni e-mail, ni IP — on garde le message du moteur (« attempt to
 * write a readonly database » est exactement ce que l'exploitant doit lire),
 * jamais la pile.
 */
async function tryPragma(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    console.warn(
      `[db-setup] PRAGMA ${name} non appliqué :`,
      error instanceof Error ? error.message : String(error)
    )
  }
}

/** Première valeur de la première ligne d'un PRAGMA, en minuscules. */
function readFirstValue(rows: PragmaRow[] | undefined): string | null {
  const row = Array.isArray(rows) ? rows[0] : undefined
  if (!row || typeof row !== 'object') return null
  const value = Object.values(row)[0]
  return typeof value === 'string' ? value.toLowerCase() : null
}
