import { SOIREE_FEEDBACK_TYPE } from '@/lib/feedback'
import {
  listRatedReviews,
  summarizeRatedFeedback,
  type FirstGameFeedbackSummary,
} from '@/lib/first-game-feedback-server'
import type { FirstGameReview } from '@/lib/supervision/first-game-ratings'

const RATED_SOIREE = { type: SOIREE_FEEDBACK_TYPE, rating: { not: null } }

/**
 * Résumé des votes du Mode Soirée pour la Supervision
 * (GET /api/admin/soiree-feedback), au format de l'avis de 1re partie pour
 * partager le panneau : la note de la SOIRÉE ENTIÈRE (vote de l'addition, sans
 * jeu) fait le total, les 30 jours et la répartition ; les votes d'ENTRACTE
 * (un jeu chacun) font la moyenne par jeu.
 */
export async function summarizeSoireeFeedback(now: Date = new Date()): Promise<FirstGameFeedbackSummary> {
  return summarizeRatedFeedback({ overall: { ...RATED_SOIREE, gameId: null }, byGame: RATED_SOIREE }, now)
}

/** Ce qu'un vote juge : un jeu (entracte) ou la soirée entière (addition). */
export type SoireeReviewSubject = { kind: 'all' } | { kind: 'night' } | { kind: 'game'; gameId: string }

/**
 * Votes du Mode Soirée UN PAR UN (GET /api/admin/soiree-feedback/reviews) :
 * tous, ceux de la soirée entière — les seuls à porter un commentaire —, ou
 * ceux d'un jeu. Un vote vaut pour TOUTE la table : son auteur est le compte
 * connecté sur l'appareil de la soirée, quand il y en avait un.
 */
export async function listSoireeReviews({
  subject,
  skip,
  take,
}: {
  subject: SoireeReviewSubject
  skip: number
  take: number
}): Promise<{ reviews: FirstGameReview[]; total: number }> {
  const where =
    subject.kind === 'night'
      ? { ...RATED_SOIREE, gameId: null }
      : subject.kind === 'game'
        ? { ...RATED_SOIREE, gameId: subject.gameId }
        : RATED_SOIREE
  return listRatedReviews({ where, skip, take })
}
