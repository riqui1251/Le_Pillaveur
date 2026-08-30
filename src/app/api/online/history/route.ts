import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { GAMES } from '@/lib/games'
import { onlineErrorBody } from '@/lib/online-errors'

export const dynamic = 'force-dynamic'

const HISTORY_LIMIT = 5

/**
 * Derniers jeux joués en ligne (rangée « Rejouer » de /jeux).
 * Source principale : OnlineGameHistory (horodaté au lancement, bots compris).
 * Repli : OnlineMatchResult — donne un historique aux comptes existants dès le
 * déploiement, avant leur prochaine partie.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const [historyRows, matchGroups] = await Promise.all([
    prisma.onlineGameHistory.findMany({
      where: { userId: user.id },
      orderBy: { lastPlayedAt: 'desc' },
    }),
    prisma.onlineMatchResult.groupBy({
      by: ['gameId'],
      where: { userId: user.id },
      _max: { finishedAt: true },
      _count: { _all: true },
    }),
  ])

  // Fusion : max des deux dates par jeu, somme approchée des parties.
  const byGame = new Map<string, { lastPlayedAt: Date; playCount: number }>()
  for (const row of historyRows) {
    byGame.set(row.gameId, { lastPlayedAt: row.lastPlayedAt, playCount: row.playCount })
  }
  for (const group of matchGroups) {
    const finishedAt = group._max.finishedAt
    if (!finishedAt) continue
    const existing = byGame.get(group.gameId)
    if (!existing) {
      byGame.set(group.gameId, { lastPlayedAt: finishedAt, playCount: group._count._all })
    } else if (finishedAt > existing.lastPlayedAt) {
      existing.lastPlayedAt = finishedAt
    }
  }

  // Seuls les jeux jouables aujourd'hui : online, non masqués. softModeReady
  // est exposé pour que le client filtre en ambiance soft.
  const playable = new Map(
    GAMES.filter((g) => g.onlineReady && !g.hidden).map((g) => [g.id, g])
  )

  const history = [...byGame.entries()]
    .filter(([gameId]) => playable.has(gameId))
    .sort((a, b) => b[1].lastPlayedAt.getTime() - a[1].lastPlayedAt.getTime())
    .slice(0, HISTORY_LIMIT)
    .map(([gameId, entry]) => ({
      gameId,
      lastPlayedAt: entry.lastPlayedAt.toISOString(),
      playCount: entry.playCount,
      softModeReady: playable.get(gameId)?.softModeReady === true,
    }))

  return NextResponse.json({ history })
}
