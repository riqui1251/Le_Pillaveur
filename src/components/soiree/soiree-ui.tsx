"use client"

import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { getGameById } from '@/lib/games'
import { useLocalizedGame } from '@/lib/games-i18n'
import { suitGlyph, suitIsRed } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'
import { usePlayers } from '@/hooks/usePlayers'
import { soireeGameColors, type SoireeHeat } from '@/lib/soiree/catalog'
import type { Soiree, SoireeMetric } from '@/lib/soiree/state'

/** Enseignes qui montent du bas de l'écran comme des bulles : colonne, taille, durée du trajet, départ décalé. */
const RISING_SUITS = [
  { glyph: '♠', left: '6%', size: '1.5rem', duration: '21s', delay: '-4s', sway: '18px', red: false },
  { glyph: '♥', left: '19%', size: '1.15rem', duration: '26s', delay: '-15s', sway: '-22px', red: true },
  { glyph: '♦', left: '33%', size: '1.8rem', duration: '31s', delay: '-9s', sway: '26px', red: true },
  { glyph: '♣', left: '48%', size: '1.25rem', duration: '24s', delay: '-19s', sway: '-16px', red: false },
  { glyph: '♥', left: '63%', size: '1.6rem', duration: '28s', delay: '-2s', sway: '20px', red: true },
  { glyph: '♠', left: '77%', size: '1.1rem', duration: '22s', delay: '-12s', sway: '-24px', red: false },
  { glyph: '♦', left: '90%', size: '1.4rem', duration: '33s', delay: '-24s', sway: '14px', red: true },
] as const

/** Paillettes d'or qui s'allument tour à tour. */
const SPARKLES = [
  { left: '14%', top: '16%', delay: '0s' },
  { left: '82%', top: '11%', delay: '-1.3s' },
  { left: '44%', top: '23%', delay: '-3s' },
  { left: '68%', top: '36%', delay: '-2.6s' },
  { left: '9%', top: '47%', delay: '-0.7s' },
  { left: '91%', top: '62%', delay: '-3.4s' },
  { left: '27%', top: '74%', delay: '-1.9s' },
  { left: '57%', top: '88%', delay: '-4.1s' },
] as const

/** Variables CSS lues par les animations de globals.css (--dx, --dy, --sway). */
function cssVars(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties
}

/**
 * Le fond animé, fixé à l'écran : des lumières de bar qui dérivent (l'or de
 * la maison, le rouge des cartes, la couleur du jeu), une lampe au-dessus de
 * la table, des enseignes qui montent comme des bulles et des paillettes.
 * Écrans Soirée (SoireeShell) et pages des jeux locaux (games/layout).
 * Décor seulement : figé si l'appareil réduit les animations (enseignes et
 * paillettes s'effacent alors).
 *
 * `strong` : posé derrière le panneau des jeux, un feutre à 70 % qui n'en
 * laisse passer que 30 % — le décor y est forcé d'autant.
 */
export function SoireeBackdrop({ accent, strong = false }: { accent?: string; strong?: boolean }) {
  const accentColor = accent ? soireeGameColors(accent).from : '#2F5FB3'
  const k = strong ? 2.6 : 1
  return (
    <div aria-hidden className="soiree-backdrop-in pointer-events-none fixed inset-0 select-none overflow-hidden">
      <div
        className="soiree-breathe absolute left-1/2 top-[-13rem] h-[26rem] w-[46rem] -translate-x-1/2 rounded-[50%]"
        style={{ background: `radial-gradient(closest-side, rgba(241, 210, 122, ${0.17 * k}), transparent)` }}
      />
      <div
        className="soiree-drift absolute -left-24 top-[3%] h-80 w-80 rounded-full bg-gold blur-[90px]"
        style={cssVars({ opacity: String(0.14 * k), '--dx': '80px', '--dy': '60px', animationDuration: '23s' })}
      />
      <div
        className="soiree-drift absolute -right-20 bottom-[5%] h-72 w-72 rounded-full bg-suit-red blur-[90px]"
        style={cssVars({ opacity: String(0.12 * k), '--dx': '-70px', '--dy': '-80px', animationDuration: '29s', animationDelay: '-8s' })}
      />
      <div
        className="soiree-drift absolute left-[28%] top-[40%] h-64 w-64 rounded-full blur-[100px] transition-[background-color] duration-1000"
        style={cssVars({ backgroundColor: accentColor, opacity: String(0.13 * k), '--dx': '-60px', '--dy': '70px', animationDuration: '34s', animationDelay: '-14s' })}
      />
      {RISING_SUITS.map((s, i) => (
        <span
          key={i}
          className={cn(
            'soiree-rise absolute top-full font-display leading-none',
            s.red ? (strong ? 'text-suit-red/70' : 'text-suit-red/30') : strong ? 'text-amber-200/50' : 'text-amber-200/20'
          )}
          style={cssVars({ left: s.left, fontSize: s.size, animationDuration: s.duration, animationDelay: s.delay, '--sway': s.sway })}
        >
          {s.glyph}
        </span>
      ))}
      {SPARKLES.map((p, i) => (
        <span
          key={i}
          className={cn(
            'soiree-twinkle absolute rounded-full bg-amber-100 opacity-0 shadow-[0_0_8px_2px_rgba(241,210,122,0.55)]',
            strong ? 'h-1.5 w-1.5' : 'h-1 w-1'
          )}
          style={{ left: p.left, top: p.top, animationDelay: p.delay }}
        />
      ))}
    </div>
  )
}

/**
 * Colonne largeur téléphone posée sur le feutre du site ; la barre d'action vit en bas (SoireeCta).
 * `accent` : le jeu dont la couleur teinte le fond (la manche en cours ou à venir).
 */
export function SoireeShell({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <main className="relative min-h-screen overflow-x-clip text-cream">
      <SoireeBackdrop accent={accent} />
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
