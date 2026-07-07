import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRankingsOverview, RANKING_MIN_GAMES } from '@/lib/online/rankings'

export const dynamic = 'force-dynamic'

/** Page classement : le général + un top 5 par jeu, en un appel. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { general, perGame } = await buildRankingsOverview(prisma, user.id)
  return NextResponse.json({ general, perGame, minGamesForRate: RANKING_MIN_GAMES })
}
