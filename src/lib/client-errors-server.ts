import { prisma } from '@/lib/prisma'
import { parseDeviceFromUserAgent } from '@/lib/device-from-user-agent'
import {
  CLIENT_ERROR_FIELD_LIMITS,
  normalizeClientErrorPath,
  truncateField,
} from '@/lib/client-error-report'

/**
 * PLANTAGES CÔTÉ JOUEUR, côté serveur : validation stricte de ce que le
 * navigateur envoie, enregistrement DÉDOUBLONNÉ, lecture pour la Supervision
 * et purge. Le pendant de src/lib/client-error-report.ts, dont il reprend les
 * limites de champs (une seule définition).
 *
 * Dédoublonnage : une même erreur (nom, message, chemin, sha) reçue deux fois
 * en 10 minutes n'ajoute pas une ligne, elle incrémente `count`. Une tablée de
 * six téléphones qui plante sur le même bogue fait UNE ligne « ×6 », pas six ;
 * et une boucle de « Réessayer » ne remplit pas la table.
 *
 * RGPD : rien ici ne se rattache à une personne. Pas d'IP (la clé de quota
 * vit en mémoire, dans rate-limit.ts, et n'est jamais écrite), pas de compte,
 * pas d'UA brut — seulement sa famille —, pas de query string. Les journaux
 * de ce module ne portent que des volumes.
 */

/** Fenêtre de dédoublonnage : deux rapports identiques à moins de 10 min = une ligne. */
export const CLIENT_ERROR_DEDUP_WINDOW_MS = 10 * 60 * 1000

/** Conservation : un plantage vieux d'un mois n'apprend plus rien, il part. */
export const CLIENT_ERROR_RETENTION_DAYS = 30

/** Fenêtre du total affiché en tête du panneau de Supervision. */
export const CLIENT_ERROR_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

/** Nombre de groupes affichés en Supervision. */
export const CLIENT_ERROR_GROUPS_SHOWN = 20

/**
 * Plafond de CRÉATIONS de lignes par 24 h, toutes sources confondues. Le
 * dédoublonnage ne protège que contre la tempête légitime (la même erreur
 * répétée) ; un rapport distinct à chaque envoi créait une ligne par requête,
 * et les quotas de la route (par réseau, global) bornent le débit, pas le
 * volume sur une journée. 500 : un vrai soir de plantages en fait quelques
 * dizaines ; au-delà, on garde la table lisible et le disque tranquille, et
 * les répétitions des lignes existantes continuent d'être comptées.
 */
export const CLIENT_ERROR_DAILY_CREATE_CAP = 500

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Famille d'appareil stockée. Trois valeurs seulement : ce qui compte pour
 * l'exploitant est « téléphone ou pas » — un plantage sur mobile en soirée
 * n'a pas la même urgence qu'un plantage sur PC.
 */
export type ClientErrorDevice = 'mobile' | 'tablet' | 'desktop'

/** Rapport tel qu'il est ACCEPTÉ : déjà vérifié, borné et nettoyé. */
export type ClientErrorInput = {
  name: string
  message: string
  digest: string | null
  path: string
  buildSha: string | null
  locale: string
}

/**
 * Famille d'appareil depuis l'UA, JAMAIS l'UA lui-même : mobile et tablette
 * telles que les reconnaît device-from-user-agent ; tout le reste (Mac, PC,
 * UA absent ou inconnu) est « desktop » — un téléphone se reconnaît toujours à
 * son UA, une absence d'UA est un script, pas un joueur.
 */
export function deviceFamilyFromUserAgent(userAgent: string | null | undefined): ClientErrorDevice {
  const kind = parseDeviceFromUserAgent(userAgent)
  if (kind === 'mobile' || kind === 'tablet') return kind
  return 'desktop'
}

/**
 * Chaîne d'un seul tenant, sans caractère de contrôle (ni retour à la ligne).
 * `\p{Cc}` couvre C0, DEL et les contrôles C1 (U+0080–U+009F), comme le
 * nettoyage des pseudos (src/lib/players.ts) — sans désactiver de règle eslint.
 */
function isCleanString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && !/\p{Cc}/u.test(value)
}

/** Champ facultatif : absent, null, ou une chaîne acceptée par `accept`. */
function optionalField(value: unknown, accept: (raw: string) => boolean): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  if (value === '') return null
  return accept(value) ? value : undefined
}

/**
 * Validation STRICTE du corps reçu : types, longueurs, formes. Renvoie null
 * au moindre écart plutôt que de « réparer » — un rapport qui ne respecte pas
 * le contrat du module client ne vient pas de lui, on ne l'enregistre pas.
 *
 * Deux exceptions voulues, parce qu'elles protègent la table plutôt que le
 * contrat : le message est TRONQUÉ à 300 (un message long est un message
 * normal, pas une attaque), et le chemin repasse par la normalisation du
 * client (query et hash coupés, identifiants masqués) — si un client ancien
 * ou bricolé envoyait un ?token=, il n'atteindrait pas la base.
 */
