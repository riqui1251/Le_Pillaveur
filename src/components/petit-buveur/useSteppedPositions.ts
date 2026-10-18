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
 *
 * `snapKey` : quand sa valeur change, les pions sautent sur leur cible sans
 * marcher (Rejouer, reprise d'une partie, changement de langue…). Les
 * nouvelles cibles doivent arriver dans le MÊME rendu que la nouvelle clé.
 */
export function useSteppedPositions(
  targets: Record<string, number>,
  opts?: {
    /** Suspend l'animation (ex. pendant l'overlay du dé) — reprend au dégel. */
    frozen?: boolean
    onStep?: (playerId: string, position: number) => void
    snapKey?: string | number
  }
): { positions: Record<string, number>; isStepping: boolean } {
  const reduced = useReducedMotion()
  const frozen = opts?.frozen ?? false
  const snapKey = opts?.snapKey
  const [display, setDisplay] = useState<Record<string, number>>(targets)
  const [seenSnapKey, setSeenSnapKey] = useState(snapKey)
  const onStepRef = useRef(opts?.onStep)
  onStepRef.current = opts?.onStep

  // Ajusté pendant le rendu, pas dans un effet : l'ancienne position ne
  // s'affiche pas une image avant le saut.
  let shown = display
  // Object.is : une clé NaN ne doit pas relancer le saut à chaque rendu.
  if (!Object.is(seenSnapKey, snapKey)) {
    shown = startDisplay(display, targets, true)
    setSeenSnapKey(snapKey)
    setDisplay(shown)
  }

  const targetsKey = useMemo(() => JSON.stringify(targets), [targets])

  useEffect(() => {
    const goal: Record<string, number> = JSON.parse(targetsKey)

    if (reduced) {
      setDisplay(goal)
      return
    }
    if (frozen) return

    setDisplay((prev) => startDisplay(prev, goal, false))

    const maxDelta = Math.max(
      0,
      ...Object.keys(goal).map((id) => Math.abs(goal[id] - (shown[id] ?? goal[id])))
    )
    if (maxDelta === 0) return
    const stepMs = stepDelayMs(maxDelta)

    const timer = setInterval(() => {
      setDisplay((prev) => {
        const step = stepDisplay(prev, goal)
        if (!step) {
          clearInterval(timer)
          return prev
        }
        for (const id of step.moved) {
          playGameSound('step')
          onStepRef.current?.(id, step.next[id])
        }
        return step.next
      })
    }, stepMs)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shown volontairement absent : lu au démarrage seulement
  }, [targetsKey, reduced, frozen])

  const isStepping = useMemo(() => {
    const goal: Record<string, number> = JSON.parse(targetsKey)
    return Object.keys(goal).some((id) => (shown[id] ?? goal[id]) !== goal[id])
  }, [shown, targetsKey])

  return { positions: shown, isStepping }
}

/**
 * Point de départ de l'affichage face à de nouvelles cibles. Sans saut,
 * chaque pion garde sa case affichée (les nouveaux sont posés sur leur cible,
 * les disparus purgés) ; avec saut, tout le monde est déjà arrivé.
 */
export function startDisplay(
  prev: Record<string, number>,
  goal: Record<string, number>,
  snap: boolean
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const id of Object.keys(goal)) next[id] = snap ? goal[id] : (prev[id] ?? goal[id])
  return next
}

/** Un pas d'animation : chaque pion pas encore arrivé se rapproche d'une case. `null` quand tous sont arrivés. */
export function stepDisplay(
  prev: Record<string, number>,
  goal: Record<string, number>
): { next: Record<string, number>; moved: string[] } | null {
  const next: Record<string, number> = {}
  const moved: string[] = []
  for (const id of Object.keys(goal)) {
    const cur = prev[id] ?? goal[id]
    next[id] = cur === goal[id] ? cur : cur + Math.sign(goal[id] - cur)
    if (next[id] !== cur) moved.push(id)
  }
  return moved.length > 0 ? { next, moved } : null
}

/** Une case toutes les 120 ms ; au-delà de 8 cases, accéléré pour rester sous une seconde. */
export function stepDelayMs(maxDelta: number): number {
  return maxDelta > 8 ? Math.max(45, Math.floor(950 / maxDelta)) : 120
}
