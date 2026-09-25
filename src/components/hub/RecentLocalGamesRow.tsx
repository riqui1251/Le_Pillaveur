"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { RotateCcw } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useLocalizedGames, type LocalizedGameMeta } from '@/lib/games-i18n'
import { GameIconById } from '@/components/hub/GameIconById'
import { readRecentLocalGames } from '@/lib/recent-local-games'

/**
 * « Vos derniers jeux » en mode LOCAL : les 3 derniers jeux ouverts sur CET
 * appareil avec une table, en lien direct. Pendant de RecentGamesRow (en
 * ligne), même allure — carte compacte icône + titre — mais sans serveur :
 * la liste vit en localStorage (src/lib/recent-local-games.ts, alimentée par
 * useRecordRecentLocalGame depuis le layout des pages de jeu), et « Rejouer »
 * n'est qu'un lien vers la page du jeu — c'est elle qui propose de reprendre
 * une partie interrompue, pour les jeux qui savent le faire (game-session).
 *
 * Montée par /jeux en mode local seulement ; ne rend RIEN tant que la liste
 * est vide (premier passage, navigation privée) — ni titre, ni place réservée.
 */
export function RecentLocalGamesRow() {
  const t = useTranslations('hub.recentLocal')
  const games = useLocalizedGames()
  const [recentIds, setRecentIds] = useState<string[]>([])

  // Lu après l'hydratation : le HTML du hub est le même pour tous (rendu au
  // build), la rangée n'apparaît qu'une fois le stockage de l'appareil lu.
  useEffect(() => {
    setRecentIds(readRecentLocalGames())
  }, [])

  const entries = recentIds
    .map((id) => games.find((g) => g.id === id))
    .filter((g): g is LocalizedGameMeta => Boolean(g))

  if (entries.length === 0) return null

  return (
    <div className="mb-4">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-white/40">
        {t('title')}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((game) => (
          // Sans préchargement, comme les cartes de la grille (GameCard) : une
          // page de jeu statique se précharge entière, pour un tap incertain.
          <Link
            key={game.id}
            href={game.path}
            prefetch={false}
            className="group flex min-h-[44px] shrink-0 touch-manipulation items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] py-2 pl-2.5 pr-3 text-left backdrop-blur-md transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10 active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-amber-200">
              <GameIconById id={game.id} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block max-w-[9rem] truncate text-xs font-semibold text-white">
                {game.title}
              </span>
              <span className="flex items-center gap-1 text-xs text-amber-300/80">
                <RotateCcw className="h-3 w-3" aria-hidden />
                {t('replay')}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