export function parseClientErrorReport(body: unknown): ClientErrorInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  const limits = CLIENT_ERROR_FIELD_LIMITS

  if (!isCleanString(raw.name, limits.name)) return null
  const name = raw.name.trim()
  if (!name) return null

  if (typeof raw.message !== 'string') return null
  const message = truncateField(raw.message, limits.message)

  // Longueur jugée sur le chemin REÇU : la normalisation ne fait que
  // raccourcir (query coupée, identifiant masqué), elle ne rattrape rien.
  if (!isCleanString(raw.path, limits.path) || !raw.path.startsWith('/')) return null
  const path = normalizeClientErrorPath(raw.path)
  if (!/^\/\S*$/.test(path)) return null

  if (!isCleanString(raw.locale, limits.locale) || !/^[a-z]{2}(-[a-zA-Z]{2})?$/.test(raw.locale)) {
    return null
  }

  // Digest Next : un hachage court ; sha de build : hexadécimal ou un tag
  // court (le chantier « déploiement » choisit la forme, la longueur est le
  // contrat). Une forme inattendue invalide le rapport, on ne devine pas.
  const digest = optionalField(raw.digest, (d) => d.length <= limits.digest && /^[A-Za-z0-9_-]+$/.test(d))
  if (digest === undefined) return null
  const buildSha = optionalField(
    raw.buildSha,
    (sha) => sha.length <= limits.buildSha && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sha)
  )
  if (buildSha === undefined) return null

  return { name, message, digest, path, buildSha, locale: raw.locale }
}

/**
 * Enregistre un rapport, ou incrémente la ligne identique de la fenêtre.
 * `updateMany` plutôt que findFirst + update : UNE requête, atomique, dans le
 * cas de loin le plus fréquent (la répétition). S'il n'y avait rien à
 * incrémenter, la ligne est créée — sauf au-delà du plafond de créations des
 * 24 dernières heures, où le rapport est abandonné (`dropped`) sans que la
 * route change de réponse. Renvoie ce qui s'est passé, pour les tests et les
 * journaux.
 */
export async function recordClientError(
  input: ClientErrorInput,
  device: ClientErrorDevice,
  now: Date = new Date()
): Promise<'counted' | 'created' | 'dropped'> {
  const since = new Date(now.getTime() - CLIENT_ERROR_DEDUP_WINDOW_MS)
  const repeated = await prisma.clientError.updateMany({
    where: {
      name: input.name,
      message: input.message,
      path: input.path,
      buildSha: input.buildSha,
      createdAt: { gte: since },
    },
    data: { count: { increment: 1 } },
  })
  if (repeated.count > 0) return 'counted'

  // Lignes CRÉÉES sur 24 h (pas la somme des `count`) : c'est le nombre de
  // lignes qui coûte, en disque comme en regroupement. Index sur createdAt.
  const created24h = await prisma.clientError.count({
    where: { createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
  })
  if (created24h >= CLIENT_ERROR_DAILY_CREATE_CAP) return 'dropped'

  await prisma.clientError.create({
    data: {
      createdAt: now,
      name: input.name,
      message: input.message,
      digest: input.digest,
      path: input.path,
      buildSha: input.buildSha,
      device,
      locale: input.locale,
    },
  })
  return 'created'
}

/** Date avant laquelle un plantage est purgé. Pure, testée. */
export function clientErrorPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - CLIENT_ERROR_RETENTION_DAYS * DAY_MS)
}

/**
 * Purge des plantages de plus de 30 jours ; renvoie le nombre de lignes
 * supprimées. Appelée par le planificateur (tâche « tables ») : sans écriture
 * quand il n'y a rien à faire, et indexée sur createdAt.
 */
export async function purgeOldClientErrors(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.clientError.deleteMany({
    where: { createdAt: { lt: clientErrorPurgeCutoff(now) } },
  })
  return count
}

/** Un groupe tel que la Supervision l'affiche. */
export type ClientErrorGroup = {
  name: string
  message: string
  path: string
  buildSha: string | null
  device: string
  /** Occurrences cumulées (somme des `count`). */
  count: number
  /**
   * Début de la DERNIÈRE série : une répétition dans la fenêtre de 10 min
   * incrémente `count` sans toucher la date, la valeur est donc précise à la
   * fenêtre près — ce qui suffit pour « ça plante encore ? ».
   */
  lastSeenAt: string
}

export type ClientErrorsSummary = {
  /** Occurrences des dernières 24 h, toutes erreurs confondues. */
  total24h: number
  groups: ClientErrorGroup[]
}

/**
 * Ce que la Supervision affiche : les 20 groupes (erreur, page, sha,
 * appareil) les plus récents, chacun avec ses occurrences cumulées, et le
 * total des 24 dernières heures. Le regroupement est borné à la fenêtre de
 * conservation (30 j, index createdAt) : la purge ne passe qu'une fois par
 * jour, et une table qu'un script aurait gonflée juste avant ne doit pas être
 * parcourue en entier à chaque ouverture de l'onglet.
 */
export async function summarizeClientErrors(now: Date = new Date()): Promise<ClientErrorsSummary> {
  const recentSince = new Date(now.getTime() - CLIENT_ERROR_RECENT_WINDOW_MS)
  const [recent, grouped] = await Promise.all([
    prisma.clientError.aggregate({
      _sum: { count: true },
      where: { createdAt: { gte: recentSince } },
    }),
    prisma.clientError.groupBy({
      by: ['name', 'message', 'path', 'buildSha', 'device'],
      where: { createdAt: { gte: clientErrorPurgeCutoff(now) } },
      _sum: { count: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: CLIENT_ERROR_GROUPS_SHOWN,
    }),
  ])

  return {
    total24h: recent._sum.count ?? 0,
    groups: grouped.map((group) => ({
      name: group.name,
      message: group.message,
      path: group.path,
      buildSha: group.buildSha,
      device: group.device,
      count: group._sum.count ?? 0,
      lastSeenAt: (group._max.createdAt ?? now).toISOString(),
    })),
  }
}
