"use client"

import { useEffect, useSyncExternalStore, type CSSProperties } from 'react'
import { usePathname } from '@/i18n/navigation'
import { soireeGameColors } from '@/lib/soiree/catalog'
import { cn } from '@/lib/utils'
import { DEFAULT_BACKDROP, claimBackdrop, readBackdrop, subscribeBackdrop } from './site-backdrop-store'

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

// ─── Le fond de tout le site ─────────────────────────────────────────────────

/** Teinte (un jeu) et intensité du fond, le temps que la page est affichée. */
export function useSiteBackdrop(accent?: string, strong = false) {
  useEffect(() => claimBackdrop({ accent, strong }), [accent, strong])
}

/**
 * La télé garde son feutre uni : écran lu à distance, navigateurs de
 * téléviseur souvent poussifs, et chaque écran y couvre déjà toute la surface.
 */
function keepsPlainFelt(pathname: string): boolean {
  return pathname === '/tv' || pathname.startsWith('/tv/')
}

/**
 * Posé UNE fois dans la coquille du site (layout de langue), avant la barre et
 * le contenu : fixe et sans z-index, il passe sous le contenu (lui-même
 * positionné, sans z-index non plus) et sous tous les calques fixes — barre,
 * arènes plein écran, dock, fenêtres. Il reste monté d'une page à l'autre :
 * seule la teinte change.
 */
export function SiteBackdrop() {
  const pathname = usePathname()
  const options = useSyncExternalStore(subscribeBackdrop, readBackdrop, () => DEFAULT_BACKDROP)
  if (keepsPlainFelt(pathname)) return null
  return <SoireeBackdrop accent={options.accent} strong={options.strong} />
}
