"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { playGameSound } from '@/lib/sound/game-sounds'

/**
 * Fait avancer les pions CASE PAR CASE vers leur position réelle — partagé
 * local + online. L'état de jeu saute directement à la position finale ; ce
 * hook ne gère que l'affichage : il rapproche chaque pion d'une case à la
 * fois (~120 ms), ce qui « raconte » le résultat du dé sur le plateau.
 *
 * Les grands sauts (téléport, échange…) sont accélérés pour rester < 1 s.
 * `prefers-reduced-motion` ⇒ positions réelles immédiates.
 */
export function useSteppedPositions(
  targets: Record<string, number>,
  onStep?: (playerId: string, position: number) => void
): { positions: Record<string, number>; isStepping: boolean } {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState<Record<string, number>>(targets)
  const onStepRef = useRef(onStep)
  onStepRef.current = onStep

  const targetsKey = useMemo(() => JSON.stringify(targets), [targets])

  useEffect(() => {
    const goal: Record<string, number> = JSON.parse(targetsKey)

    if (reduced) {
      setDisplay(goal)
      return
    }

    // Purge les pions disparus, initialise les nouveaux à leur position réelle.
    setDisplay((prev) => {
      const next: Record<string, number> = {}
      for (const id of Object.keys(goal)) next[id] = prev[id] ?? goal[id]
      return next
    })

    const maxDelta = Math.max(
      0,
      ...Object.keys(goal).map((id) => Math.abs(goal[id] - (display[id] ?? goal[id])))
    )
    if (maxDelta === 0) return
    // Une case à la fois ; pas plus d'une seconde au total pour les grands sauts.
    const stepMs = maxDelta > 8 ? Math.max(45, Math.floor(950 / maxDelta)) : 120

    const timer = setInterval(() => {
      setDisplay((prev) => {
        let changed = false
        const next: Record<string, number> = {}
        for (const id of Object.keys(goal)) {
          const cur = prev[id] ?? goal[id]
          if (cur !== goal[id]) {
            next[id] = cur + Math.sign(goal[id] - cur)
            changed = true
            playGameSound('step')
            onStepRef.current?.(id, next[id])
          } else {
            next[id] = cur
          }
        }
        if (!changed) {
          clearInterval(timer)
          return prev
        }
        return next
      })
    }, stepMs)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- display volontairement absent : lu au démarrage seulement
  }, [targetsKey, reduced])

  const isStepping = useMemo(() => {
    const goal: Record<string, number> = JSON.parse(targetsKey)
    return Object.keys(goal).some((id) => (display[id] ?? goal[id]) !== goal[id])
  }, [display, targetsKey])

  return { positions: display, isStepping }
}
