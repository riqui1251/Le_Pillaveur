"use client"

import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { playGameSound } from '@/lib/sound/game-sounds'

/**
 * Overlay plein écran du lancer de dé — partagé local + online.
 *
 * Le moteur/le code appelant tire le résultat ; ce composant ne fait QUE la
 * mise en scène : faces qui défilent pendant `rolling`, arrêt net sur `result`
 * avec un maintien court pour laisser lire le résultat avant le déplacement.
 */

export type DiceOverlayState =
  | { phase: 'rolling'; playerName: string; playerIcon: ReactNode }
  | { phase: 'result'; value: number; playerName: string; playerIcon: ReactNode }

/** Positions des points par face (grille 3×3, [ligne, colonne]). */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

export function DiceFace({ value, accent, size = 96 }: { value: number; accent?: boolean; size?: number }) {
  const pips = PIPS[value] ?? PIPS[1]
  return (
    <div
      className={
        'relative grid grid-cols-3 grid-rows-3 place-items-center rounded-2xl bg-white p-3 shadow-2xl ' +
        (accent ? 'ring-4 ring-amber-400/80 shadow-amber-500/40' : 'shadow-black/50')
      }
      style={{ width: size, height: size }}
    >
      {pips.map(([row, col], i) => (
        <span
          key={i}
          className="rounded-full bg-gray-900"
          style={{ gridRow: row + 1, gridColumn: col + 1, width: size * 0.167, height: size * 0.167 }}
        />
      ))}
    </div>
  )
}

export function DiceOverlay({
  state,
  onSkip,
  skipLabel,
}: {
  state: DiceOverlayState | null
  /** Tap n'importe où sur l'overlay → le parent écourte la séquence. */
  onSkip?: () => void
  skipLabel?: string
}) {
  const reduced = useReducedMotion()
  // Faces qui défilent pendant le lancer (purement visuel, le résultat est déjà tiré).
  const [spinFace, setSpinFace] = useState(1)
  const rolling = state?.phase === 'rolling'

  useEffect(() => {
    if (!rolling || reduced) return
    const timer = setInterval(() => {
      setSpinFace((f) => 1 + ((f + Math.floor(Math.random() * 5)) % 6))
    }, 85)
    return () => clearInterval(timer)
  }, [rolling, reduced])

  // Sons : roulement pendant le lancer, clac à l'arrêt sur le résultat.
  const phase = state?.phase ?? null
  useEffect(() => {
    if (phase === 'rolling') playGameSound('dice-roll')
    else if (phase === 'result') playGameSound('dice-result')
  }, [phase])

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.15 }}
          className={
            'fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-[2px] ' +
            (onSkip ? 'cursor-pointer' : 'pointer-events-none')
          }
          role="status"
          aria-live="polite"
          onClick={onSkip}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-gray-900/90 px-4 py-1.5">
              <span className="flex h-6 w-6 items-center justify-center text-base leading-none" aria-hidden>
                {state.playerIcon}
              </span>
              <span className="max-w-[12rem] truncate text-sm font-semibold text-white/90">
                {state.playerName}
              </span>
            </div>
            {state.phase === 'rolling' ? (
              <motion.div
                animate={reduced ? {} : { rotate: [0, -14, 10, -8, 12, 0], y: [0, -10, 0, -6, 0] }}
                transition={{ duration: 0.55, repeat: Infinity, ease: 'easeInOut' }}
              >
                <DiceFace value={reduced ? 3 : spinFace} />
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={reduced ? { scale: 1 } : { scale: 1.35, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
              >
                <DiceFace value={state.value} accent />
              </motion.div>
            )}
            {onSkip && skipLabel && (
              <p className="text-[11px] font-medium text-white/40">{skipLabel}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
