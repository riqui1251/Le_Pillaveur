import { PrismaClient } from '@prisma/client'
import { displayNameKey } from '@/lib/name-moderation/confusables'

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

type Fields = Record<string, unknown>

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Clé d'un pseudo écrit (chaîne ou `{ set }`), null s'il est effacé, undefined sinon. */
function keyOfWrittenName(value: unknown): string | null | undefined {
  const written = isFields(value) && 'set' in value ? value.set : value
  if (typeof written === 'string') return displayNameKey(written)
  return written === null ? null : undefined
}

function withKeysInData(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(withKeysInData)
  if (!isFields(data)) return data
  const next: Fields = { ...data }
  const displayKey = keyOfWrittenName(data.displayName)
  if (displayKey !== undefined) next.displayNameKey = displayKey
  // Le pseudo en ligne vit dans `name` (route online-display-name, auth-server).
  const onlineKey = keyOfWrittenName(data.name)
  if (onlineKey !== undefined) next.onlineDisplayNameKey = onlineKey
  return next
}

/** Champs d'arguments qui portent des données écrites, par opération sur User. */
const USER_WRITE_DATA_FIELDS: Readonly<Record<string, readonly string[]>> = {
  create: ['data'],
  createMany: ['data'],
  createManyAndReturn: ['data'],
  update: ['data'],
  updateMany: ['data'],
  updateManyAndReturn: ['data'],
  upsert: ['create', 'update'],
}

/**
 * Pose User.displayNameKey / onlineDisplayNameKey dès qu'une écriture touche
 * displayName ou name : un seul endroit pour toutes les routes, et la clé ne
 * peut pas diverger du pseudo. Les écritures imbriquées (user: { create })
 * n'y passent pas : le projet n'en fait aucune sur User.
 */
export function withDisplayNameKeys<T>(operation: string, args: T): T {
  const fields = USER_WRITE_DATA_FIELDS[operation]
  if (!fields || !isFields(args)) return args
  const next: Fields = { ...args }
  for (const field of fields) {
    if (field in args) next[field] = withKeysInData(args[field])
  }
  return next as T
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  // Sans DATABASE_URL (tests, outillage), on laisse Prisma lire lui-même
  // l'environnement et lever son erreur habituelle : la surcharger ici
  // n'apporterait qu'un message moins clair.
  const client = url ? new PrismaClient({ datasourceUrl: withSqliteConnectionParams(url) }) : new PrismaClient()
  const extended = client.$extends({
    name: 'displayNameKeys',
    query: {
      user: {
        create: ({ args, query }) => query(withDisplayNameKeys('create', args)),
        createMany: ({ args, query }) => query(withDisplayNameKeys('createMany', args)),
        createManyAndReturn: ({ args, query }) => query(withDisplayNameKeys('createManyAndReturn', args)),
        update: ({ args, query }) => query(withDisplayNameKeys('update', args)),
        updateMany: ({ args, query }) => query(withDisplayNameKeys('updateMany', args)),
        updateManyAndReturn: ({ args, query }) => query(withDisplayNameKeys('updateManyAndReturn', args)),
        upsert: ({ args, query }) => query(withDisplayNameKeys('upsert', args)),
      },
    },
  })
  // Une extension de requêtes ne change ni les modèles ni les résultats : le
  // client garde son type de base, celui qu'attendent les fonctions qui le
  // reçoivent en paramètre (rankings, match-results…).
  return extended as unknown as PrismaClient
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
