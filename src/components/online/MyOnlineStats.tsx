"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { useLocalizedGames } from '@/lib/games-i18n'

/** Mes stats de jeux EN LIGNE (V/D/%/parties par jeu) — page compte. */

type GameStatLine = {
  gameId: string
  wins: number
  losses: number
  games: number
  winRate: number
}

export function MyOnlineStats() {
  const t = useTranslations('ranking.online')
  const games = useLocalizedGames()
  const [stats, setStats] = useState<GameStatLine[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/online/rankings/me', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as { stats: GameStatLine[] }
        if (!cancelled) setStats(json.stats)
      } catch {
        // Silencieux : le bloc reste en état vide.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
        <Globe className="h-4 w-4 text-amber-300" />
        {t('myTitle')}
      </div>
      {!stats || stats.length === 0 ? (
        <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-4 text-center text-xs text-white/40">
          {t('myEmpty')}
        </p>
      ) : (
        <div className="space-y-1.5">
          {stats.map((s) => {
            const game = games.find((g) => g.id === s.gameId)
            return (
              <div
                key={s.gameId}
                className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
              >
                <span className="shrink-0 text-lg" aria-hidden>
                  {game?.emoji ?? '🎮'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {game?.title ?? s.gameId}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-300">
                  {s.wins} {t('winsShort')}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-red-300/80">
                  {s.losses} {t('lossesShort')}
                </span>
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-amber-300">
                  {s.winRate}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
