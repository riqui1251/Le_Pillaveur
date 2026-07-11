"use client"

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

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

/* Panneau de table : même grammaire que les KPI de supervision —
   cadre or discret sur feutre, gros chiffre en Playfair. */
function KpiPanel({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-gold/15 bg-felt-deep/60 p-4">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/70">
        {label}
      </p>
      <p className="mt-1 truncate font-display text-3xl font-bold text-cream">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-white/55">{detail}</p>}
    </div>
  )
}

export default function GlobalStats() {
  const t = useTranslations('stats')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors')
  const locale = useLocale()
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale]
  )
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-gold/15 bg-felt-deep/60 py-6">
        <p className="text-center text-white/60">{t('noStats')}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <KpiPanel label={t('gamesPlayed')} value={stats.totalGames} />
      <KpiPanel label={t('uniquePlayers')} value={stats.totalPlayers} />
      <KpiPanel
        label={t('bestPlayer')}
        value={stats.bestPlayer?.name || '-'}
        detail={stats.bestPlayer ? t('winsCount', { count: stats.bestPlayer.wins }) : t('noPlayer')}
      />

      <section className="col-span-full rounded-2xl border border-gold/15 bg-felt-deep/60 p-4 sm:p-5">
        <h2 className="font-display text-lg font-bold text-cream">{t('recentGames')}</h2>
        <p className="text-xs text-white/55">{t('recentGamesDesc')}</p>
        <div className="mt-3 space-y-2">
          {stats.recentGames.map((game, index) => (
            <div
              key={index}
              className="flex items-center justify-between border-b border-gold/10 py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="font-medium text-white/90">{game.gameType}</p>
                <p className="truncate text-sm text-white/55">
                  {t('winner', { name: game.winner })}
                </p>
              </div>
              <time className="shrink-0 pl-3 text-sm text-white/55">
                {dateFormatter.format(new Date(game.playedAt))}
              </time>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
