"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { LastInteraction } from '@/lib/petit-buveur/engine'
import { DiceFace } from './DiceOverlay'
import { playGameSound } from '@/lib/sound/game-sounds'

/**
 * Spectacle des tirages interactifs EN LIGNE — roue, pièce, dé de la honte.
 *
 * Le serveur a déjà décidé du résultat (`lastInteraction` public dans l'état) ;
 * ce composant ne fait que le mettre en scène, chez TOUS les joueurs en même
 * temps : l'acteur, les spectateurs et pendant les tours de bots.
 */

const WHEEL_SEGMENTS = 15
const WHEEL_COLORS = ['#f59e0b', '#8b5cf6', '#10b981']

type Labels = {
  wheelSafe: string
  wheelDrinks: string
  pfWin: string
  pfLose: string
  pile: string
  face: string
  deHonteSafe: string
  deHonteDrink: string
  deHonteForward: string
  deHonteBack: string
}

/** Gorgées infligées par le tirage (0 = safe), toutes variantes confondues. */
function interactionDrinks(inter: LastInteraction): number {
  if (inter.kind === 'de-honte') return inter.value === 3 || inter.value === 4 ? 2 : 0
  return inter.drinks
}

function outcomeText(inter: LastInteraction, labels: Labels, targetName: string): string {
  switch (inter.kind) {
    case 'roue':
    case 'roue-defis':
      return inter.drinks > 0 ? labels.wheelDrinks.replace('{count}', String(inter.drinks)) : labels.wheelSafe
    case 'pile-face':
      return inter.drinks > 0
        ? labels.pfLose.replace('{name}', targetName).replace('{count}', String(inter.drinks))
        : labels.pfWin
    case 'de-honte':
      if (inter.value <= 2) return labels.deHonteSafe
      if (inter.value <= 4) return labels.deHonteDrink
      if (inter.value === 5) return labels.deHonteForward
      return labels.deHonteBack
  }
}

