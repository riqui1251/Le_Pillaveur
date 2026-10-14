'use client'

import { memo, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { SPECIAL_PIN_COLORS } from '@/lib/plinko-pins'
import { JACKPOT_VALUE, type BallColor } from '../plinko-scoring'
import {
  ballsInCategory,
  modifierSummary,
  type LiveBall,
  type LiveBalls,
  type LivePinHit,
  type ModifierToken,
} from '../plinko-live'

export interface PinBubble {
  key: number
  x: number
  y: number
  hit: LivePinHit
  category: BallColor
}

const MOBILE_CHIPS = 2
const WIDE_CHIPS = 5
const DISPLAY_CAP = 999

function useLiveText() {
  const t = useTranslations('games.plinko')
  const pinLabel = (type: LivePinHit['type']) => t(`pinLabels.${type}`)
  const categoryLabel = (category: BallColor) => (category === 'red' ? t('game.drinks') : t('game.gives'))
  const hitLabel = (hit: LivePinHit): string => {
    let label = pinLabel(hit.type)
    if (hit.type === 'mystery') label += ` → ${hit.resolved ? pinLabel(hit.resolved) : t('game.live.nothing')}`
    else if (hit.inert) label += ` → ${t('game.live.nothing')}`
    if (hit.doubled) label += ` (${t('game.live.doubled')})`
    return label
  }
  const formatModifier = (token: ModifierToken): string => {
    switch (token.kind) {
      case 'cancelled': return t('game.live.cancelled')
      case 'jackpot': return t('game.live.jackpot', { value: token.value })
      case 'multiplier': return `×${token.factor}`
      case 'add': return `+${token.n}`
      case 'subtract': return `−${token.n}`
      case 'swapped': return `🔄 ${t('game.live.swapped')}`
    }
  }
  return { t, categoryLabel, hitLabel, formatModifier }
}

function PinDot({ type }: { type: LivePinHit['type'] }) {
  const c = SPECIAL_PIN_COLORS[type]
  return (
    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-black leading-none text-black/80', c.border, c.bg)}>
      {c.glyph}
    </span>
  )
}

function LivePinChip({ hit, label, reduceMotion, className }: { hit: LivePinHit; label: string; reduceMotion: boolean; className: string }) {
  const nothing = (hit.type === 'mystery' && !hit.resolved) || hit.inert
  return (
    <motion.span
      role="img"
      aria-label={label}
      title={label}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 24 }}
      className={cn('shrink-0 items-center gap-0.5', className)}
    >
      <PinDot type={hit.type} />
      {(hit.type === 'mystery' || hit.inert) && (
        <>
          <span aria-hidden className="text-[11px] font-bold leading-none text-cream/60">→</span>
          {nothing
            ? <span aria-hidden className="text-[11px] font-bold leading-none text-cream/60">∅</span>
            : hit.resolved && <PinDot type={hit.resolved} />}
        </>
      )}
      {/* En ligne et non en exposant : la bande de hauteur fixe rognerait un badge débordant. */}
      {hit.doubled && (
        <span aria-hidden className="rounded-full bg-gold px-0.5 text-[11px] font-black leading-none text-black">×2</span>
      )}
    </motion.span>
  )
}

