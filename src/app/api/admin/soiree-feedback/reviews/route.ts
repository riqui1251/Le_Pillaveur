import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { canViewUserFeedback } from '@/lib/roles'
import { listSoireeReviews, type SoireeReviewSubject } from '@/lib/soiree-feedback-server'
import { REVIEWS_PAGING, isGameIdShape } from '@/lib/supervision/first-game-ratings'
import { FORBIDDEN, parsePaging, requireRole } from '../../_guard'

/**
 * Votes du Mode Soirée UN PAR UN (Supervision, « Qui a noté quoi ») : auteur,
 * note, jeu et commentaire, le plus récent d'abord, page par page. Sans
 * filtre : tous les votes ; `?gameId=` ceux d'un jeu (entracte) ;
 * `?scope=night` ceux de la soirée entière (addition). Le résumé agrégé reste
 * servi par /api/admin/soiree-feedback.
 *
 * Garde : celle de la lecture des retours (canViewUserFeedback, modérateur+),
 * qui y voient déjà le pseudo de l'auteur de chaque retour.
 */

const NIGHT_SCOPE = 'night'

export const GET = withApiRoute('admin/soiree-feedback/reviews GET', async (request: Request) => {
  try {
    await requireRole(canViewUserFeedback)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }

  const searchParams = new URL(request.url).searchParams
  const gameId = searchParams.get('gameId')?.trim() || null
  if (gameId !== null && !isGameIdShape(gameId)) return apiError('invalid_game', 400)
  const scope = searchParams.get('scope')?.trim() || null
  // Un vote porte sur un jeu OU sur la soirée : les deux filtres ensemble
  // rendraient une liste vide, lue comme « aucun vote ».
  if (scope !== null && (scope !== NIGHT_SCOPE || gameId !== null)) return apiError('invalid_action', 400)

  const subject: SoireeReviewSubject =
    gameId !== null ? { kind: 'game', gameId } : scope === NIGHT_SCOPE ? { kind: 'night' } : { kind: 'all' }
  const { page, pageSize, skip } = parsePaging(searchParams, REVIEWS_PAGING)
  const { reviews, total } = await listSoireeReviews({ subject, skip, take: pageSize })
  return NextResponse.json({ reviews, total, page, pageSize })
})
