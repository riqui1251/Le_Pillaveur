'use client'

import { useEffect, useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { GameCatalogPanel, useGameTitle } from '@/components/supervision/GameCatalogPanel'
import { GameCategoriesPanel } from '@/components/supervision/GameCategoriesPanel'
import { GameVibesPanel } from '@/components/supervision/GameVibesPanel'
import { refreshGameCatalog, useGameCatalog } from '@/hooks/useGameCatalog'
import { FEATURED_LIMIT, STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'

/**
 * Onglet « Jeux » : sur téléphone, un sélecteur de jeu pilote le catalogue (cacher, à la une,
 * barèmes, catégories) et le Mode Soirée (dedans ou dehors, ambiances), qui n'affichent que
 * la ligne du jeu choisi, l'un sous l'autre, au lieu d'une longue liste à parcourir. Dès lg,
 * le sélecteur disparaît et les tableaux restent complets. Les catégories se rangent depuis
 * la fiche du jeu ; le panneau qui les crée et les ordonne vient en dernier (ancre
 * #game-categories, ciblée par le lien « Créer une catégorie » du catalogue).
 */
export function GamesEditingTab() {
  const t = useTranslations('supervision.gameEditing')
  const tCatalog = useTranslations('supervision.gameCatalog')
  const locale = useLocale()
  const gameTitle = useGameTitle()
  const selectId = useId()
  const summaryId = useId()
  const [chosen, setChosen] = useState<string | null>(null)
  // État servi au site (relu après chaque geste de l'équipe, refreshGameCatalog) : le menu dit
  // si un jeu est VRAIMENT caché ou à la une, sans ouvrir sa fiche.
  const { hiddenIds, featured } = useGameCatalog()
  // À l'ouverture, une lecture fraîche : la copie de l'appareil et le cache HTTP (30 s) pouvaient
  // montrer l'état d'avant un changement fait ailleurs (autre équipier, autre onglet).
  useEffect(() => {
    void refreshGameCatalog()
  }, [])

  const options = STAFF_TOGGLEABLE_GAME_IDS.map((id) => {
    const rank = featured.indexOf(id) + 1
    const marks = [
      hiddenIds.includes(id) ? tCatalog('hidden') : null,
      rank > 0 ? `★ ${tCatalog('featuredPillRank', { rank })}` : null,
    ].filter(Boolean)
    const title = gameTitle(id)
    return { id, title, label: marks.length > 0 ? `${title} · ${marks.join(' · ')}` : title }
  }).sort((a, b) => a.title.localeCompare(b.title, locale))
  const focusGameId = chosen !== null && options.some((o) => o.id === chosen) ? chosen : options[0]?.id
  const hiddenCount = options.filter((o) => hiddenIds.includes(o.id)).length

  return (
    <>
      <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/20 p-3 lg:hidden">
        <label htmlFor={selectId} className="block text-xs font-medium text-cream/80">
          {t('pickerLabel')}
        </label>
        <select
          id={selectId}
          value={focusGameId ?? ''}
          onChange={(e) => setChosen(e.target.value)}
          aria-describedby={summaryId}
          className="h-11 w-full rounded-lg border border-white/20 bg-black/30 px-3 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 [&>option]:bg-felt-deep"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p id={summaryId} className="text-xs text-cream/70">
          {tCatalog('hiddenCount', { count: hiddenCount })} · {tCatalog('featuredCount', { count: featured.length, max: FEATURED_LIMIT })}
        </p>
      </div>
      <GameCatalogPanel focusGameId={focusGameId} />
      <GameVibesPanel focusGameId={focusGameId} />
      <div id="game-categories" className="scroll-mt-20">
        <GameCategoriesPanel />
      </div>
    </>
  )
}
