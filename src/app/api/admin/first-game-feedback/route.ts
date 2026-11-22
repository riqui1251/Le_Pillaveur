import { NextResponse } from 'next/server'
import { canViewUserFeedback } from '@/lib/roles'
import { summarizeFirstGameFeedback } from '@/lib/first-game-feedback-server'
import { adminErrorResponse, requireRole } from '../_guard'

/**
 * Résumé des avis de 1re partie pour la Supervision : total, moyenne, 30
 * derniers jours, répartition des notes, par jeu. Les avis un par un, avec
 * leur auteur, ont leur route paginée (./reviews). Panneau AUTONOME, hors de
 * la boucle de 15 s de la vue d'ensemble (F40) — il se charge à l'ouverture.
 *
 * Garde : celle de la LECTURE des retours (canViewUserFeedback, modérateur+) :
 * ce sont les mêmes données, agrégées.
 */
export async function GET() {
  try {
    await requireRole(canViewUserFeedback)
    return NextResponse.json({ summary: await summarizeFirstGameFeedback() })
  } catch (error) {
    return adminErrorResponse(error, 'first-game-feedback GET')
  }
}
