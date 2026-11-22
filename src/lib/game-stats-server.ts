import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'
import { distinctMatches, type MatchEnd } from '@/lib/online/match-history'

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
 * Parties EN LIGNE classées, par jeu, à partir des lignes de résultat (une par
 * COMPTE humain : une table de 4 en produit 4 pour UNE seule partie). Une
 * partie = une salle ET une fin (distinctMatches), revanches comprises.
 * Fonction pure.
 */
export function countOnlineGames(rows: MatchEnd[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const match of distinctMatches(rows)) {
    counts.set(match.gameId, (counts.get(match.gameId) ?? 0) + 1)
  }
  return counts
}

/**
 * Un groupe par (jeu, salle, instant de fin) plutôt qu'une ligne par joueur :
 * les lignes d'une partie naissent ensemble, la base les réunit avant de les
 * servir.
 */
async function aggregateOnlineGameStats(): Promise<Map<string, number>> {
  const rows = await prisma.onlineMatchResult.groupBy({ by: ['gameId', 'roomId', 'finishedAt'] })
  return countOnlineGames(rows)
}

type GlobalGamePlayStats = { games: GamePlayStat[]; totalParties: number }

/**
 * La Supervision rappelle ces statistiques toutes les 15 s, or le calcul
 * parcourt TOUS les comptes (pour lire leurs joueurs locaux) et tout
 * l'historique des parties en ligne : deux balayages complets, pour des
 * chiffres qui ne bougent pas à la minute. Cache mémoire d'une minute — le
 * même motif que le compteur de présence.
 */
const STATS_CACHE_MS = 60 * 1000
let statsCache: { at: number; value: GlobalGamePlayStats } | null = null

export async function getGlobalGamePlayStats(): Promise<GlobalGamePlayStats> {
  const now = Date.now()
  if (statsCache && now - statsCache.at < STATS_CACHE_MS) return statsCache.value

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

  const value = { games, totalParties }
  statsCache = { at: now, value }
  return value
}