function LiveSegment({ ball, first, isCumulativeMode, reduceMotion }: { ball: LiveBall; first: boolean; isCumulativeMode: boolean; reduceMotion: boolean }) {
  const { t, hitLabel, formatModifier } = useLiveText()
  const summary = modifierSummary(ball.effects, isCumulativeMode, ball.isMain, JACKPOT_VALUE).map(formatModifier)
  if (!ball.isMain && ball.landed && ball.finalSips !== null) summary.push(`= ${ball.finalSips}`)
  const start = Math.max(0, ball.hits.length - WIDE_CHIPS)
  const hiddenWide = start
  const hiddenMobile = Math.max(0, ball.hits.length - MOBILE_CHIPS)
  return (
    <span className={cn('flex shrink-0 items-center gap-1', !first && 'border-l border-gold/[0.15] pl-1.5')}>
      {!ball.isMain && <span role="img" aria-label={t('game.live.extraBall')} className="text-[11px] leading-none">🎱</span>}
      {hiddenMobile > 0 && (
        <span className={cn('text-[11px] font-bold leading-none text-cream/60 sm:hidden')}>+{hiddenMobile}</span>
      )}
      {hiddenWide > 0 && (
        <span className="hidden text-[11px] font-bold leading-none text-cream/60 sm:inline">+{hiddenWide}</span>
      )}
      {ball.hits.slice(start).map((hit, i) => (
        <LivePinChip
          key={start + i}
          hit={hit}
          label={hitLabel(hit)}
          reduceMotion={reduceMotion}
          className={start + i < hiddenMobile ? 'hidden sm:inline-flex' : 'inline-flex'}
        />
      ))}
      {summary.length > 0 && (
        <span className={cn('whitespace-nowrap font-display text-[11px] font-bold tabular-nums leading-none sm:text-xs', ball.category === 'red' ? 'text-red-300' : 'text-emerald-300')}>
          {summary.join(' · ')}
        </span>
      )}
    </span>
  )
}

/**
 * Bande de hauteur fixe (« Boit » | « Donne ») posée en haut du plateau, sous les balles (z-20).
 * Bas de bande à 30 px (mobile) / 28 px (sm) : au-dessus de la 1re rangée de pions, même plateau à 360 px
 * (mobile 6 rangées → pion spécial à 43 px ; sm 8 rangées → 30 px). Masquée au repos.
 */
