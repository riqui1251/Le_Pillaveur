"use client"

import { useTranslations } from 'next-intl'
import { getGameById } from '@/lib/games'
import { useLocalizedGame } from '@/lib/games-i18n'
import { suitGlyph, suitIsRed } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'
import { usePlayers } from '@/hooks/usePlayers'
import { soireeGameColors, type SoireeHeat } from '@/lib/soiree/catalog'
import type { Soiree, SoireeMetric } from '@/lib/soiree/state'
import { useSiteBackdrop } from './site-backdrop'

/**
 * Colonne largeur téléphone posée sur le feutre du site ; la barre d'action vit en bas (SoireeCta).
 * `accent` : le jeu dont la couleur teinte le fond du site (la manche en cours ou à venir).
 */
export function SoireeShell({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  useSiteBackdrop(accent)
  return (
    <main className="relative min-h-screen overflow-x-clip text-cream">
      <div className={cn('relative mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pb-44 pt-6', className)}>{children}</div>
    </main>
  )
}

export function StepHeader({ eyebrow, title, lead, center = false }: { eyebrow?: string; title: string; lead?: string; center?: boolean }) {
  return (
    <header className={cn('space-y-1.5', center && 'text-center')}>
      {eyebrow && <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>}
      <h1 className="text-balance font-display text-3xl font-bold leading-tight text-cream sm:text-4xl">{title}</h1>
      {lead && <p className="text-pretty text-base text-cream/70">{lead}</p>}
    </header>
  )
}

/** Sur téléphone, c'est body qui défile (globals.css, .is-mobile-device) : window.scrollTo n'y suffit pas. */
export function scrollPageTop() {
  window.scrollTo(0, 0)
  document.body.scrollTo(0, 0)
}

/** Barre d'action fixée sous le pouce, au-dessus de la zone de sécurité du téléphone. */
export function SoireeCta({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-felt-deep via-felt-deep/95 to-transparent px-4 pb-[calc(0.9rem+env(safe-area-inset-bottom,0px))] pt-8">
      <div className="pointer-events-auto mx-auto flex w-full max-w-lg flex-col gap-2">{children}</div>
    </div>
  )
}

export function HeatPips({ heat, className }: { heat: SoireeHeat; className?: string }) {
  const t = useTranslations('soiree.programme')
  return (
    <span role="img" aria-label={t('heat', { value: heat })} className={cn('inline-flex gap-0.5 text-[11px] text-suit-red', className)}>
      {[1, 2, 3].map((level) => (
        <span key={level} aria-hidden className={level <= heat ? 'opacity-100' : 'opacity-25'}>
          ♦
        </span>
      ))}
    </span>
  )
}

/** Coin de carte du jeu (rang + enseigne de src/lib/games.ts). */
export function GameCorner({ gameId, className }: { gameId: string; className?: string }) {
  const game = getGameById(gameId)
  if (!game?.suit) return null
  return (
    <span
      aria-hidden
      className={cn(
        'flex w-6 shrink-0 flex-col items-center font-display text-sm font-bold leading-none',
        suitIsRed(game.suit) ? 'text-suit-red' : 'text-[#24201A]',
        className
      )}
    >
      {game.rank}
      <span className="mt-0.5 text-xs">{suitGlyph(game.suit)}</span>
    </span>
  )
}

/** Or, argent, bronze : le podium de l'ardoise. */
export const MEDALS = [
  'linear-gradient(135deg, #F1D27A, #D9A441)',
  'linear-gradient(135deg, #EDEDED, #A9B0B8)',
  'linear-gradient(135deg, #E3A86B, #B0703A)',
] as const

/** Les couleurs que la page Joueurs attribue (src/lib/players.ts) : les seules classes sûres d'exister. */
const PLAYER_COLOR_CLASSES = new Set([
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500',
  'bg-indigo-500', 'bg-orange-500', 'bg-teal-500', 'bg-cyan-500', 'bg-rose-500', 'bg-emerald-500',
])

/** La barre d'ardoise d'un joueur, à sa couleur ; l'or de la maison s'il n'en a pas. */
export function playerBarClass(player: { name: string; preferences?: { color?: string } }): string {
  const color = player.preferences?.color
  return color && PLAYER_COLOR_CLASSES.has(color) ? color : 'bg-gradient-to-r from-amber-600 to-amber-400'
}

/** Le dégradé du jeu (ses deux couleurs), pour un fond, une bande ou une barre. */
export function gameGradient(gameId: string, angle = 135): string {
  const { from, to } = soireeGameColors(gameId)
  return `linear-gradient(${angle}deg, ${from}, ${to})`
}

/** Pastille du jeu : son enseigne sur ses couleurs, comme une icône d'application. */
export function GameBadge({ gameId, size = 'md', className }: { gameId: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const game = getGameById(gameId)
  const dims = size === 'lg' ? 'h-16 w-16 rounded-2xl text-3xl' : size === 'sm' ? 'h-8 w-8 rounded-lg text-base' : 'h-11 w-11 rounded-xl text-xl'
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center font-display font-bold text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)] ring-1 ring-white/20', dims, className)}
      style={{ background: gameGradient(gameId) }}
    >
      <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">{game?.suit ? suitGlyph(game.suit) : '★'}</span>
    </span>
  )
}

export function GameTitle({ gameId }: { gameId: string }) {
  const game = useLocalizedGame(gameId)
  return <>{game?.title ?? gameId}</>
}

/**
 * Le joueur local derrière un id de la soirée (son icône, ses couleurs), ou
 * son prénom au lancement s'il a été supprimé depuis.
 */
export function useSoireePlayer(soiree: Pick<Soiree, 'playerNames'>) {
  const { players } = usePlayers()
  return (id: string) => players.find((p) => p.id === id) ?? { name: soiree.playerNames[id] ?? '?' }
}

/** « 3 gorgées » avec alcool, « 3 victoires » sans. */
export function useSoireeUnits() {
  const t = useTranslations('soiree.units')
  return (metric: SoireeMetric, count: number) => t(metric, { count })
}
