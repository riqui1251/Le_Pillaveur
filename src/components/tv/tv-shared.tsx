"use client"

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Palette d'avatars TV (lisible de loin, contrastée sur fond sombre). */
export const TV_PALETTE = [
  '#f472b6', '#60a5fa', '#34d399', '#fbbf24',
  '#a78bfa', '#fb7185', '#22d3ee', '#facc15',
]

export function tvColor(index: number): string {
  return TV_PALETTE[((index % TV_PALETTE.length) + TV_PALETTE.length) % TV_PALETTE.length]
}

/** Avatar TV : pastille colorée + initiale, lisible à distance. */
export function TvAvatar({
  name,
  index,
  size = 56,
  active = false,
}: {
  name: string
  index: number
  size?: number
  active?: boolean
}) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-black text-black/80 shadow-lg',
        active && 'ring-4 ring-white/80',
      )}
      style={{ width: size, height: size, backgroundColor: tvColor(index), fontSize: size * 0.44 }}
      aria-hidden
    >
      {initial}
    </span>
  )
}

/** Barre de temps animée — partagée entre tous les rendus TV à minuteur. */
export function TvTimeBar({
  timeLeftMs,
  totalMs,
  dangerMs,
  colorClass = 'bg-gold',
  dangerClass = 'bg-suit-red',
}: {
  timeLeftMs: number
  totalMs: number
  dangerMs: number
  colorClass?: string
  dangerClass?: string
}) {
  const reduced = useReducedMotion()
  const pct = Math.min(100, Math.max(0, (timeLeftMs / totalMs) * 100))
  return (
    <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
      <motion.div
        className={cn('h-full rounded-full', timeLeftMs < dangerMs ? dangerClass : colorClass)}
        animate={{ width: `${pct}%` }}
        transition={{ duration: reduced ? 0 : 0.3, ease: 'linear' }}
      />
    </div>
  )
}

/** Grand compte à rebours (lancement de manche) — partagé entre tous les rendus TV. */
export function TvBigCountdown({ seconds, colorClass = 'text-gold' }: { seconds: number; colorClass?: string }) {
  const reduced = useReducedMotion()
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={seconds}
        initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 1.4 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.7 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={cn('font-display text-[12rem] font-bold leading-none tabular-nums', colorClass)}
      >
        {seconds}
      </motion.span>
    </AnimatePresence>
  )
}
