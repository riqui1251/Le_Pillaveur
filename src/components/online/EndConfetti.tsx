"use client"

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import type confetti from 'canvas-confetti'
import { cn } from '@/lib/utils'

/**
 * CONFETTIS DE FIN DE PARTIE — une seule bibliothèque, chargée à la demande.
 *
 * Deux bibliothèques cohabitaient : react-confetti (écrans de fin, TV) et
 * canvas-confetti (Monsieur 3). Toutes deux partaient dans le socle de
 * chaque page alors qu'on ne les voit qu'à la victoire. Ne reste que
 * canvas-confetti, importée dans un effet (`import()`), donc dans son propre
 * morceau : le premier écran ne la paie plus. Les préférences de mouvement
 * réduit coupent tout, chargement compris.
 *
 * Le canevas est CELUI du composant (position absolue dans son conteneur,
 * comme l'était celui de react-confetti) : un écran de fin le pose sous ses
 * boutons, une modale sous sa carte — l'empilement ne change pas.
 */

type ConfettiLib = typeof confetti

let libPromise: Promise<ConfettiLib> | null = null

/** Charge canvas-confetti UNE fois, à la demande. */
export function loadConfetti(): Promise<ConfettiLib> {
  if (!libPromise) libPromise = import('canvas-confetti').then((m) => m.default)
  return libPromise
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Précharge la bibliothèque pour un jeu qui tire ses salves sur une action
 * (Monsieur 3) : la première part avec le lancer, pas une requête après.
 */
export function preloadConfetti(): void {
  if (prefersReducedMotion()) return
  void loadConfetti()
}

/**
 * Salve ponctuelle sur le canevas plein écran de la bibliothèque, pour un
 * jet déclenché par une action (Monsieur 3 : depuis la zone des dés).
 */
export function fireConfetti(options: confetti.Options): void {
  if (prefersReducedMotion()) return
  void loadConfetti().then((fire) => fire(options))
}

/** Pièces d'une salve : ce que react-confetti lançait sur les écrans de fin. */
const SALVO_PIECES = 180
/** Cadence d'émission : ~30 jets par seconde, deux pièces par jet en salve. */
const EMIT_EVERY_MS = 33
/** Durée de vie d'une pièce (images) : ~4 s, le temps de traverser l'écran. */
const PIECE_TICKS = 260
/** En pluie continue, on renouvelle les pièces au rythme où elles meurent. */
const RAIN_LIFETIME_S = PIECE_TICKS / 60

export function EndConfetti({
  pieces = SALVO_PIECES,
  rain = false,
  className,
}: {
  /** Salve : nombre total de pièces ; pluie : pièces vivantes en régime établi. */
  pieces?: number
  /** Pluie continue jusqu'au démontage (l'ancien `recycle`). */
  rain?: boolean
  className?: string
}) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (reduced) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let instance: confetti.CreateTypes | null = null
    let emitter: ReturnType<typeof setInterval> | undefined

    void loadConfetti().then((lib) => {
      if (cancelled) return
      // Le rendu tourne dans un worker (OffscreenCanvas) quand le téléphone
      // le permet : le podium animé garde ses images.
      instance = lib.create(canvas, { resize: true, useWorker: true })
      // Une chute depuis le bord haut, pièce par pièce sur toute la largeur —
      // le rideau de react-confetti, pas un canon.
      const drop = (count: number) =>
        void instance?.({
          particleCount: count,
          angle: 270,
          spread: 90,
          startVelocity: 6,
          gravity: 1.2,
          drift: (Math.random() - 0.5) * 0.6,
          ticks: PIECE_TICKS,
          origin: { x: Math.random(), y: -0.05 },
        })
      const perEmit = rain ? pieces / RAIN_LIFETIME_S / (1000 / EMIT_EVERY_MS) : 2
      let emitted = 0
      let carry = 0
      emitter = setInterval(() => {
        // Débit fractionnaire : on accumule et on lâche l'entier.
        carry += perEmit
        const count = Math.floor(carry)
        carry -= count
        if (count > 0) drop(count)
        emitted += count
        if (!rain && emitted >= pieces) clearInterval(emitter)
      }, EMIT_EVERY_MS)
    })

    return () => {
      cancelled = true
      clearInterval(emitter)
      instance?.reset()
    }
  }, [reduced, pieces, rain])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  )
}
