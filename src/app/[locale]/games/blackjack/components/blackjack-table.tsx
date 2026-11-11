"use client"

import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import type { BjHand, BjHandResult, BjViewCard } from '@/lib/blackjack/engine'
import { cn } from '@/lib/utils'
import { BjCardsRow, BjOutcomeBadge, BjStakeChip, BjTotalChip, type BjCardSize } from './blackjack-ui'

/**
 * La table de casino du Black Jack : demi-lune de feutre vert bordée de bois,
 * mentions imprimées (« paie 3 pour 2 », règle de la banque en arc), croupier
 * en haut et places des joueurs le long de l'arc, chacune avec sa case de
 * mise. Partagée par le jeu local, la table en ligne et l'écran TV.
 *
 * Géométrie dans un repère fixe (viewBox) : le texte imprimé (SVG) et les
 * places (HTML, en %) se calent sur les mêmes coordonnées et grandissent avec
 * la table.
 */

export type BjTableSeat = {
  id: string
  name: string
  avatar?: ReactNode
  stake: number | null
  hands: readonly BjHand[]
  results: readonly BjHandResult[]
  /** Index de la main au tour, si c'est à cette place. */
  activeHand: number | null
  isMe?: boolean
  away?: boolean
}

/** `phone` : téléphone en portrait ; `tv` : grand écran — et téléphone en paysage, réduit à l'échelle (BjLandscapeShell). */
export type BjTableVariant = 'phone' | 'tv'
type Variant = BjTableVariant

const GEOMETRY: Record<
  Variant,
  {
    w: number
    h: number
    /** Ellipse des places (centre en haut, au croupier). */
    seatCy: number
    seatRx: number
    seatRy: number
    /** Ellipse du texte imprimé, plus serrée : les cartes ne mordent jamais dessus. */
    textCy: number
    textRx: number
    textRy: number
    title: { y: number; size: number }
    pays: { y: number; size: number }
    arcSize: number
  }
> = {
  phone: {
    w: 360,
    h: 420,
    seatCy: 0,
    seatRx: 140,
    seatRy: 318,
    textCy: 20,
    textRx: 112,
    textRy: 176,
    title: { y: 124, size: 22 },
    pays: { y: 140, size: 11 },
    arcSize: 10,
  },
  tv: {
    w: 1000,
    h: 560,
    seatCy: 30,
    seatRx: 400,
    seatRy: 410,
    textCy: 40,
    textRx: 280,
    textRy: 225,
    title: { y: 192, size: 44 },
    pays: { y: 220, size: 20 },
    arcSize: 20,
  },
}

/** Angles des places (0° = droite, 90° = bas) : première place à droite, comme au casino. */
function seatAngles(n: number, compact: boolean): number[] {
  if (n <= 1) return [90]
  const from = n <= 3 ? 60 : compact ? 17 : n <= 5 ? 30 : 18
  const to = 180 - from
  return Array.from({ length: n }, (_, i) => from + (i * (to - from)) / (n - 1))
}

function resultLabel(results: readonly BjHandResult[]): { text: string; tone: 'good' | 'bad' | 'even' } | null {
  if (results.length === 0) return null
  const give = results.reduce((s, r) => s + r.give, 0)
  const drink = results.reduce((s, r) => s + r.drink, 0)
  if (give > drink) return { text: `+${give - drink}`, tone: 'good' }
  if (drink > give) return { text: `−${drink - give}`, tone: 'bad' }
  return { text: '=', tone: 'even' }
}

