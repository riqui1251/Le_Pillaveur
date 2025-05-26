/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'

interface StatsData {
  totalGames: number
  totalPlayers: number
  bestPlayer: {
    name: string
    wins: number
  } | null
  recentGames: {
    gameType: string
    winner: string
    playedAt: string
  }[]
}

export default function GlobalStats() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats')
        const data = await response.json()
        setStats(data)
      } catch (error) {
        console.error('Erreur lors du chargement des statistiques:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">
            Aucune statistique disponible
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Parties jouées
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalGames}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Joueurs uniques
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalPlayers}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Meilleur joueur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.bestPlayer?.name || '-'}
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.bestPlayer ? `${stats.bestPlayer.wins} victoires` : 'Aucun joueur'}
          </p>
        </CardContent>
      </Card>

      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Parties récentes</CardTitle>
          <CardDescription>
            Les dernières parties jouées
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.recentGames.map((game, index) => (
              <div
                key={index}
                className="flex items-center justify-between border-b py-2 last:border-0"
              >
                <div>
                  <p className="font-medium">{game.gameType}</p>
                  <p className="text-sm text-muted-foreground">
                    Gagnant : {game.winner}
                  </p>
                </div>
                <time className="text-sm text-muted-foreground">
                  {new Date(game.playedAt).toLocaleDateString()}
                </time>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 