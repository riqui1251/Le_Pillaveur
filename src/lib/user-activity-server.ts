import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'
import { subjectKeyFor } from '@/lib/ip-history-server'

export const PRESENCE_PING_SECONDS = 60

export type UserGamePlayStat = {
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
    /* ignore */
  }

  return map
}

export async function getUserGamePlayStats(userId: string): Promise<UserGamePlayStat[]> {
  const [dbCounts, user] = await Promise.all([
    prisma.stats.groupBy({
      by: ['gameType'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { localPlayersJson: true },
    }),
  ])

  const dbMap = new Map(dbCounts.map((row) => [row.gameType, row._count._all]))
  const cloudMap = aggregateCloudGameStats(user?.localPlayersJson ?? null)

  const allIds = new Set([...dbMap.keys(), ...cloudMap.keys()])

  return [...allIds]
    .map((gameId) => {
      const meta = GAMES.find((g) => g.id === gameId)
      const partiesPlayed = (cloudMap.get(gameId) ?? 0) + (dbMap.get(gameId) ?? 0)
      return {
        gameId,
        title: meta?.title ?? gameId,
        emoji: meta?.emoji ?? '🎮',
        partiesPlayed,
      }
    })
    .filter((g) => g.partiesPlayed > 0)
    .sort((a, b) => b.partiesPlayed - a.partiesPlayed)
}

/**
 * Effacement RGPD d'un compte. Les tables sans clé étrangère vers User
 * (IpSeenLog, indexée par `subjectKey`) et les champs conservés par une
 * relation SetNull (UserFeedback.contactEmail, alimenté automatiquement avec
 * l'email du compte) survivraient au `user.delete` : ils sont traités ici,
 * dans la même transaction et AVANT la suppression du compte.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.stats.deleteMany({ where: { userId } }),
    prisma.achievement.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.accountBanEvent.deleteMany({
      where: { OR: [{ userId }, { actorId: userId }] },
    }),
    // $executeRaw : IpSeenLog est manipulé en SQL brut partout (ip-history-server).
    // Seules les lignes `user:<id>` sont rattachables au compte ; celles d'un
    // visiteur non connecté (`visitor:<vid>`) partent avec la purge à 6 mois.
    prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "subjectKey" = ${subjectKeyFor(userId, '')}`,
    prisma.userFeedback.updateMany({
      where: { userId },
      data: { contactEmail: null },
    }),
    prisma.sitePresence.updateMany({
      where: { userId },
      data: { userId: null },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ])
}
