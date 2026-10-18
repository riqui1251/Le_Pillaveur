"use client"

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useAmbianceMode, type AmbianceMode } from '@/components/providers/AmbianceAttribute'
import { playGameSound } from '@/lib/sound/game-sounds'

/**
 * Feedback visuel des gorgées — partagé local + online.
 *
 * `useDrinkDeltas` détecte les hausses de compteur entre deux rendus et émet
 * des événements éphémères ; `FloatingDrinkBadge` fait flotter « +N 🍺 »
 * (« +N 🌿 » en ambiance Soft) sur la carte du joueur, `PulsingCount` fait
 * pulser le compteur à chaque change.
 */

export type DrinkDelta = { key: number; playerId: string; delta: number }

let deltaKey = 0

export function useDrinkDeltas(drinksById: Record<string, number>, ttlMs = 1500): DrinkDelta[] {
  const [deltas, setDeltas] = useState<DrinkDelta[]>([])
  const prevRef = useRef<Record<string, number> | null>(null)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = drinksById
    if (!prev) return

    const fresh: DrinkDelta[] = []
    for (const id of Object.keys(drinksById)) {
      const before = prev[id]
      const delta = drinksById[id] - (before ?? drinksById[id])
      if (before != null && delta > 0) {
        deltaKey += 1
        fresh.push({ key: deltaKey, playerId: id, delta })
      }
    }
    if (fresh.length === 0) return

    playGameSound('drink')
    setDeltas((cur) => [...cur, ...fresh])
    const keys = new Set(fresh.map((f) => f.key))
    const timer = setTimeout(() => {
      setDeltas((cur) => cur.filter((d) => !keys.has(d.key)))
    }, ttlMs)
    return () => clearTimeout(timer)
  }, [drinksById, ttlMs])

  return deltas
}

/** Picto d'un gage : pas d'alcool à l'écran en ambiance Soft (🌿, comme ses textes). */
export function drinkIcon(ambiance: AmbianceMode): string {
  return ambiance === 'soft' ? '🌿' : '🍺'
}

/** « +N 🍺 » qui flotte au-dessus d'un conteneur en `position: relative`. */
export function FloatingDrinkBadge({ deltas }: { deltas: DrinkDelta[] }) {
  const reduced = useReducedMotion()
  const { mode } = useAmbianceMode()
  const icon = drinkIcon(mode)
  return (
    <AnimatePresence>
      {deltas.map((d) => (
        <motion.span
          key={d.key}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 4, scale: 0.8 }}
          animate={reduced ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: -26, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className="pointer-events-none absolute -top-1 right-2 z-20 whitespace-nowrap rounded-full border border-suit-red/60 bg-suit-red px-2 py-0.5 text-xs font-bold text-cream shadow-lg"
          aria-hidden
        >
          +{d.delta} {icon}
        </motion.span>
      ))}
    </AnimatePresence>
  )
}

/** Compteur qui pulse quand sa valeur change. */
export function PulsingCount({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.span
      key={value}
      initial={reduced ? {} : { scale: 1.6 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      className={className}
    >
      {value}
    </motion.span>
  )
}
