"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  PILE_POIL_REVEAL_MS,
  digitsVisible,
  ringProgress,
  type PilePoilLevel,
} from '@/lib/pile-poil/engine'

export type ChronoDialView =
  | { kind: 'idle' }
  | { kind: 'running'; startedAt: number }
  | { kind: 'result'; elapsedMs: number; deltaMs: number; bullseye: boolean }

type ChronoDialProps = {
  view: ChronoDialView
  targetMs: number
  level: PilePoilLevel
  /** Secondes au centième, sans unité (« 10,03 »), selon la langue. */
  formatSeconds: (ms: number) => string
  /** Écart signé au centième (« +0,03 », « −0,59 »). */
  formatDelta: (ms: number) => string
}

const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const arc = (part: number) => `${Math.max(0, Math.min(part, 1)) * CIRCUMFERENCE} ${CIRCUMFERENCE}`

/**
 * Le cadran du chrono : anneau or (la cible = un tour complet), chiffres au
 * centre. Pendant la mesure, il ne sert qu'à l'œil : le temps vient des
 * horodatages des appuis, jamais de ce qui est affiché. Il ne bouge que
 * jusqu'à 3 s (chiffres en Normal, anneau dans les deux niveaux), puis se
 * fige — après, aucun indice.
 */
export function ChronoDial({ view, targetMs, level, formatSeconds, formatDelta }: ChronoDialProps) {
  const t = useTranslations('games.pile-poil.dial')
  const startedAt = view.kind === 'running' ? view.startedAt : null
  const [shownMs, setShownMs] = useState(0)

  useEffect(() => {
    if (startedAt === null) return
    let frame = 0
    const tick = () => {
      const elapsed = Math.max(0, performance.now() - startedAt)
      setShownMs(Math.min(elapsed, PILE_POIL_REVEAL_MS))
      // Au-delà de 3 s, plus rien ne change à l'écran : la boucle s'arrête.
      if (elapsed < PILE_POIL_REVEAL_MS) frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [startedAt])

  const unit = t('unit')
  // Espace insécable : l'unité ne part jamais seule à la ligne.
  const target = `${formatSeconds(targetMs)}\u00a0${unit}`

  let progress = 0
  let overshoot = 0
  if (view.kind === 'running') progress = ringProgress(shownMs, targetMs)
  if (view.kind === 'result' && targetMs > 0) {
    progress = Math.min(view.elapsedMs / targetMs, 1)
    // Un pile poil un poil en retard ne doit pas montrer de dépassement rouge.
    overshoot = view.bullseye ? 0 : Math.max(0, view.elapsedMs - targetMs) / targetMs
  }

  const hint = level === 'normal' ? t('hint.normal') : t('hint.pro')
  const bullseye = view.kind === 'result' && view.bullseye

  return (
    <div className="relative mx-auto aspect-square w-[min(15rem,68vw)]">
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className={cn('h-full w-full', bullseye && 'drop-shadow-[0_0_18px_rgba(217,164,65,0.55)]')}
      >
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="6" className="stroke-gold/20" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="6"
          strokeLinecap={progress > 0 ? 'round' : 'butt'}
          transform="rotate(-90 50 50)"
          className={cn(
            'stroke-gold',
            view.kind === 'result' && 'motion-safe:transition-[stroke-dasharray] motion-safe:duration-700 motion-safe:ease-out'
          )}
          style={{ strokeDasharray: arc(progress) }}
        />
        {overshoot > 0 && (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            className="stroke-red-300"
            style={{ strokeDasharray: arc(overshoot) }}
          />
        )}
        {/* La cible : le haut du cadran, où l'anneau boucle son tour. */}
        <line x1="50" y1="1.5" x2="50" y2="10.5" strokeWidth="2" strokeLinecap="round" className="stroke-cream" />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
        {view.kind === 'idle' ? (
          <>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('target')}</span>
            <span className="font-display text-5xl font-bold leading-none tabular-nums text-cream">
              {formatSeconds(targetMs)}
              <small className="ml-1 text-xl font-semibold text-cream/80">{unit}</small>
            </span>
            <span className="mt-1 text-xs text-cream/70">{hint}</span>
          </>
        ) : view.kind === 'running' ? (
          <>
            <span className="text-xs font-semibold text-gold">{t('targetSmall', { target })}</span>
            <span role="timer" className="font-display text-5xl font-bold leading-none tabular-nums text-cream">
              {digitsVisible(level, shownMs) ? formatSeconds(shownMs) : t('hidden')}
              <small className="ml-1 text-xl font-semibold text-cream/80">{unit}</small>
            </span>
            <span className="mt-1 text-xs text-cream/70">{hint}</span>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold text-gold">{t('targetSmall', { target })}</span>
            <span
              className={cn(
                'font-display text-5xl font-bold leading-none tabular-nums',
                view.bullseye ? 'text-gold' : 'text-cream'
              )}
            >
              {formatSeconds(view.elapsedMs)}
              <small className="ml-1 text-xl font-semibold text-cream/80">{unit}</small>
            </span>
            <span
              className={cn(
                'font-display text-lg font-bold tabular-nums',
                view.bullseye ? 'text-gold' : Math.abs(view.deltaMs) >= 1_000 ? 'text-red-300' : 'text-cream/80'
              )}
            >
              {formatDelta(view.deltaMs)}
            </span>
            <span
              className={cn(
                'text-sm font-semibold',
                view.bullseye ? 'text-gold motion-safe:animate-pulse' : 'text-cream/70'
              )}
            >
              {view.bullseye ? t('exact') : view.deltaMs < 0 ? t('early') : t('late')}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