function Seat({
  seat,
  showResults,
  cardSize,
  variant,
  compact,
}: {
  seat: BjTableSeat
  showResults: boolean
  cardSize: BjCardSize
  variant: Variant
  /** Table pleine au téléphone : plaque de nom réduite, collée à la case. */
  compact: boolean
}) {
  const t = useTranslations('games.blackjack')
  const reduced = useReducedMotion()
  const active = seat.activeHand !== null
  const result = showResults ? resultLabel(seat.results) : null
  const blackjack = showResults && seat.results.some((r) => r.outcome === 'blackjack')
  const tv = variant === 'tv'
  return (
    <div className={cn('flex flex-col items-center', tv ? 'gap-2' : 'gap-1', seat.away && 'opacity-50')}>
      {/* Mains : vers le croupier, au-dessus de la case de mise. */}
      <div className={cn('flex min-h-0 flex-wrap items-end justify-center', tv ? 'gap-3' : 'gap-1')}>
        {seat.hands.map((hand, i) => (
          <div
            key={i}
            className={cn(
              'relative rounded-lg',
              active && seat.activeHand === i && 'ring-2 ring-gold ring-offset-2 ring-offset-[#136140]'
            )}
          >
            <BjCardsRow cards={hand.cards} size={seat.hands.length > 1 ? (tv ? 'sm' : 'xs') : cardSize} />
            <BjTotalChip
              cards={hand.cards}
              final={hand.stood}
              className={cn('absolute -right-2 -top-2 shadow', tv ? 'text-lg' : 'min-w-[1.75rem] px-1 text-[11px]')}
            />
          </div>
        ))}
      </div>

      {/* Case de mise imprimée sur le feutre, jeton dedans. */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-md border-2',
          tv ? 'h-14 w-12' : 'h-9 w-8',
          active ? 'border-gold' : 'border-cream/50'
        )}
      >
        {seat.stake !== null && (
          <motion.span
            key={`${seat.stake}-${seat.hands.some((h) => h.doubled)}`}
            initial={reduced ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25 }}
            // En flex : en ligne, la hauteur de ligne poussait le jeton hors de sa case.
            className="flex"
          >
            <BjStakeChip count={seat.stake} doubled={seat.hands.length === 1 && seat.hands[0].doubled} size={tv ? 'md' : 'sm'} />
          </motion.span>
        )}
        {result && (
          <span
            className={cn(
              'absolute whitespace-nowrap rounded-full px-1.5 font-display font-bold tabular-nums',
              // Grand format : à droite de la case (la plaque du nom est juste dessous).
              tv ? 'left-full top-1/2 ml-2 -translate-y-1/2 text-xl' : 'left-1/2 top-full mt-0.5 -translate-x-1/2 text-xs',
              blackjack
                ? 'bg-gold text-[#24201A]'
                : result.tone === 'good'
                  ? 'bg-emerald-600 text-cream'
                  : result.tone === 'bad'
                    ? 'bg-suit-red text-cream'
                    : 'bg-black/50 text-cream'
            )}
          >
            {blackjack ? `BJ ${result.text}` : result.text}
          </span>
        )}
      </div>

      {/* Plaque du joueur, au bord de la table. */}
      <div
        className={cn(
          'flex max-w-full items-center gap-1 rounded-full border px-1.5',
          tv ? 'mt-2 py-1 text-xl' : compact ? 'mt-0.5 py-0 text-[11px]' : 'mt-4 py-0.5 text-[11px]',
          active
            ? 'border-gold bg-gold font-bold text-[#24201A]'
            : seat.isMe
              ? 'border-gold/60 bg-black/50 font-semibold text-gold'
              : 'border-cream/20 bg-black/40 text-cream'
        )}
      >
        {seat.avatar && !compact && <span aria-hidden className="shrink-0 leading-none">{seat.avatar}</span>}
        <span className={cn('truncate', tv ? 'max-w-[9rem]' : compact ? 'max-w-[3.75rem]' : 'max-w-[4.5rem]')}>{seat.isMe ? t('table.me') : seat.name}</span>
      </div>
    </div>
  )
}

