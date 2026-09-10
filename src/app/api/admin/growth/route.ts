import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getGrowthStats } from '@/lib/supervision-overview-server'
import { adminErrorResponse, requireRole } from '../_guard'

/**
 * Indicateurs de croissance (F45), SÉPARÉS de la vue d'ensemble : celle-ci
 * est rappelée toutes les 15 s (F40) alors que ces chiffres portent sur des
 * fenêtres de 7 à 30 jours et coûtent plusieurs parcours de la table des
 * comptes. Cette route n'est appelée qu'à l'ouverture de l'onglet, et sert
 * une valeur mise en cache quelques minutes côté serveur — sa fraîcheur
 * exacte voyage dans `computedAt`, que l'écran affiche.
 */
export async function GET() {
  try {
    await requireRole(canViewSupervisionAnalytics)
    const growth = await getGrowthStats()
    return NextResponse.json(growth)
  } catch (error) {
    return adminErrorResponse(error, 'growth GET')
  }
}
