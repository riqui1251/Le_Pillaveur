import { NextResponse } from 'next/server'
import { withApiRoute } from '@/lib/api-route'
import { getCurrentUser } from '@/lib/auth-server'
import { getStaffHiddenGameIds } from '@/lib/game-catalog-server'
import {
  DRINK_RANKING_TOP,
  anonymizeDrinkBoards,
  buildDrinkRankingsOverview,
  type DrinkRankingsResponse,
} from '@/lib/online/drink-rankings'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Onglet « Gorgées » de /classement : un top par jeu en ligne des comptes qui
 * ont le plus bu, plus la ligne du demandeur. Ouvert aux visiteurs, mais sans
 * pseudo ni id (anonymizeDrinkBoards). `private, no-store` dans les deux cas :
 * la réponse dépend du cookie, aucun cache partagé ne doit la garder.
 */
export const GET = withApiRoute('online/rankings/drinks GET', async () => {
  const [user, hiddenIds] = await Promise.all([getCurrentUser(), getStaffHiddenGameIds()])
  const boards = await buildDrinkRankingsOverview(prisma, user?.id ?? null, hiddenIds)
  const body: DrinkRankingsResponse = user
    ? { boards, signedIn: true, top: DRINK_RANKING_TOP }
    : { boards: anonymizeDrinkBoards(boards), signedIn: false, top: DRINK_RANKING_TOP }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
})
