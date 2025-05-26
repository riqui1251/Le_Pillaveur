import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Récupérer le nombre total de parties
    const totalGames = await prisma.stats.count()

    // Récupérer le nombre total de joueurs uniques
    const totalPlayers = await prisma.user.count()

    // Récupérer le meilleur joueur (celui avec le plus de victoires)
    const bestPlayer = await prisma.user.findFirst({
      where: {
        stats: {
          some: {
            score: {
              gt: 0
            }
          }
        }
      },
      select: {
        name: true,
        stats: {
          where: {
            score: {
              gt: 0
            }
          }
        }
      },
      orderBy: {
        stats: {
          _count: 'desc'
        }
      }
    })

    // Récupérer les 5 dernières parties
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
      bestPlayer: bestPlayer ? {
        name: bestPlayer.name,
        wins: bestPlayer.stats.length
      } : null,
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