function SpinningWheel({ segment, reduced }: { segment: number; reduced: boolean }) {
  // La roue s'arrête avec le segment tiré sous l'aiguille (en haut).
  const segAngle = 360 / WHEEL_SEGMENTS
  const finalRotation = 360 * 4 - (segment * segAngle + segAngle / 2)
  const gradient = useMemo(() => {
    const stops = Array.from({ length: WHEEL_SEGMENTS }, (_, i) => {
      const color = WHEEL_COLORS[i % WHEEL_COLORS.length]
      return `${color} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [segAngle])

  return (
    <div className="relative">
      <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-xl" aria-hidden>
        🔻
      </div>
      <motion.div
        initial={{ rotate: 0 }}
        animate={{ rotate: reduced ? finalRotation % 360 : finalRotation }}
        transition={reduced ? { duration: 0 } : { duration: 2.4, ease: [0.15, 0.6, 0.25, 1] }}
        className="h-36 w-36 rounded-full border-4 border-white/25 shadow-2xl"
        style={{ backgroundImage: gradient }}
      />
    </div>
  )
}

function FlippingCoin({ flip, pileLabel, faceLabel, reduced }: { flip: 'pile' | 'face'; pileLabel: string; faceLabel: string; reduced: boolean }) {
  // La pièce tourne puis retombe sur le côté tiré par le serveur.
  const halfTurns = 7
  const finalRotation = halfTurns * 180 + (flip === 'face' ? 180 : 0)
  return (
    <div style={{ perspective: 600 }}>
      <motion.div
        initial={{ rotateX: 0 }}
        animate={{ rotateX: reduced ? finalRotation % 360 : finalRotation }}
        transition={reduced ? { duration: 0 } : { duration: 1.8, ease: [0.2, 0.7, 0.3, 1] }}
        className="relative h-28 w-28"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-amber-300/60 bg-gradient-to-br from-amber-400 to-yellow-600 text-lg font-black text-amber-950 shadow-2xl"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {pileLabel}
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-slate-300/60 bg-gradient-to-br from-slate-300 to-slate-500 text-lg font-black text-slate-900 shadow-2xl"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
        >
          {faceLabel}
        </div>
      </motion.div>
    </div>
  )
}

function ShameDieSpectacle({ value, reduced }: { value: number; reduced: boolean }) {
  const [face, setFace] = useState(1)
  const [settled, setSettled] = useState(reduced)
  useEffect(() => {
    if (reduced) return
    const spin = setInterval(() => setFace((f) => 1 + ((f + 2) % 6)), 90)
    const stop = setTimeout(() => {
      clearInterval(spin)
      setSettled(true)
    }, 1200)
    return () => {
      clearInterval(spin)
      clearTimeout(stop)
    }
  }, [reduced])
  return (
    <motion.div
      animate={settled ? { scale: 1 } : { rotate: [0, -10, 8, 0] }}
      transition={settled ? { type: 'spring', stiffness: 300, damping: 15 } : { duration: 0.5, repeat: Infinity }}
    >
      <DiceFace value={settled ? value : face} accent={settled} />
    </motion.div>
  )
}

export function InteractionSpectacle({
  interaction,
  caseLabel,
  actorName,
  targetName,
  labels,
}: {
  interaction: LastInteraction | null | undefined
  /** Libellé traduit du type de case (ex. « Roue »). */
  caseLabel: string
  actorName: string
  targetName: string
  labels: Labels
}) {
  const reduced = useReducedMotion() ?? false
  const [current, setCurrent] = useState<LastInteraction | null>(null)
  const [showOutcome, setShowOutcome] = useState(false)
  // `undefined` = premier rendu : on mémorise le tirage déjà présent SANS le
  // rejouer (rejoindre/recharger la page ne rejoue pas un vieux spectacle).
  const lastSeenRef = useRef<string | null | undefined>(undefined)

  // Nouveau tirage (comparaison structurelle) → jouer le spectacle ~4 s.
  const interactionKey = interaction ? JSON.stringify(interaction) : null
  useEffect(() => {
    if (lastSeenRef.current === undefined) {
      lastSeenRef.current = interactionKey
      return
    }
    if (!interactionKey || interactionKey === lastSeenRef.current) return
    lastSeenRef.current = interactionKey
    const inter = JSON.parse(interactionKey) as LastInteraction
    setCurrent(inter)
    setShowOutcome(false)
    playGameSound(inter.kind === 'de-honte' ? 'dice-roll' : 'wheel')
    const spinMs = reduced ? 150 : inter.kind === 'de-honte' ? 1300 : inter.kind === 'pile-face' ? 1900 : 2500
    const outcomeTimer = setTimeout(() => {
      setShowOutcome(true)
      playGameSound(interactionDrinks(inter) > 0 ? 'drink' : 'dice-result')
    }, spinMs)
    const hideTimer = setTimeout(() => setCurrent(null), spinMs + 1900)
    return () => {
      clearTimeout(outcomeTimer)
      clearTimeout(hideTimer)
    }
  }, [interactionKey, reduced])

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[118] flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4 px-6">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-gray-900/90 px-4 py-1.5">
              <span className="rounded-full border border-violet-400/30 bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-100">
                {caseLabel}
              </span>
              <span className="max-w-[11rem] truncate text-sm font-semibold text-white/90">{actorName}</span>
            </div>

            {(current.kind === 'roue' || current.kind === 'roue-defis') && (
              <SpinningWheel
                key={lastSeenRef.current}
                segment={current.kind === 'roue' ? current.segment : current.drinks > 0 ? 1 : 2}
                reduced={reduced}
              />
            )}
            {current.kind === 'pile-face' && (
              <FlippingCoin
                key={lastSeenRef.current}
                flip={current.flip}
                pileLabel={labels.pile}
                faceLabel={labels.face}
                reduced={reduced}
              />
            )}
            {current.kind === 'de-honte' && (
              <ShameDieSpectacle key={lastSeenRef.current} value={current.value} reduced={reduced} />
            )}

            <AnimatePresence>
              {showOutcome && (
                <motion.p
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 18 }}
                  className={cn(
                    'rounded-2xl border px-5 py-2.5 text-center text-lg font-bold shadow-xl',
                    interactionDrinks(current) > 0
                      ? 'border-red-400/40 bg-red-500/20 text-red-100'
                      : 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                  )}
                >
                  {outcomeText(current, labels, targetName)}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
