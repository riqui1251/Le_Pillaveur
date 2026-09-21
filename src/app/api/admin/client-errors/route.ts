import { NextResponse } from 'next/server'
import { canAccessSupervision } from '@/lib/roles'
import { summarizeClientErrors } from '@/lib/client-errors-server'
import { adminErrorResponse, requireRole } from '../_guard'

/**
 * Plantages côté joueur pour la Supervision : les 20 groupes les plus récents
 * et le total des 24 dernières heures. Panneau AUTONOME, hors de la boucle de
 * 15 s de la vue d'ensemble (F40) — il se charge à l'ouverture de l'onglet.
 *
 * Garde : tout grade staff (modérateur+, canAccessSupervision). Ces lignes ne
 * portent aucune donnée personnelle et ne donnent aucun pouvoir ; ce sont les
 * modérateurs qui entendent les joueurs dire « ça plante », autant qu'ils
 * voient la même chose que nous.
 */
export async function GET() {
  try {
    await requireRole(canAccessSupervision)
    return NextResponse.json(await summarizeClientErrors())
  } catch (error) {
    return adminErrorResponse(error, 'client-errors GET')
  }
}
