"use client"

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
  const t = useTranslations('stats')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors')
  const format = useFormatter()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats')
        const data = await response.json()
        setStats(data)
      } catch (error) {
        console.error(tErrors('loadStats'), error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [t])

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]" aria-label={tCommon('loading')}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">{t('noStats')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('gamesPlayed')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalGames}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('uniquePlayers')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalPlayers}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('bestPlayer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.bestPlayer?.name || '-'}</div>
          <p className="text-xs text-muted-foreground">
            {stats.bestPlayer
              ? t('winsCount', { count: stats.bestPlayer.wins })
              : t('noPlayer')}
          </p>
        </CardContent>
      </Card>

      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>{t('recentGames')}</CardTitle>
          <CardDescription>{t('recentGamesDesc')}</CardDescription>
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
                    {t('winner', { name: game.winner })}
                  </p>
                </div>
                <time className="text-sm text-muted-foreground">
                  {format.dateTime(new Date(game.playedAt), { dateStyle: 'medium' })}
                </time>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
