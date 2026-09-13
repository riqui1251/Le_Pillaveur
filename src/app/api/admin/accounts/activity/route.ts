import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getActiveAccountsStats, type ActiveAccountsStats } from '@/lib/active-accounts-server'
import { adminErrorResponse, requireRole } from '../../_guard'

/**
 * Tableau des comptes actifs et des joueurs uniques (lot 7) : actifs sur 1,
 * 7 et 30 jours de Paris, invités, nouveaux et revenants, joueurs uniques,
 * durées des visites, série de 14 jours, retours J+1 / J+7 par cohorte, les
 * 10 comptes les plus actifs sur 7 jours et, à part, les navigateurs sans
 * compte (jamais additionnés aux comptes). Définitions : active-accounts-server.ts.
 *
 * Admin et plus (canViewSupervisionAnalytics), comme le journal des parties
 * et les visites dont il est tiré : le classement nomme des comptes. Appelée à
 * l'ouverture du panneau, JAMAIS dans la boucle de 15 s de la Supervision ;
 * résumé mis en cache 5 min côté serveur, daté par `computedAt` ; « en ligne
 * maintenant » et les noms du classement relus à chaque appel.
 */
export async function GET() {
  try {
    await requireRole(canViewSupervisionAnalytics)
    const stats: ActiveAccountsStats = await getActiveAccountsStats()
    return NextResponse.json(stats)
  } catch (error) {
    return adminErrorResponse(error, 'accounts activity GET')
  }
}
