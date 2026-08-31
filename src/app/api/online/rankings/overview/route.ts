import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRankingsOverview, isRankingPeriod, RANKING_MIN_GAMES } from '@/lib/online/rankings'
import { onlineErrorBody } from '@/lib/online-errors'

export const dynamic = 'force-dynamic'

/**
 * Page classement : le général + un top 5 par jeu, en un appel.
 * `?period=week` limite à la semaine en cours (lundi 00:00 Paris).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const rawPeriod = new URL(request.url).searchParams.get('period')
  const period = isRankingPeriod(rawPeriod) ? rawPeriod : 'all'
  const { general, perGame } = await buildRankingsOverview(prisma, user.id, period)
  return NextResponse.json({ general, perGame, minGamesForRate: RANKING_MIN_GAMES })
}
