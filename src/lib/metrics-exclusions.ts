import { prisma } from '@/lib/prisma'

/**
 * COMPTES DE TEST exclus des statistiques d'usage (comptes actifs, joueurs
 * uniques, rétention : active-accounts-server.ts ; joueurs du jeu en ligne et
 * parties lancées : supervision-overview-server.ts). Cas visé : les invités
 * créés par l'équipe en essayant TryBotsGate, qui ont le rôle 'user' et
 * passeraient sinon pour de vrais joueurs sur un site de quelques dizaines de
 * comptes.
 *
 * Stockés dans SiteSetting (clé/valeur), sans migration : un tableau JSON
 * d'IDENTIFIANTS de compte — jamais un pseudo ni un email. Le nom se résout à
 * la lecture. L'équipe (rôle ≠ 'user'), elle, est exclue d'office par son
 * rôle : elle n'a rien à faire dans cette liste.
 */
export const METRICS_EXCLUDED_USERS_KEY = 'metrics.excludedUserIds'

/** Plafond de la liste : quelques comptes en pratique, la borne garde la valeur petite. */
export const MAX_EXCLUDED_USERS = 200

/**
 * Lecture TOLÉRANTE de la valeur stockée : absente, JSON illisible ou autre
 * chose qu'un tableau → liste vide ; les entrées qui ne sont pas des chaînes
 * non vides sont ignorées, les doublons retirés. Un réglage abîmé ne doit
 * jamais faire échouer le tableau d'activité. Pure.
 */
export function parseExcludedUserIds(value: string | null | undefined): string[] {
  if (!value) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const ids = parsed.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
  return [...new Set(ids)].slice(0, MAX_EXCLUDED_USERS)
}

/** Identifiants des comptes de test exclus des statistiques. */
export async function getExcludedUserIds(): Promise<string[]> {
  const row = await prisma.siteSetting.findUnique({ where: { key: METRICS_EXCLUDED_USERS_KEY } })
  return parseExcludedUserIds(row?.value)
}

/** Essais d'écriture avant d'abandonner face à des écritures concurrentes répétées. */
const MAX_WRITE_ATTEMPTS = 5

/**
 * Écriture CONDITIONNELLE de la liste : elle n'aboutit que si la valeur
 * stockée est toujours celle qu'on a lue (`previous`, null = pas de ligne).
 * Faux = un autre admin a écrit entre-temps : relire et recommencer.
 */
async function writeIfUnchanged(previous: string | null, value: string): Promise<boolean> {
  if (previous !== null) {
    const { count } = await prisma.siteSetting.updateMany({
      where: { key: METRICS_EXCLUDED_USERS_KEY, value: previous },
      data: { value },
    })
    return count === 1
  }
  try {
    await prisma.siteSetting.create({ data: { key: METRICS_EXCLUDED_USERS_KEY, value } })
    return true
  } catch (error) {
    // Ligne créée entre-temps par un autre admin (clé primaire) : on relit.
    // Toute autre erreur remonte.
    const created = await prisma.siteSetting.findUnique({ where: { key: METRICS_EXCLUDED_USERS_KEY } })
    if (!created) throw error
    return false
  }
}

/**
 * Ajoute ou retire un compte de la liste, et renvoie la liste écrite. Au
 * passage, les identifiants de comptes supprimés depuis sont retirés : la
 * liste ne garde pas la trace d'un compte qui n'existe plus (appelée aussi par
 * la suppression d'un compte).
 *
 * Lecture puis écriture conditionnelle (compare-and-swap sur la valeur lue) :
 * deux admins qui cochent deux comptes à la même seconde gardent les deux
 * coches, et `changed` n'est vrai que pour une écriture qui a réellement
 * abouti — le journal ne peut pas affirmer une exclusion perdue.
 *
 * `changed` = l'état de CE compte a réellement bougé (sert à ne journaliser
 * qu'un vrai changement). Liste pleine : le compte n'est pas ajouté, ce que
 * l'appelant lit dans `userIds`.
 */
export async function setUserExcluded(
  userId: string,
  excluded: boolean
): Promise<{ changed: boolean; userIds: string[] }> {
  for (let attempt = 1; ; attempt += 1) {
    const row = await prisma.siteSetting.findUnique({ where: { key: METRICS_EXCLUDED_USERS_KEY } })
    const current = parseExcludedUserIds(row?.value)
    const wasExcluded = current.includes(userId)

    const wanted = excluded
      ? wasExcluded
        ? current
        : [...current, userId]
      : current.filter((id) => id !== userId)
    const existing = wanted.length
      ? await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true } })
      : []
    const existingIds = new Set(existing.map((user) => user.id))
    // Plafond appliqué APRÈS le ménage des comptes disparus, en gardant les plus anciens.
    const userIds = wanted.filter((id) => existingIds.has(id)).slice(0, MAX_EXCLUDED_USERS)
    const result = { changed: wasExcluded !== userIds.includes(userId), userIds }

    const value = JSON.stringify(userIds)
    // Rien à écrire si la valeur ne change pas (ni ligne créée pour une liste vide).
    if (value === (row?.value ?? '[]')) return result
    if (await writeIfUnchanged(row?.value ?? null, value)) return result
    if (attempt >= MAX_WRITE_ATTEMPTS) {
      throw new Error('metrics exclusions: écritures concurrentes répétées, liste non modifiée')
    }
  }
}
