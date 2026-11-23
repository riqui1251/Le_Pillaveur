import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { listFirstGameReviews } from '@/lib/first-game-feedback-server'
import { canViewUserFeedback } from '@/lib/roles'
import { REVIEWS_PAGING, isGameIdShape } from '@/lib/supervision/first-game-ratings'
import { FORBIDDEN, parsePaging, requireRole } from '../../_guard'

/**
 * Avis de 1re partie UN PAR UN (Supervision, « Qui a noté quoi ») : auteur,
 * note, jeu, mode et commentaire, le plus récent d'abord, page par page,
 * filtrés par jeu avec `?gameId=`. Le résumé agrégé reste servi par
 * /api/admin/first-game-feedback.
 *
 * Garde : celle de la lecture des retours (canViewUserFeedback, modérateur+),
 * qui y voient déjà le pseudo de l'auteur de chaque retour.
 */
export const GET = withApiRoute('admin/first-game-feedback/reviews GET', async (request: Request) => {
  try {
    await requireRole(canViewUserFeedback)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }

  const searchParams = new URL(request.url).searchParams
  const gameId = searchParams.get('gameId')?.trim() || null
  if (gameId !== null && !isGameIdShape(gameId)) return apiError('invalid_game', 400)

  const { page, pageSize, skip } = parsePaging(searchParams, REVIEWS_PAGING)
  const { reviews, total } = await listFirstGameReviews({ gameId, skip, take: pageSize })
  return NextResponse.json({ reviews, total, page, pageSize })
})
