import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'

export type GamePlayStat = {
  gameId: string
  title: string
  emoji: string
  partiesPlayed: number
}

function aggregateCloudGameStats(localPlayersJson: string | null): Map<string, number> {
  const map = new Map<string, number>()
  if (!localPlayersJson) return map

  try {
    const players = JSON.parse(localPlayersJson) as Array<{
      stats?: { gameStats?: Record<string, { gamesPlayed?: number }> }
    }>
    if (!Array.isArray(players)) return map

    for (const player of players) {
      const gameStats = player.stats?.gameStats
      if (!gameStats) continue
      for (const [gameId, data] of Object.entries(gameStats)) {
        const played = typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0
        if (played > 0) {
          map.set(gameId, (map.get(gameId) ?? 0) + played)
        }
      }
    }
  } catch {
    /* ignore invalid json */
  }

  return map
}

/**
 * Parties EN LIGNE terminées, par jeu — dédupliquées par salle (une ligne
 * OnlineMatchResult par COMPTE humain, donc une salle à 4 joueurs produit
 * 4 lignes pour UNE seule partie).
 */
async function aggregateOnlineGameStats(): Promise<Map<string, number>> {
  const rows = await prisma.onlineMatchResult.findMany({
    select: { gameId: true, roomId: true },
  })
  const roomsByGame = new Map<string, Set<string>>()
  for (const r of rows) {
    let rooms = roomsByGame.get(r.gameId)
    if (!rooms) {
      rooms = new Set()
      roomsByGame.set(r.gameId, rooms)
    }
    rooms.add(r.roomId)
  }
  return new Map([...roomsByGame.entries()].map(([gameId, rooms]) => [gameId, rooms.size]))
}

export async function getGlobalGamePlayStats(): Promise<{
  games: GamePlayStat[]
  totalParties: number
}> {
  const [dbCounts, users, onlineMap] = await Promise.all([
    prisma.stats.groupBy({
      by: ['gameType'],
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { localPlayersJson: { not: null } },
      select: { localPlayersJson: true },
    }),
    aggregateOnlineGameStats(),
  ])

  const dbMap = new Map(dbCounts.map((row) => [row.gameType, row._count._all]))
  const cloudMap = new Map<string, number>()

  for (const user of users) {
    const userMap = aggregateCloudGameStats(user.localPlayersJson)
    for (const [gameId, count] of userMap.entries()) {
      cloudMap.set(gameId, (cloudMap.get(gameId) ?? 0) + count)
    }
  }

  const allIds = new Set([
    ...GAMES.map((g) => g.id),
    ...dbMap.keys(),
    ...cloudMap.keys(),
    ...onlineMap.keys(),
  ])

  const games = [...allIds]
    .map((gameId) => {
      const meta = GAMES.find((g) => g.id === gameId)
      const partiesPlayed =
        (cloudMap.get(gameId) ?? 0) + (dbMap.get(gameId) ?? 0) + (onlineMap.get(gameId) ?? 0)
      return {
        gameId,
        title: meta?.title ?? gameId,
        emoji: meta?.emoji ?? '🎮',
        partiesPlayed,
      }
    })
    .filter((g) => g.partiesPlayed > 0)
    .sort((a, b) => b.partiesPlayed - a.partiesPlayed)

  const totalParties = games.reduce((sum, g) => sum + g.partiesPlayed, 0)

  return { games, totalParties }
}
