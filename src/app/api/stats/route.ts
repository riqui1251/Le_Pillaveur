import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Nombre total de parties (une ligne Stats = une partie jouée)
    const totalGames = await prisma.stats.count()

    // Nombre total de joueurs
    const totalPlayers = await prisma.user.count()

    // Meilleur joueur = score cumulé le plus élevé.
    // On regroupe les parties par joueur et on trie par somme de score.
    const ranking = await prisma.stats.groupBy({
      by: ['userId'],
      _sum: { score: true },
      orderBy: { _sum: { score: 'desc' } },
      take: 1,
    })

    let bestPlayer: { name: string; wins: number } | null = null
    if (ranking.length > 0) {
      const topUserId = ranking[0].userId
      const [user, wins] = await Promise.all([
        prisma.user.findUnique({
          where: { id: topUserId },
          select: { name: true },
        }),
        // "Victoires" = parties au score positif pour ce joueur
        prisma.stats.count({
          where: { userId: topUserId, score: { gt: 0 } },
        }),
      ])
      bestPlayer = { name: user?.name || 'Anonyme', wins }
    }

    // Les 5 dernières parties
    const recentGames = await prisma.stats.findMany({
      take: 5,
      orderBy: {
        playedAt: 'desc'
      },
      include: {
        user: true
      }
    })

    return NextResponse.json({
      totalGames,
      totalPlayers,
      bestPlayer,
      recentGames: recentGames.map(game => ({
        gameType: game.gameType,
        winner: game.user.name || 'Anonyme',
        playedAt: game.playedAt.toISOString()
      }))
    })
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
} 