export function BjTable({
  dealer,
  dealerBlackjack = false,
  seats,
  showResults,
  variant = 'phone',
  className,
}: {
  dealer: readonly BjViewCard[]
  dealerBlackjack?: boolean
  seats: readonly BjTableSeat[]
  showResults: boolean
  variant?: Variant
  className?: string
}) {
  const t = useTranslations('games.blackjack')
  const g = GEOMETRY[variant]
  const arcId = useId().replace(/:/g, '')
  const cx = g.w / 2
  const tv = variant === 'tv'
  const crowded = seats.length > 4
  // Table pleine au téléphone : arc plus large et plus haut, places étalées
  // jusqu'aux bords, sinon les places du bas se chevauchent.
  const compact = crowded && variant === 'phone'
  const angles = seatAngles(seats.length, compact)
  const seatRx = compact ? 154 : g.seatRx
  const seatCy = compact ? 16 : g.seatCy
  const seatRy = compact ? 334 : g.seatRy
  const cardSize: BjCardSize = tv ? 'md' : crowded ? 'xs' : 'sm'
  const dealerVisible = dealer.length >= 2 && dealer.every(Boolean)

  // Arcs imprimés : le texte suit la moitié basse d'une ellipse, de gauche à droite.
  const arc = (rx: number, ry: number) => `M ${cx - rx} ${g.textCy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${g.textCy}`

  return (
    <div
      role="group"
      aria-label={t('tableLabel')}
      // `isolate` : le z-index des places reste dans la table (les modales passent devant).
      className={cn('relative isolate w-full select-none', className)}
      style={{ aspectRatio: `${g.w} / ${g.h}` }}
    >
      {/* Rebord bois, filet or, feutre. */}
      <div
        aria-hidden
        className={cn('absolute inset-0 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]', tv ? 'border-[14px]' : 'border-[7px]')}
        style={{
          borderColor: '#4A2E17',
          borderRadius: '22px 22px 50% 50% / 22px 22px 44% 44%',
          background: 'radial-gradient(ellipse at 50% 18%, #1F8352 0%, #136140 48%, #0B4630 100%)',
          boxShadow: 'inset 0 0 0 2px rgb(var(--gold-rgb) / 0.55), inset 0 0 60px rgba(0,0,0,0.45)',
        }}
      />

      <svg
        aria-hidden
        viewBox={`0 0 ${g.w} ${g.h}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          <path id={`${arcId}-text`} d={arc(g.textRx, g.textRy)} />
        </defs>
        <path d={arc(g.textRx + g.arcSize * 1.4, g.textRy + g.arcSize * 1.4)} fill="none" stroke="rgb(var(--gold-rgb) / 0.55)" strokeWidth={tv ? 2 : 1} />
        <path d={arc(g.textRx - g.arcSize * 0.9, g.textRy - g.arcSize * 0.9)} fill="none" stroke="rgb(var(--gold-rgb) / 0.55)" strokeWidth={tv ? 2 : 1} />
        <text
          x={cx}
          y={g.title.y}
          textAnchor="middle"
          className="font-display"
          fontSize={g.title.size}
          fontWeight={700}
          letterSpacing={g.title.size * 0.06}
          fill="rgb(var(--cream-rgb) / 0.92)"
        >
          {t('title').toUpperCase()}
        </text>
        <line
          x1={cx - g.title.size * 1.2}
          x2={cx + g.title.size * 1.2}
          y1={g.title.y + g.pays.size * 0.55}
          y2={g.title.y + g.pays.size * 0.55}
          stroke="rgb(var(--suit-red-rgb))"
          strokeWidth={tv ? 3 : 1.5}
        />
        <text x={cx} y={g.pays.y + g.pays.size * 0.4} textAnchor="middle" fontSize={g.pays.size} fill="rgb(var(--gold-rgb))" fontWeight={600}>
          {t('table.pays')}
        </text>
        <text fontSize={g.arcSize} fill="rgb(var(--cream-rgb) / 0.85)" fontWeight={600} letterSpacing={g.arcSize * 0.02}>
          <textPath href={`#${arcId}-text`} startOffset="50%" textAnchor="middle">
            {t('table.rule')}
          </textPath>
        </text>
      </svg>

      {/* Croupier, en haut de la table. */}
      <div className={cn('absolute left-1/2 flex -translate-x-1/2 flex-col items-center', tv ? 'top-[4%] gap-2' : 'top-[3%] gap-1')}>
        <div className="flex items-center gap-1.5">
          <span className={cn('font-semibold uppercase tracking-[0.2em] text-gold', tv ? 'text-xl' : 'text-[11px]')}>{t('dealer')}</span>
          <BjTotalChip cards={dealer} final={dealerVisible} className={tv ? 'text-xl' : 'px-1.5 text-xs'} />
        </div>
        <div className={tv ? 'min-h-[5rem]' : 'min-h-[3.5rem]'}>
          {dealer.length > 0 ? (
            <BjCardsRow cards={dealer} size={tv ? 'md' : 'sm'} />
          ) : (
            <div className={cn('rounded-lg border-2 border-dashed border-cream/30', tv ? 'h-20 w-14' : 'h-14 w-10')} />
          )}
        </div>
        {dealerBlackjack && (
          <span className={cn('rounded-full bg-suit-red px-2 font-display font-bold text-cream', tv ? 'text-xl' : 'text-[11px]')}>
            {t('dealerBlackjack')}
          </span>
        )}
      </div>

      {/* Places le long de l'arc. */}
      {seats.map((seat, i) => {
        const a = (angles[i] * Math.PI) / 180
        const x = cx + seatRx * Math.cos(a)
        const y = seatCy + seatRy * Math.sin(a)
        return (
          <div
            key={seat.id}
            className="absolute -translate-x-1/2 -translate-y-[62%]"
            // Les places du haut passent devant : leur plaque descend vers la place voisine.
            style={{ left: `${(x / g.w) * 100}%`, top: `${(y / g.h) * 100}%`, zIndex: Math.round(g.h - y) }}
          >
            <Seat seat={seat} showResults={showResults} cardSize={cardSize} variant={variant} compact={compact} />
          </div>
        )
      })}
    </div>
  )
}

/** Sous la table, en fin de manche : le verdict détaillé de chaque main. */
export function BjResultsList({
  rows,
}: {
  rows: readonly { id: string; name: ReactNode; avatar?: ReactNode; results: readonly BjHandResult[] }[]
}) {
  const t = useTranslations('games.blackjack')
  const shown = rows.filter((r) => r.results.length > 0)
  if (shown.length === 0) return null
  return (
    <section aria-label={t('phase.results')} className="space-y-1.5 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      {shown.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {row.avatar && <span aria-hidden className="shrink-0 text-base leading-none">{row.avatar}</span>}
          <span className="min-w-0 max-w-[40%] truncate text-sm font-semibold text-cream">{row.name}</span>
          <span className="flex flex-wrap gap-1">
            {row.results.map((r, i) => (
              <BjOutcomeBadge key={i} result={r} />
            ))}
          </span>
        </div>
      ))}
    </section>
  )
}
