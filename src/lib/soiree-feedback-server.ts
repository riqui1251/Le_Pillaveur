import { SOIREE_FEEDBACK_TYPE } from '@/lib/feedback'
import { summarizeRatedFeedback, type FirstGameFeedbackSummary } from '@/lib/first-game-feedback-server'

/**
 * Résumé des votes du Mode Soirée pour la Supervision
 * (GET /api/admin/soiree-feedback), au format de l'avis de 1re partie pour
 * partager le panneau : la note de la SOIRÉE ENTIÈRE (vote de l'addition, sans
 * jeu) fait le total, les 30 jours, la répartition et les commentaires ; les
 * votes d'ENTRACTE (un jeu chacun) font la moyenne par jeu.
 */
export async function summarizeSoireeFeedback(now: Date = new Date()): Promise<FirstGameFeedbackSummary> {
  const rated = { type: SOIREE_FEEDBACK_TYPE, rating: { not: null } }
  return summarizeRatedFeedback({ overall: { ...rated, gameId: null }, byGame: rated }, now)
}
