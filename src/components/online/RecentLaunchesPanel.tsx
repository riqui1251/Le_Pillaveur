"use client"

import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'
import type { RecentLaunchItem } from '@/lib/online/game-sessions'
import { useLocalizedGames } from '@/lib/games-i18n'
import { GameIconById } from '@/components/hub/GameIconById'

/**
 * « Dernières parties lancées » : les 10 derniers lancements du site, la plus
 * fraîche en tête.
 *
 * Complément du panneau des parties EN COURS, pas un doublon : celui-ci
 * répond à « est-ce que ça vit ici ? » aux heures creuses, quand plus aucune
 * table ne tourne. Purement informatif — rien ne se rejoint depuis cette
 * rangée, et aucun pseudo n'y figure.
 *
 * Une table qui n'était pas publique annonce son JEU comme les autres, mais
 * arrive sans effectif (`playerCount` à null, cf. summarizeRecentLaunches) et
 * sans le moindre pseudo : elle porte un cadenas, rien de plus.
 */
export function RecentLaunchesPanel({ items }: { items: RecentLaunchItem[] }) {
  const t = useTranslations('onlineLobby.recentLaunches')
  const games = useLocalizedGames()

  if (items.length === 0) return null

  /** Minutes → l'unité qui se lit d'un coup d'œil (min, h, puis jours). */
  const ago = (minutes: number) => {
    if (minutes < 1) return t('justNow')
    if (minutes < 60) return t('agoMinutes', { minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('agoHours', { hours })
    return t('agoDays', { days: Math.floor(hours / 24) })
  }

  return (
    <section className="min-w-0">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        {t('title')}
      </p>
      {/* Rangée défilante : `tabIndex` la rend atteignable au clavier — sans
          lui, une zone qui déborde sans élément focusable à l'intérieur
          devient inaccessible autrement qu'à la souris. */}
      <ul
        tabIndex={0}
        aria-label={t('title')}
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const game = games.find((g) => g.id === item.gameId)
          // Jeu retiré du catalogue : son identifiant vaut mieux que rien.
          const label = game?.title ?? item.gameId
          return (
            <li
              key={item.id}
              className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] py-1.5 pl-2 pr-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/50">
                <GameIconById id={item.gameId} className="h-3.5 w-3.5 text-amber-200/80" />
              </span>
              <span className="min-w-0">
                <span className="flex max-w-[9rem] items-center gap-1 truncate text-[11px] font-semibold text-white/85">
                  <span className="truncate">{label}</span>
                  {/* Cadenas : table privée ou sur invitation. Le jeu est dit,
                      l'effectif et les pseudos ne le sont pas. */}
                  {item.isPrivate && (
                    <Lock className="h-2.5 w-2.5 shrink-0 text-white/40" aria-label={t('privateTable')} />
                  )}
                </span>
                <span className="block text-[10px] text-white/40">
                  {ago(item.startedAgoMinutes)}
                  {item.playerCount !== null && ` · ${t('players', { count: item.playerCount })}`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
