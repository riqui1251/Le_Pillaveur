import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRankings, isRankableGameId, isRankingPeriod, RANKING_MIN_GAMES } from '@/lib/online/rankings'
import { onlineErrorBody } from '@/lib/online-errors'

export const dynamic = 'force-dynamic'

/**
 * Classement des jeux en ligne.
 * `?gameId=<id>` filtre sur un jeu ; absent ou `all` → tous jeux confondus.
 * `?period=week` limite à la semaine en cours (lundi 00:00 Paris) ; défaut : historique complet.
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
  const rawPeriod = url.searchParams.get('period')
  const period = isRankingPeriod(rawPeriod) ? rawPeriod : 'all'

  const { rows, me, totalPlayers } = await buildRankings(prisma, {
    gameId,
    viewerId: user.id,
    period,
  })

  return NextResponse.json({ rows, me, totalPlayers, minGamesForRate: RANKING_MIN_GAMES })
}
