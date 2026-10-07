import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { FIRST_GAME_FEEDBACK_TYPE } from '@/lib/feedback'
import { isFirstGameFeedbackEligible, isLocalFirstGameFeedbackEligible } from '@/lib/first-game-feedback'

/**
 * AVIS DE 1RE PARTIE, côté serveur : l'éligibilité d'un compte (lue en base
 * puis tranchée par la fonction pure), l'identifiant de son avis et le résumé
 * de la Supervision.
 */

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
  return `first-game-${createHash('sha256').update(userId).digest('hex').slice(0, 32)}`
}

/** Fenêtre « récente » du résumé. */
export const FIRST_GAME_SUMMARY_RECENT_DAYS = 30

/** Commentaires affichés dans le résumé (non vides, les plus récents). */
export const FIRST_GAME_SUMMARY_COMMENTS = 10

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
  /** Les 10 derniers commentaires non vides — sans auteur (minimisation). */
  recentComments: Array<{
    id: string
    rating: number
    gameId: string | null
    playMode: string | null
    comment: string
    createdAt: string
  }>
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
 * ligne n'est rapatriée sauf les 10 commentaires, et l'index (type,
 * createdAt) sert chaque requête. `rating: { not: null }` : une ligne
 * 'first-game' a toujours sa note (la route l'exige), le filtre ne coûte rien
 * et garde les comptes justes si une ligne bricolée arrivait sans.
 */
export async function summarizeFirstGameFeedback(
  now: Date = new Date()
): Promise<FirstGameFeedbackSummary> {
  const rated = { type: FIRST_GAME_FEEDBACK_TYPE, rating: { not: null } }
  const recentSince = new Date(now.getTime() - FIRST_GAME_SUMMARY_RECENT_DAYS * DAY_MS)

  const [all, recent, byRating, byGame, comments] = await Promise.all([
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
      where: { ...rated, gameId: { not: null } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.userFeedback.findMany({
      where: { ...rated, message: { not: '' } },
      orderBy: { createdAt: 'desc' },
      take: FIRST_GAME_SUMMARY_COMMENTS,
      // Ni auteur ni e-mail : le résumé dit CE QUE pensent les nouveaux
      // joueurs, pas QUI. Le retour complet reste ouvrable dans la boîte.
      select: { id: true, rating: true, gameId: true, playMode: true, message: true, createdAt: true },
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
    recentComments: comments.map((row) => ({
      id: row.id,
      rating: row.rating ?? 0,
      gameId: row.gameId,
      playMode: row.playMode,
      comment: row.message,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}
