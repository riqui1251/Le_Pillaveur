import { createHash } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { FIRST_GAME_FEEDBACK_TYPE } from '@/lib/feedback'
import { isFirstGameFeedbackEligible, isLocalFirstGameFeedbackEligible } from '@/lib/first-game-feedback'
import type { FirstGameReview, FirstGameReviewAuthor } from '@/lib/supervision/first-game-ratings'

/**
 * AVIS DE 1RE PARTIE, côté serveur : l'éligibilité d'un compte (lue en base
 * puis tranchée par la fonction pure), l'identifiant de son avis, le résumé
 * de la Supervision et la liste des avis un par un.
 */

const ACCOUNT_FEEDBACK_ID_PREFIX = 'first-game-'

/**
 * Identifiant de l'avis de 1re partie d'un COMPTE : déterministe, pour que
 * « une seule note par compte » tienne en BASE (clé primaire) et non plus
 * par une lecture préalable — deux envois concurrents (deux onglets, deux
 * appareils, un keepalive rejoué) passaient tous deux un findFirst et
 * écrivaient deux lignes ; ici le second bute sur la clé (P2002).
 *
 * Empreinte SHA-256 de l'id du compte plutôt que l'id lui-même : la ligne
 * survit à la suppression du compte (userId mis à null, cf.
 * deleteUserAccount) et ne doit pas garder l'identifiant en clair. Tronquée à
 * 128 bits, sans caractère à échapper dans /api/admin/feedback/[id].
 */
export function firstGameFeedbackId(userId: string): string {
  return `${ACCOUNT_FEEDBACK_ID_PREFIX}${createHash('sha256').update(userId).digest('hex').slice(0, 32)}`
}

/** Fenêtre « récente » du résumé. */
export const FIRST_GAME_SUMMARY_RECENT_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * La carte d'avis est-elle due à ce compte (GET /api/online/progression) ?
 * UNE lecture par clé primaire, le succès `first_game` joint (unique par
 * compte : au plus une ligne). Compte introuvable → false.
 */
export async function isFirstGameFeedbackDue(userId: string, now: Date = new Date()): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstFeedbackAskedAt: true,
      createdAt: true,
      achievements: { where: { type: 'first_game' }, select: { unlockedAt: true }, take: 1 },
    },
  })
  if (!row) return false
  return isFirstGameFeedbackEligible({
    askedAt: row.firstFeedbackAskedAt,
    firstGameUnlockedAt: row.achievements[0]?.unlockedAt ?? null,
    createdAt: row.createdAt,
    now,
  })
}

/**
 * Partie LOCALE avec un compte connecté (GET /api/feedback/first-game) : le
 * compte est-il un nouveau, jamais sollicité ? Une lecture par clé primaire.
 * Compte introuvable → false (cf. isLocalFirstGameFeedbackEligible).
 */
export async function isLocalFirstGameFeedbackDue(userId: string, now: Date = new Date()): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstFeedbackAskedAt: true, createdAt: true },
  })
  if (!row) return false
  return isLocalFirstGameFeedbackEligible({ askedAt: row.firstFeedbackAskedAt, createdAt: row.createdAt, now })
}

export type FirstGameRatingKey = '1' | '2' | '3' | '4' | '5'

export type FirstGameFeedbackSummary = {
  /** Avis notés, depuis toujours. */
  total: number
  /** Moyenne depuis toujours, arrondie au centième ; null sans avis. */
  average: number | null
  last30d: { count: number; average: number | null }
  /** Nombre d'avis par note, depuis toujours ; chaque note présente (0 compris). */
  distribution: Record<FirstGameRatingKey, number>
  /** Par jeu, depuis toujours : le plus noté d'abord. */
  byGame: Array<{ gameId: string; count: number; average: number }>
}

