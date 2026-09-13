import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getGrowthStats, type GrowthStats } from '@/lib/supervision-overview-server'
import { adminErrorResponse, requireRole } from '../_guard'

/**
 * Indicateurs de croissance (F45), SÉPARÉS de la vue d'ensemble : celle-ci
 * est rappelée toutes les 15 s (F40) alors que ces chiffres portent sur des
 * fenêtres de 7 à 30 jours et coûtent plusieurs parcours de la table des
 * comptes. Cette route n'est appelée qu'à l'ouverture de l'onglet, et sert
 * une valeur mise en cache quelques minutes côté serveur — sa fraîcheur
 * exacte voyage dans `computedAt`, que l'écran affiche.
 *
 * Porte aussi le bloc `onlinePlay` (joueurs uniques et parties lancées en
 * ligne, tirés du journal des parties) : même garde admin et plus que le
 * journal lui-même (admin/game-sessions), même cache. Des effectifs
 * seulement, jamais un nom de compte.
 */
export async function GET() {
  try {
    await requireRole(canViewSupervisionAnalytics)
    const growth: GrowthStats = await getGrowthStats()
    return NextResponse.json(growth)
  } catch (error) {
    return adminErrorResponse(error, 'growth GET')
  }
}
