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

export function useDrinkDeltas(
  drinksById: Record<string, number>,
  ttlMs = 1500,
  opts?: { silent?: boolean }
): DrinkDelta[] {
  const [deltas, setDeltas] = useState<DrinkDelta[]>([])
  const prevRef = useRef<Record<string, number> | null>(null)
  // Un minuteur par lot, vidé au démontage seulement : lié au nettoyage de
  // l'effet, le retrait d'un lot sautait dès que les gorgées rechangeaient en
  // moins de `ttlMs`, et son « +N » restait affiché pour de bon.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const silent = opts?.silent ?? false

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

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

    if (!silent) playGameSound('drink')
    setDeltas((cur) => [...cur, ...fresh])
    const keys = new Set(fresh.map((f) => f.key))
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      setDeltas((cur) => cur.filter((d) => !keys.has(d.key)))
    }, ttlMs)
    timersRef.current.add(timer)
  }, [drinksById, ttlMs, silent])

  return deltas
}

/** Picto d'un gage : pas d'alcool à l'écran en ambiance Soft (🌿, comme ses textes). */
export function drinkIcon(ambiance: AmbianceMode): string {
  return ambiance === 'soft' ? '🌿' : '🍺'
}

/**
 * « +N 🍺 » qui flotte au-dessus d'un conteneur en `position: relative`.
 *
 * `above` : centré au-dessus du conteneur (un pion du plateau). Le badge
 * vivait dans les cartes du classement, un défileur horizontal : son
 * overflow-y passait à `auto` et rognait le badge dès son envol, sous le
 * plateau et donc hors écran. Posé sur le pion, il s'envole là où l'œil
 * regarde, sans défileur pour le couper.
 */
export function FloatingDrinkBadge({
  deltas,
  placement = 'corner',
}: {
  deltas: DrinkDelta[]
  placement?: 'corner' | 'above'
}) {
  const reduced = useReducedMotion()
  const { mode } = useAmbianceMode()
  const icon = drinkIcon(mode)
  const badges = (
    <AnimatePresence>
      {deltas.map((d) => (
        <motion.span
          key={d.key}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 4, scale: 0.8 }}
          animate={reduced ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: -26, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className={
            (placement === 'above' ? 'relative ' : 'absolute -top-1 right-2 ') +
            'pointer-events-none z-20 whitespace-nowrap rounded-full border border-suit-red/60 bg-suit-red px-2 py-0.5 text-xs font-bold leading-4 text-cream shadow-lg'
          }
          aria-hidden
        >
          +{d.delta} {icon}
        </motion.span>
      ))}
    </AnimatePresence>
  )
  if (placement === 'corner') return badges
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 flex -translate-x-1/2 flex-col items-center">
      {badges}
    </span>
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