/** Moyenne lisible : deux décimales suffisent à une note sur 5. */
function roundAverage(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

/**
 * Résumé des avis de 1re partie pour la Supervision. Route À PART
 * (/api/admin/first-game-feedback), chargée à l'ouverture du panneau — pas
 * dans la boucle de 15 s de la vue d'ensemble (F40).
 *
 * Total, répartition et par-jeu portent sur TOUT l'historique : le site est
 * jeune, les volumes sont petits, une fenêtre de 30 j les rendrait muets. La
 * tendance se lit dans `last30d`. Tout passe par aggregate / groupBy : aucune
 * ligne n'est rapatriée (les avis un par un ont leur route paginée,
 * listRatedReviews), et l'index (type, createdAt) sert chaque requête.
 * `rating: { not: null }` : une ligne 'first-game' a toujours sa note (la
 * route l'exige), le filtre ne coûte rien et garde les comptes justes si une
 * ligne bricolée arrivait sans.
 */
export async function summarizeFirstGameFeedback(
  now: Date = new Date()
): Promise<FirstGameFeedbackSummary> {
  const rated = { type: FIRST_GAME_FEEDBACK_TYPE, rating: { not: null } }
  return summarizeRatedFeedback({ overall: rated, byGame: rated }, now)
}

/**
 * Le même résumé pour tout retour noté 1..5 (avis de 1re partie, votes du
 * Mode Soirée) : `overall` nourrit total, 30 jours et répartition ; `byGame`
 * la moyenne par jeu (lignes sans jeu écartées).
 * Les deux coïncident pour l'avis de 1re partie ; la soirée les sépare — la
 * note de la soirée entière d'un côté, celle de chaque jeu à l'entracte de
 * l'autre.
 */
export async function summarizeRatedFeedback(
  where: { overall: Prisma.UserFeedbackWhereInput; byGame: Prisma.UserFeedbackWhereInput },
  now: Date = new Date()
): Promise<FirstGameFeedbackSummary> {
  const rated = where.overall
  const recentSince = new Date(now.getTime() - FIRST_GAME_SUMMARY_RECENT_DAYS * DAY_MS)

  const [all, recent, byRating, byGame] = await Promise.all([
    prisma.userFeedback.aggregate({
      where: rated,
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.userFeedback.aggregate({
      where: { ...rated, createdAt: { gte: recentSince } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.userFeedback.groupBy({
      by: ['rating'],
      where: rated,
      _count: { _all: true },
    }),
    prisma.userFeedback.groupBy({
      by: ['gameId'],
      where: { ...where.byGame, gameId: { not: null } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
  ])

  const distribution: Record<FirstGameRatingKey, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  for (const group of byRating) {
    const key = String(group.rating)
    if (key in distribution) distribution[key as FirstGameRatingKey] = group._count._all
  }

  return {
    total: all._count._all,
    average: roundAverage(all._avg.rating),
    last30d: { count: recent._count._all, average: roundAverage(recent._avg.rating) },
    distribution,
    byGame: byGame
      .filter((group): group is typeof group & { gameId: string } => group.gameId !== null)
      .map((group) => ({
        gameId: group.gameId,
        count: group._count._all,
        average: roundAverage(group._avg.rating) ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.gameId.localeCompare(b.gameId)),
  }
}

/**
 * Un avis sans compte rattaché : soit un compte supprimé depuis (userId remis
 * à null, la clé first-game-<empreinte> reste — cf. firstGameFeedbackId),
 * soit personne — partie locale ou soirée jouée sans connexion (cuid par
 * défaut, clé soiree-<soirée>-…). Une clé de soirée ne porte pas le compte :
 * celui qui a voté connecté puis supprimé son compte ressort « sans compte ».
 */
function reviewAuthor(row: {
  id: string
  userId: string | null
  user: { displayName: string; isGuest: boolean } | null
}): FirstGameReviewAuthor {
  if (row.userId && row.user) {
    return { kind: 'account', userId: row.userId, name: row.user.displayName, isGuest: row.user.isGuest }
  }
  return row.id.startsWith(ACCOUNT_FEEDBACK_ID_PREFIX) ? { kind: 'deleted' } : { kind: 'anonymous' }
}

/**
 * Retours notés UN PAR UN, pour savoir qui a noté quoi : le plus récent
 * d'abord, une page à la fois. Commun aux avis de 1re partie et aux votes du
 * Mode Soirée, comme summarizeRatedFeedback. L'auteur est le PSEUDO du compte,
 * jamais son e-mail — ce que la boîte des retours montre déjà au même grade.
 * L'id départage deux avis de la même milliseconde : sans lui, l'ordre d'une
 * page à l'autre n'est pas garanti (doublon ou trou).
 */
export async function listRatedReviews({
  where,
  skip,
  take,
}: {
  where: Prisma.UserFeedbackWhereInput
  skip: number
  take: number
}): Promise<{ reviews: FirstGameReview[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.userFeedback.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        rating: true,
        gameId: true,
        playMode: true,
        message: true,
        createdAt: true,
        userId: true,
        user: { select: { displayName: true, isGuest: true } },
      },
    }),
    prisma.userFeedback.count({ where }),
  ])

  return {
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating ?? 0,
      gameId: row.gameId,
      playMode: row.playMode,
      comment: row.message,
      createdAt: row.createdAt.toISOString(),
      author: reviewAuthor(row),
    })),
    total,
  }
}

/** Avis de 1re partie un par un, filtrés par jeu si demandé. */
export async function listFirstGameReviews({
  gameId,
  skip,
  take,
}: {
  gameId: string | null
  skip: number
  take: number
}): Promise<{ reviews: FirstGameReview[]; total: number }> {
  return listRatedReviews({
    where: {
      type: FIRST_GAME_FEEDBACK_TYPE,
      rating: { not: null },
      ...(gameId ? { gameId } : {}),
    },
    skip,
    take,
  })
}
