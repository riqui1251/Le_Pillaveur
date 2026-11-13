"use client"

import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Teintes des cercles (« R G B »), claires pour se lire sur le feutre vert
 * comme sur le bleu nuit du Soft. Ni or, ni rouge, ni bleu jeton : ces trois
 * couleurs-là sont réservées aux verdicts (désigné, doigt levé, camps).
 */
export const PALETTE = [
  '110 231 183',
  '125 211 252',
  '196 181 253',
  '249 168 212',
  '253 186 116',
  '190 242 100',
  '103 232 249',
  '240 171 252',
  '165 180 252',
  '243 234 211',
] as const

export type FingerTone = 'gold' | 'blue' | 'red'

// Le bleu jeton (#274B8F) disparaît en anneau sur le feutre : sa version claire
// trace le cercle, le jeton lui-même reste le fond de l'étiquette.
const TONE_RGB: Record<FingerTone, string> = {
  gold: 'var(--gold-rgb)',
  blue: '110 150 232',
  red: '248 113 113',
}

const BADGE_TONE: Record<FingerTone | 'cream', string> = {
  gold: 'bg-gold text-[#24201A]',
  blue: 'bg-chip-blue text-cream ring-1 ring-cream/40',
  red: 'bg-suit-red text-cream',
  cream: 'bg-cream text-[#24201A]',
}

const BASE_PX = 84
const BIG_PX = 108
/** Écart entre le cercle et ses étiquettes. */
const BADGE_GAP_PX = 6

export type FingerBadge = {
  text: string
  tone: FingerTone | 'cream'
  /** Numéro d'ordre : lisible de l'autre bout de la table. */
  large?: boolean
}

export type FingerLook = {
  /** Couleur propre du doigt (indice dans PALETTE) ou couleur de verdict. */
  ring: number | FingerTone
  big?: boolean
  glow?: boolean
  dim?: boolean
  dashed?: boolean
  pulse?: boolean
  badges: FingerBadge[]
}

type FingerMarkProps = {
  /** Centre du cercle dans la zone ; ensuite déplacé dans le DOM par le parent, sans rendu React. */
  position: { x: number; y: number }
  look: FingerLook
  /** Étiquettes sous le cercle : au-dessus, elles sortiraient de la zone. */
  badgesBelow: boolean
  /** Décalage horizontal des étiquettes (px) qui les garde dans la zone près d'un bord. */
  badgeShift: number
  reduced: boolean
}

export const FingerMark = forwardRef<HTMLDivElement, FingerMarkProps>(function FingerMark(
  { position, look, badgesBelow, badgeShift, reduced },
  ref
) {
  const rgb = typeof look.ring === 'number' ? PALETTE[look.ring % PALETTE.length] : TONE_RGB[look.ring]
  const size = look.big ? BIG_PX : BASE_PX
  const pulsing = Boolean(look.pulse) && !reduced
  const badgeOffset = size / 2 + BADGE_GAP_PX

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <motion.div
        className={cn(
          'absolute rounded-full border-[5px] transition-[width,height,left,top,opacity] duration-200 ease-out',
          look.dashed && 'border-dashed'
        )}
        style={{
          width: size,
          height: size,
          left: -size / 2,
          top: -size / 2,
          borderColor: `rgb(${rgb})`,
          backgroundImage: `radial-gradient(circle, rgb(${rgb} / 0.4) 0%, rgb(${rgb} / 0) 70%)`,
          boxShadow: look.glow
            ? `0 0 0 8px rgb(${rgb} / 0.18), 0 0 40px rgb(${rgb} / 0.65)`
            : `0 0 22px -6px rgb(${rgb} / 0.8)`,
          opacity: look.dim ? 0.4 : 1,
        }}
        animate={pulsing ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={pulsing ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : { duration: reduced ? 0 : 0.2 }}
      />
      {look.badges.length > 0 && (
        <div
          className="absolute flex items-center gap-1"
          style={{
            left: badgeShift,
            top: badgesBelow ? badgeOffset : -badgeOffset,
            transform: badgesBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
          }}
        >
          {look.badges.map((badge) => (
            <span
              key={`${badge.tone}:${badge.text}`}
              className={cn(
                'flex items-center justify-center whitespace-nowrap rounded-full font-display font-bold shadow-[0_6px_14px_-6px_rgba(0,0,0,0.8)]',
                badge.large
                  ? 'h-10 min-w-[2.5rem] px-2 text-2xl leading-none tabular-nums'
                  : 'px-2.5 py-0.5 text-sm leading-tight',
                BADGE_TONE[badge.tone]
              )}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
