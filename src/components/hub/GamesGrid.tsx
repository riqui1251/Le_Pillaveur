"use client"

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, Sparkles } from 'lucide-react'
import { useLocalizedGames } from '@/lib/games-i18n'
import { GameCard } from '@/components/hub/GameCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { Input } from '@/components/ui/input'

export function GamesGrid() {
  const t = useTranslations('hub.jeux')
  const tCommon = useTranslations('common')
  const games = useLocalizedGames()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = games.filter((g) => !g.hidden)
    if (!q) return visible
    return visible.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
    )
  }, [games, query])

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            aria-hidden
          />
          <Input
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 border-white/10 bg-white/[0.05] pl-10 text-white placeholder:text-white/45 focus-visible:ring-amber-400/40"
            aria-label={t('searchPlaceholder')}
          />
        </div>
        <span className="shrink-0 text-xs text-white/45">
          {tCommon('gameCount', { count: filtered.length })}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
          <Sparkles className="mb-3 h-7 w-7 text-amber-300/60" aria-hidden />
          <p className="font-medium text-white/80">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-white/50">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {filtered.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              icon={<GameIconById id={game.id} className="h-5 w-5 sm:h-6 sm:w-6" />}
            />
          ))}
        </div>
      )}
    </>
  )
}