export const LiveEffectsBar = memo(function LiveEffectsBar({ live, idle, isCumulativeMode, reduceMotion }: {
  live: LiveBalls
  idle: boolean
  isCumulativeMode: boolean
  reduceMotion: boolean
}) {
  const { t, categoryLabel } = useLiveText()
  return (
    <div
      role="group"
      aria-label={t('game.live.effectsLabel')}
      aria-hidden={idle || undefined}
      className={cn(
        'pointer-events-none absolute inset-x-1 top-1 z-10 grid h-[26px] grid-cols-2 rounded-lg border border-gold/[0.15] bg-felt-deep/80 backdrop-blur-sm transition-opacity duration-300 sm:h-6',
        idle && 'opacity-0',
      )}
    >
      {(['red', 'green'] as const).map((category) => {
        const segments = ballsInCategory(live, category).filter((b) => !b.isMain || b.hits.length > 0)
        return (
          <div key={category} className={cn('flex min-w-0 items-center gap-1.5 overflow-hidden px-1.5', category === 'green' && 'border-l border-gold/[0.15]')}>
            <span className={cn('flex shrink-0 items-center gap-1 font-display text-[11px] font-bold leading-none', category === 'red' ? 'text-red-300' : 'text-emerald-300')}>
              <span aria-hidden className={cn('h-2 w-2 rounded-full', category === 'red' ? 'bg-suit-red' : 'bg-emerald-700')} />
              {categoryLabel(category)}
            </span>
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden">
              {segments.length === 0
                ? <span className="truncate text-[11px] italic text-cream/60">{t('game.live.none')}</span>
                : segments.map((ball, i) => (
                  <LiveSegment key={ball.id} ball={ball} first={i === 0} isCumulativeMode={isCumulativeMode} reduceMotion={reduceMotion} />
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
})

/**
 * Contenu d'une case du bas pendant un tour : valeur finale de chaque balle principale si elle
 * tombait là (rouge en haut, vert en bas), tenu dans la hauteur de la case (h-11 / sm:h-14).
 * `redBallValue` / `greenBallValue` : entrée `slot` de previewSlotValues pour la balle principale de cet id.
 */
export const LiveSlotValues = memo(function LiveSlotValues({ live, slot, base, redBallValue, greenBallValue }: {
  live: LiveBalls
  slot: number
  base: number
  redBallValue: number
  greenBallValue: number
}) {
  const { t, categoryLabel } = useLiveText()
  const entries = [live.red, live.green]
    .sort((a, b) => (a.category === b.category ? 0 : a.category === 'red' ? -1 : 1))
    .map((ball) => {
      const faded = ball.landed && ball.slot !== slot
      const atLanding = ball.landed && !faded
      const projected = ball.id === 'red' ? redBallValue : greenBallValue
      const value = atLanding ? (ball.finalSips ?? projected) : projected
      const differs = atLanding ? value !== (ball.landedBase ?? base) : value !== base
      return { ball, faded, atLanding, value, differs }
    })
  const values = entries
    .filter((e) => !e.faded)
    .map((e) => `${categoryLabel(e.ball.category)} ${e.value}`)
    .join(', ')
  return (
    <>
      <span className="sr-only">{t('game.live.slotLabel', { n: slot + 1, values })}</span>
      {entries.map(({ ball, faded, atLanding, value, differs }) => (
        <span
          key={ball.id}
          aria-hidden
          className={cn(
            'flex h-[17px] w-full max-w-[30px] items-center justify-center rounded-[5px] border px-px font-display text-[11px] font-bold leading-none tabular-nums tracking-tight text-cream transition-opacity duration-300 sm:h-5 sm:max-w-[44px] sm:text-xs',
            ball.category === 'red' ? 'bg-suit-red' : 'bg-emerald-700',
            ball.category !== ball.id ? 'border-dashed border-cream/80' : 'border-transparent',
            faded && 'opacity-0',
            differs && 'ring-1 ring-gold',
            atLanding && (differs ? 'ring-2 ring-gold' : 'ring-2 ring-cream/80'),
          )}
        >
          {value > DISPLAY_CAP ? `${DISPLAY_CAP}+` : value}
        </span>
      ))}
    </>
  )
})

function bubblePosition(x: number, y: number): CSSProperties {
  const ty = y < 12 ? '14px' : 'calc(-100% - 14px)'
  if (x < 25) return { left: `${Math.max(2, x)}%`, top: `${y}%`, transform: `translate(-12px, ${ty})` }
  if (x > 75) return { right: `${Math.max(2, 100 - x)}%`, top: `${y}%`, transform: `translate(12px, ${ty})` }
  return { left: `${x}%`, top: `${y}%`, transform: `translate(-50%, ${ty})` }
}

/** Bulles éphémères au-dessus des pions touchés par une balle principale ; à rendre dans le plateau. */
export const PinBubbleLayer = memo(function PinBubbleLayer({ bubbles, reduceMotion }: { bubbles: PinBubble[]; reduceMotion: boolean }) {
  const { t } = useLiveText()
  return (
    <>
      {bubbles.map(({ key, x, y, hit, category }) => {
        const shown = hit.type === 'mystery' && hit.resolved ? hit.resolved : hit.type
        const nothing = (hit.type === 'mystery' && !hit.resolved) || hit.inert
        const short = nothing ? t('game.live.nothing') : t(`game.live.short.${shown}`)
        const glyph = SPECIAL_PIN_COLORS[shown].glyph
        return (
          <div key={key} aria-hidden className="pointer-events-none absolute z-40 max-w-[45%]" style={bubblePosition(x, y)}>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: y < 12 ? -6 : 6, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18 }}
              className={cn(
                'flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-1.5 py-0.5 font-display text-[11px] font-bold leading-none text-cream shadow-lg sm:text-xs',
                category === 'red' ? 'border-red-300/60 bg-suit-red' : 'border-emerald-300/60 bg-emerald-700',
              )}
            >
              <span className="shrink-0">{SPECIAL_PIN_COLORS[hit.type].glyph}</span>
              {hit.type === 'mystery' && <span className="shrink-0">→{hit.resolved ? glyph : ''}</span>}
              {short !== glyph && <span className="min-w-0 truncate">{short}</span>}
              {hit.doubled && <span className="shrink-0 text-gold">×2</span>}
            </motion.div>
          </div>
        )
      })}
    </>
  )
})
