import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRankings, isRankableGameId, RANKING_MIN_GAMES } from '@/lib/online/rankings'
import { onlineErrorBody } from '@/lib/online-errors'

export const dynamic = 'force-dynamic'

/**
 * Classement des jeux en ligne.
 * `?gameId=<id>` filtre sur un jeu ; absent ou `all` → tous jeux confondus.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const url = new URL(request.url)
  const raw = url.searchParams.get('gameId')
  const gameId = raw && raw !== 'all' ? raw : null
  if (gameId && !isRankableGameId(gameId)) {
    return NextResponse.json(onlineErrorBody('invalid_game'), { status: 400 })
  }

  const { rows, me, totalPlayers } = await buildRankings(prisma, {
    gameId,
    viewerId: user.id,
  })

  return NextResponse.json({ rows, me, totalPlayers, minGamesForRate: RANKING_MIN_GAMES })
}
