import { PrismaClient } from '@prisma/client'

/**
 * Paramètres imposés à la datasource SQLite, et SEULE source de vérité du
 * projet pour ces réglages : ni le `docker run` de scripts/prod-deploy.sh ni
 * le `.env` ne les portent. La raison est que DATABASE_URL sert aussi au CLI
 * Prisma (`migrate deploy`, `db execute`) lancé dans des conteneurs jetables,
 * où un pool bridé n'a aucun sens ; c'est l'application — et elle seule — qui
 * a besoin de la contrainte. Poser les paramètres ici évite d'avoir à les
 * répéter (et à les oublier) dans chaque script du VPS.
 *
 * - `connection_limit=1` : UNE connexion côté Prisma. SQLite n'accepte de
 *   toute façon qu'un seul écrivain à la fois sur le fichier ; avec le pool
 *   par défaut (nombre de cœurs × 2 + 1), les rafales d'écritures concurrentes
 *   du code (Promise.all d'upserts au lancement d'une partie, purges lancées
 *   en parallèle) se battaient pour ce verrou et remontaient en
 *   « database is locked ». Avec une seule connexion, Prisma SÉRIALISE les
 *   requêtes dans sa file : elles ATTENDENT leur tour au lieu d'échouer.
 * - `socket_timeout=15` : au-delà de 15 s d'attente, on préfère une erreur
 *   franche à une requête qui pend indéfiniment derrière la file.
 *
 * /!\ CONSÉQUENCE À NE JAMAIS OUBLIER : avec une seule connexion, une
 * transaction interactive `prisma.$transaction(async (tx) => …)` OCCUPE la
 * connexion pour toute sa durée. Si le callback appelle `prisma.` (ou une
 * fonction qui utilise le client global), cette requête attend une connexion
 * libre qui ne se libérera qu'à la fin de la transaction : interblocage
 * jusqu'au socket_timeout. Dans un callback interactif, on n'utilise QUE
 * `tx`. Le projet compte UNE transaction interactive — l'enregistrement des
 * résultats de fin de partie (routes /api/online/rooms/[roomId]/action, via
 * recordMatchResults, qui ne touche au client que par le `client` reçu) ;
 * partout ailleurs c'est la forme tableau `$transaction([...])`, qui n'a pas
 * ce piège. Avant d'en ouvrir une deuxième : relire ce paragraphe.
 */
const SQLITE_CONNECTION_PARAMS: ReadonlyArray<readonly [string, string]> = [
  ['connection_limit', '1'],
  ['socket_timeout', '15'],
]

/**
 * Ajoute les paramètres ci-dessus à une URL de datasource SQLite, sans écraser
 * ceux déjà présents (un réglage explicite dans l'environnement gagne).
 *
 * Volontairement écrit à la main plutôt qu'avec `new URL()` : les URL du
 * projet sont de la forme `file:./prisma/dev.db` ou `file:/app/prisma/prod.db`,
 * que le parseur d'URL normalise de façon surprenante pour un chemin relatif.
 */
export function withSqliteConnectionParams(url: string): string {
  const separator = url.indexOf('?')
  const base = separator === -1 ? url : url.slice(0, separator)
  const params = new URLSearchParams(separator === -1 ? '' : url.slice(separator + 1))
  for (const [key, value] of SQLITE_CONNECTION_PARAMS) {
    if (!params.has(key)) params.set(key, value)
  }
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  // Sans DATABASE_URL (tests, outillage), on laisse Prisma lire lui-même
  // l'environnement et lever son erreur habituelle : la surcharger ici
  // n'apporterait qu'un message moins clair.
  return url ? new PrismaClient({ datasourceUrl: withSqliteConnectionParams(url) }) : new PrismaClient()
}

/**
 * Client unique du processus, mémorisé sur `globalThis` — y compris en
 * production. Le rechargement à chaud du développement recréait un client par
 * recompilation ; en production, le serveur `standalone` peut charger ce
 * module depuis plusieurs bundles (route handlers, instrumentation) et
 * ouvrirait alors autant de pools. Or tout l'intérêt de `connection_limit=1`
 * est qu'il n'y ait qu'UNE connexion pour tout le processus : la garde globale
 * fait partie du réglage, pas du confort de développement.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

globalForPrisma.prisma = prisma
