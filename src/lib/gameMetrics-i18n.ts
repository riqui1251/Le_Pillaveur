'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { getMetricsForGame, type MetricDescriptor } from '@/lib/gameMetrics'

const METRIC_KEY_MAP: Record<string, string> = {
  wins: 'wins',
  gamesPlayed: 'gamesPlayed',
  totalDrinks: 'totalDrinks',
  'wins@petit-buveur': 'winsPetitBuveur',
  'games@petit-buveur': 'gamesPetitBuveur',
  'wins@hi-lo': 'winsHiLo',
  'games@hi-lo': 'gamesHiLo',
  'wins@pmu': 'winsPmu',
  'games@pmu': 'gamesPmu',
  'wins@pyramide': 'winsPyramide',
  'games@pyramide': 'gamesPyramide',
  'wins@plinko': 'winsPlinko',
  'games@plinko': 'gamesPlinko',
  'wins@monsieur-3': 'winsMonsieur3',
  'games@monsieur-3': 'gamesMonsieur3',
  'wins@ballon-surprise': 'winsBallonSurprise',
  'games@ballon-surprise': 'gamesBallonSurprise',
  'wins@petits-points': 'winsPetitsPoints',
  'games@petits-points': 'gamesPetitsPoints',
}

function localizeMetricTitle(
  metric: MetricDescriptor,
  gameId: string,
  t: (key: string, values?: Record<string, string>) => string
): string {
  const key = METRIC_KEY_MAP[metric.id]
  if (key) return t(key)

  if (metric.id === `wins@${gameId}`) return t('winsForGame', { gameId })
  if (metric.id === `gamesPlayed@${gameId}`) return t('gamesForGame', { gameId })

  return metric.title
}

export function useGameMetricLabels(gameId: string): MetricDescriptor[] {
  const t = useTranslations('stats.metrics')

  return useMemo(() => {
    return getMetricsForGame(gameId).map((metric) => ({
      ...metric,
      title: localizeMetricTitle(metric, gameId, t),
    }))
  }, [gameId, t])
}
