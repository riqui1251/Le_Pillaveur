'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  computeNightSummary,
  getMetricsForGame,
  type MetricDescriptor,
  type NightAwardId,
} from '@/lib/gameMetrics'
import { GAMES } from '@/lib/games'
import type { Player } from '@/lib/players'

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

// ─── Palmarès de la table ────────────────────────────────────────────────────
// Même principe que ci-dessus : le calcul reste pur dans `gameMetrics`, la
// traduction vit ici, et l'UI n'a plus qu'à poser des lignes prêtes à lire.

const AWARD_ICONS: Record<NightAwardId, string> = {
  champion: '🏆',
  thirsty: '🍺',
  unlucky: '🐢',
  sober: '😇',
}

export type NightAwardLine = {
  id: NightAwardId
  icon: string
  title: string
  detail: string
}

export type LocalizedNightSummary = {
  /** « 12 parties · 48 gorgées » : le décor, en une ligne. */
  headline: string
  /** Jeu fétiche de la table, null si son id n'est plus au catalogue. */
  topGame: string | null
  lines: NightAwardLine[]
}

export function useNightSummary(players: Player[]): LocalizedNightSummary | null {
  const t = useTranslations('hub.nightAwards')
  const tCatalog = useTranslations('games.catalog')

  return useMemo(() => {
    const summary = computeNightSummary(players)
    if (!summary) return null

    const meta = summary.topGameId ? GAMES.find((g) => g.id === summary.topGameId) : undefined

    return {
      headline: t('headline', { games: summary.gamesPlayed, drinks: summary.totalDrinks }),
      // Un jeu retiré du catalogue laisse des stats derrière lui : on préfère
      // taire la ligne plutôt qu'afficher un identifiant technique.
      topGame: meta
        ? t('topGame', { game: `${meta.emoji} ${tCatalog(`${meta.id}.title`)}` })
        : null,
      lines: summary.awards.map((award) => ({
        id: award.id,
        icon: AWARD_ICONS[award.id],
        title: t(`${award.id}.title`),
        // Les ex æquo sont rares et au plus deux : un simple « & » se lit dans
        // les quatre langues, sans dépendre d'un formateur de liste.
        detail: t(`${award.id}.detail`, {
          names: award.names.join(' & '),
          count: award.value,
        }),
      })),
    }
  }, [players, t, tCatalog])
}
