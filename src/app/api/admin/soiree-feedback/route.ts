import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { canViewUserFeedback } from '@/lib/roles'
import { summarizeSoireeFeedback } from '@/lib/soiree-feedback-server'
import { FORBIDDEN, requireRole } from '../_guard'

/**
 * Résumé des votes du Mode Soirée pour la Supervision : note des soirées
 * (total, 30 jours, répartition) et moyenne par jeu à l'entracte. Les votes
 * un par un, avec leur auteur, ont leur route paginée (./reviews). Même garde
 * et même rythme que l'avis de 1re partie : lecture des retours
 * (modérateur+), chargé à l'ouverture du panneau.
 */
export const GET = withApiRoute('admin/soiree-feedback GET', async () => {
  try {
    await requireRole(canViewUserFeedback)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }
  return NextResponse.json({ summary: await summarizeSoireeFeedback() })
})
