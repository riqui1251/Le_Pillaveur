"use client"

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, Sparkles } from 'lucide-react'
import { useLocalizedGames, type LocalizedGameMeta } from '@/lib/games-i18n'
import { GameCard } from '@/components/hub/GameCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

/**
 * Familles d'enseignes du hub (Direction B « L'Éventail ») :
 * ♠ rôles cachés, ♥ culture, ♦ hasard & dés, ♣ créa.
 * L'ordre du tableau est l'ordre d'affichage des sections.
 */
const FAMILIES = [
  { suit: 'spade', glyph: '♠' },
  { suit: 'heart', glyph: '♥' },
  { suit: 'diamond', glyph: '♦' },
  { suit: 'club', glyph: '♣' },
] as const

type FamilySuit = (typeof FAMILIES)[number]['suit']
type FamilyFilter = 'all' | FamilySuit

function GamesCardGrid({ games }: { games: LocalizedGameMeta[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          icon={<GameIconById id={game.id} className="h-5 w-5 sm:h-6 sm:w-6" />}
        />
      ))}
    </div>
  )
}

export function GamesGrid() {
  const t = useTranslations('hub.jeux')
  const tCommon = useTranslations('common')
  const games = useLocalizedGames()
  const { user } = useAuth()
  const isOnline = user?.playMode === 'online'
  const isSoft = isOnline && user?.ambianceMode === 'soft'
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState<FamilyFilter>('all')

  const visible = useMemo(
    () =>
      games.filter(
        (g) => !g.hidden && (isOnline ? g.onlineReady && (!isSoft || g.softModeReady) : !g.onlineOnly)
      ),
    [games, isOnline, isSoft]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = visible
    if (family !== 'all') list = list.filter((g) => g.suit === family)
    if (!q) return list
    return list.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
    )
  }, [visible, query, family])

  // Sections par enseigne uniquement en vue « Tous » sans recherche —
  // dès qu'on filtre, une grille plate répond plus vite.
  const sections = useMemo(() => {
    if (query.trim() || family !== 'all') return null
    return FAMILIES.map((f) => ({
      ...f,
      games: visible.filter((g) => g.suit === f.suit),
    })).filter((s) => s.games.length > 0)
  }, [visible, query, family])

  return (
    <>
      {/* Recherche + familles : collées sous la navbar (h-14 / 3.75rem) au
          scroll, avec fond assorti pour couvrir les cartes qui défilent. */}
      <div className="sticky top-14 z-30 -mx-4 mb-4 space-y-2 border-b border-gold/10 bg-felt-deep/85 px-4 pb-2.5 pt-2 backdrop-blur-md sm:top-[3.75rem] sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
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
        <div
          role="group"
          aria-label={t('families.label')}
          className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(['all', ...FAMILIES.map((f) => f.suit)] as FamilyFilter[]).map((f) => {
            const glyph = FAMILIES.find((fam) => fam.suit === f)?.glyph
            const active = family === f
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setFamily(f)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  active
                    ? 'border-gold bg-gold/15 text-amber-200'
                    : 'border-gold/25 text-cream/70 hover:border-gold/50 hover:text-cream'
                )}
              >
                {glyph && <span aria-hidden>{glyph} </span>}
                {t(`families.${f}`)}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
          <Sparkles className="mb-3 h-7 w-7 text-amber-300/60" aria-hidden />
          <p className="font-medium text-white/80">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-white/50">{t('emptyHint')}</p>
        </div>
      ) : sections ? (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.suit}>
              <h2 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">
                <span aria-hidden>{section.glyph}</span> {t(`families.${section.suit}`)}
              </h2>
              <GamesCardGrid games={section.games} />
            </section>
          ))}
        </div>
      ) : (
        <GamesCardGrid games={filtered} />
      )}
    </>
  )
}
