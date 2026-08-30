"use client"

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, Sparkles } from 'lucide-react'
import { useLocalizedGames, type LocalizedGameMeta } from '@/lib/games-i18n'
import { GameCard } from '@/components/hub/GameCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'

/**
 * Familles d'enseignes du hub « Vitrine » : ♠ rôles cachés, ♥ culture,
 * ♦ hasard & dés, ♣ créa. Tout tient sur un écran : les sections rendent
 * les chips de filtre inutiles — la recherche suffit pour la saisie directe.
 */
const FAMILIES = [
  { suit: 'spade', glyph: '♠' },
  { suit: 'heart', glyph: '♥' },
  { suit: 'diamond', glyph: '♦' },
  { suit: 'club', glyph: '♣' },
] as const

function GamesCardGrid({ games }: { games: LocalizedGameMeta[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          icon={<GameIconById id={game.id} className="h-6 w-6 sm:h-7 sm:w-7" />}
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

  // Visiteur sans session : la vitrine montre TOUT (comme la landing) —
  // Loup-Garou et les autres jeux online-only étaient introuvables ici alors
  // que ce sont les premières portes d'entrée SEO. Leur page propose ensuite
  // « Essayer avec des bots » ou la connexion.
  const visitor = !user
  const visible = useMemo(
    () =>
      games.filter(
        (g) =>
          !g.hidden &&
          (visitor ? true : isOnline ? g.onlineReady && (!isSoft || g.softModeReady) : !g.onlineOnly)
      ),
    [games, visitor, isOnline, isSoft]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visible
    return visible.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
    )
  }, [visible, query])

  // Sections par enseigne hors recherche — grille plate quand on cherche.
  const sections = useMemo(() => {
    if (query.trim()) return null
    return FAMILIES.map((f) => ({
      ...f,
      games: visible.filter((g) => g.suit === f.suit),
    })).filter((s) => s.games.length > 0)
  }, [visible, query])

  return (
    <>
      {/* Recherche collée sous la navbar (h-14 / 3.75rem) au scroll. */}
      <div className="sticky top-14 z-30 -mx-4 mb-3 border-b border-gold/10 bg-felt-deep/85 px-4 pb-2 pt-1.5 backdrop-blur-md sm:top-[3.75rem] sm:-mx-6 sm:px-6">
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
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
          <Sparkles className="mb-3 h-7 w-7 text-amber-300/60" aria-hidden />
          <p className="font-medium text-white/80">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-white/50">{t('emptyHint')}</p>
        </div>
      ) : sections ? (
        <div className="space-y-4">
          {sections.map((section) => (
            <section key={section.suit}>
              <h2 className="mb-1.5 flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">
                <span className="shrink-0"><span aria-hidden>{section.glyph}</span> {t(`families.${section.suit}`)}</span>
                <span aria-hidden className="h-px flex-1 bg-gold/15" />
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
