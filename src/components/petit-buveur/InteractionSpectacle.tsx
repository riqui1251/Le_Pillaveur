"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Shield, Swords } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { drinkIcon } from './drink-feedback'
import type { LastInteraction } from '@/lib/petit-buveur/engine'
import { DiceFace } from './DiceOverlay'
import { playGameSound } from '@/lib/sound/game-sounds'

/**
 * Spectacle des tirages interactifs EN LIGNE — roue, pièce, dé de la honte,
 * duel sur case partagée.
 *
 * Le serveur a déjà décidé du résultat (`lastInteraction` public dans l'état) ;
 * ce composant ne fait que le mettre en scène, chez TOUS les joueurs en même
 * temps : l'acteur, les spectateurs et pendant les tours de bots.
 */

const WHEEL_SEGMENTS = 15
/** Un segment sur trois est « sauvé » — même règle que le moteur (roue). */
const isSafeSegment = (i: number) => (i + 1) % 3 === 0

export type SpectacleLabels = {
  wheelSafe: string
  wheelDrinks: string
  wheelLegendSafe: string
  wheelLegendDrink: string
  pfWin: string
  pfLose: string
  pile: string
  face: string
  deHonteSafe: string
  deHonteDrink: string
  deHonteForward: string
  deHonteBack: string
  /** 6 au dé de la honte sur la case 1 : le pion ne peut pas reculer. */
  deHonteCannotBack?: string
  /** Duel : gabarits avec {winner} et {loser} (le challenger gagne / perd / perdant protégé). */
  duelWinnerStays?: string
  duelOpponentWins?: string
  duelLoserProtected?: string
  /** Duel : secteurs de la roue, du point de vue du challenger. */
  duelWinner?: string
  duelLoser?: string
}

/**
 * Durée du suspense de chaque tirage, alignée sur son animation (la roue
 * tourne 4,5 s) : le résultat ne s'écrit qu'après. L'écran TV suit les mêmes.
 */
export function spectacleSpinMs(kind: LastInteraction['kind'], reduced: boolean): number {
  if (reduced) return 150
  return kind === 'de-honte' ? 1300 : kind === 'pile-face' ? 1900 : 4600
}

/** Maintien du résultat à l'écran après le suspense. */
export const SPECTACLE_OUTCOME_HOLD_MS = 2200

/** Gorgées infligées par le tirage (0 = safe), toutes variantes confondues. */
export function interactionDrinks(inter: LastInteraction): number {
  if (inter.kind === 'de-honte') return inter.value === 3 || inter.value === 4 ? 2 : 0
  if (inter.kind === 'duel') return 0
  return inter.drinks
}

/**
 * `actorFromPosition` : index de l'acteur AVANT l'effet du tirage. À 0, le 6
 * du dé de la honte ne fait pas reculer (règle 14) : jamais de recul annoncé.
 * Sans libellé dédié, « sauvé » reste vrai (il ne s'est rien passé).
 * Duel : `targetName` est l'adversaire, `actorName` le challenger.
 */
export function outcomeText(
  inter: LastInteraction,
  labels: SpectacleLabels,
  targetName: string,
  actorFromPosition?: number,
  actorName = ''
): string {
  switch (inter.kind) {
    case 'duel': {
      const [winner, loser] = inter.challengerWins ? [actorName, targetName] : [targetName, actorName]
      const template = inter.loserProtected
        ? labels.duelLoserProtected
        : inter.challengerWins
          ? labels.duelWinnerStays
          : labels.duelOpponentWins
      return (template ?? '{winner}').replace('{winner}', winner).replace('{loser}', loser)
    }
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
      if (actorFromPosition === 0) return labels.deHonteCannotBack ?? labels.deHonteSafe
      return labels.deHonteBack
  }
}

function SpinningWheel({
  segment,
  reduced,
  legendSafe,
  legendDrink,
}: {
  segment: number
  reduced: boolean
  legendSafe: string
  legendDrink: string
}) {
  // La roue s'arrête avec le segment tiré sous l'aiguille (en haut).
  // Couleurs SIGNIFIANTES, celles de la roue du jeu local : vert bouclier =
  // sauvé, deux rouges alternés = gorgées (🌿 en Soft, comme le reste du jeu).
  const { mode } = useAmbianceMode()
  const drinkGlyph = drinkIcon(mode)
  const segAngle = 360 / WHEEL_SEGMENTS
  const finalRotation = 360 * 5 - (segment * segAngle + segAngle / 2)
  const gradient = useMemo(() => {
    const stops = Array.from({ length: WHEEL_SEGMENTS }, (_, i) => {
      const color = isSafeSegment(i)
        ? '#047857'
        : i % 2 === 0
          ? 'rgb(var(--suit-red-rgb))'
          : 'rgb(var(--suit-red-rgb) / 0.8)'
      return `${color} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [segAngle])

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 drop-shadow" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <polygon points="4,4 24,4 14,22" style={{ fill: 'rgb(var(--cream-rgb))' }} />
          </svg>
        </div>
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: reduced ? finalRotation % 360 : finalRotation }}
          transition={reduced ? { duration: 0 } : { duration: 4.5, ease: [0.12, 0.68, 0.16, 1] }}
          className="relative h-40 w-40 rounded-full border-4 border-gold/60 shadow-2xl"
          style={{ backgroundImage: gradient, backgroundColor: 'rgb(var(--cream-rgb))' }}
        >
          {/* Picto au centre de chaque segment : bouclier sauvé, verre gorgées */}
          {Array.from({ length: WHEEL_SEGMENTS }).map((_, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 flex text-sm leading-none text-cream drop-shadow"
              style={{
                transform: `translate(-50%, -50%) rotate(${(i + 0.5) * segAngle}deg) translateY(-62px)`,
              }}
              aria-hidden
            >
              {isSafeSegment(i) ? <Shield className="h-3.5 w-3.5" strokeWidth={2.5} /> : drinkGlyph}
            </span>
          ))}
          <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold/60 bg-felt-deep" />
        </motion.div>
      </div>
      {/* Légende */}
      <div className="flex items-center gap-4 rounded-full border border-gold/20 bg-felt-deep/90 px-3 py-1 text-xs font-semibold text-cream/80">
        <span className="flex items-center gap-1.5">
          <Shield aria-hidden className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2.5} /> {legendSafe}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-suit-red" aria-hidden /> <span aria-hidden>{drinkGlyph}</span> {legendDrink}
        </span>
      </div>
    </div>
  )
}

const DUEL_SEGMENTS = 12

/**
 * Roue du duel, comme celle du jeu local : douze secteurs, un sur deux
 * « gagnant » pour le challenger (secteurs pairs, en or), l'autre « perdant »
 * (rouge). Elle s'arrête sur l'issue décidée par le serveur.
 */
export function duelSegment(inter: Extract<LastInteraction, { kind: 'duel' }>): number {
  const spread = (inter.actorId.length + inter.opponentId.length) % (DUEL_SEGMENTS / 2)
  return 2 * spread + (inter.challengerWins ? 0 : 1)
}

function DuelWheel({
  segment,
  reduced,
  legendWinner,
  legendLoser,
}: {
  segment: number
  reduced: boolean
  legendWinner: string
  legendLoser: string
}) {
  const segAngle = 360 / DUEL_SEGMENTS
  const finalRotation = 360 * 5 - (segment * segAngle + segAngle / 2)
  const gradient = useMemo(() => {
    const stops = Array.from({ length: DUEL_SEGMENTS }, (_, i) => {
      const color = i % 2 === 0 ? 'rgb(var(--gold-rgb))' : 'rgb(var(--suit-red-rgb))'
      return `${color} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [segAngle])
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 drop-shadow" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <polygon points="4,4 24,4 14,22" style={{ fill: 'rgb(var(--cream-rgb))' }} />
          </svg>
        </div>
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: reduced ? finalRotation % 360 : finalRotation }}
          transition={reduced ? { duration: 0 } : { duration: 4.5, ease: [0.12, 0.68, 0.16, 1] }}
          className="relative h-40 w-40 rounded-full border-4 border-gold/60 shadow-2xl"
          style={{ backgroundImage: gradient }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold/60 bg-felt-deep text-gold">
            <Swords aria-hidden className="h-5 w-5" />
          </span>
        </motion.div>
      </div>
      <div className="flex items-center gap-4 rounded-full border border-gold/20 bg-felt-deep/90 px-3 py-1 text-xs font-semibold text-cream/80">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden /> {legendWinner}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-suit-red" aria-hidden /> {legendLoser}
        </span>
      </div>
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
          className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-gold-strong bg-gold font-display text-lg font-black text-[#24201A] shadow-2xl"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {pileLabel}
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-gold bg-gold-strong font-display text-lg font-black text-[#24201A] shadow-2xl"
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

/**
 * Le spectacle d'un tirage est-il à l'écran ? Même chronologie que
 * InteractionSpectacle (suspense puis résultat tenu), mais lue pendant le
 * rendu : le rendu qui reçoit le nouveau tirage le sait déjà, et ce qui doit
 * attendre son résultat (la bulle d'un bot qui commente la roue ou la pièce)
 * n'a pas une image d'avance. Le tirage présent au montage ne se rejoue pas.
 */
export function useSpectacleRunning(interaction: LastInteraction | null | undefined): boolean {
  const reduced = useReducedMotion() ?? false
  const key = interaction ? JSON.stringify(interaction) : null
  const [run, setRun] = useState<{ key: string | null; running: boolean }>({ key, running: false })
  let current = run
  if (key !== run.key) {
    current = { key, running: key !== null }
    setRun(current)
  }
  const runKey = current.key
  const kind = current.running && interaction ? interaction.kind : null
  useEffect(() => {
    if (!kind) return
    const timer = setTimeout(
      () => setRun((r) => (r.key === runKey ? { ...r, running: false } : r)),
      spectacleSpinMs(kind, reduced) + SPECTACLE_OUTCOME_HOLD_MS
    )
    return () => clearTimeout(timer)
  }, [runKey, kind, reduced])
  return current.running
}

export function InteractionSpectacle({
  interaction,
  caseLabel,
  actorName,
  targetName,
  labels,
  actorFromPosition,
}: {
  interaction: LastInteraction | null | undefined
  /** Libellé traduit du type de case (ex. « Roue »). */
  caseLabel: string
  actorName: string
  targetName: string
  labels: SpectacleLabels
  /** Index (0..29) de l'acteur avant l'effet du tirage — voir outcomeText. */
  actorFromPosition?: number
}) {
  const reduced = useReducedMotion() ?? false
  const [current, setCurrent] = useState<LastInteraction | null>(null)
  const [currentFrom, setCurrentFrom] = useState<number | undefined>(undefined)
  const [showOutcome, setShowOutcome] = useState(false)
  const fromRef = useRef(actorFromPosition)
  fromRef.current = actorFromPosition
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
    // Figée au début : la vue peut passer au tour suivant avant la fin du spectacle.
    setCurrentFrom(fromRef.current)
    setShowOutcome(false)
    playGameSound(inter.kind === 'de-honte' ? 'dice-roll' : 'wheel')
    const spinMs = spectacleSpinMs(inter.kind, reduced)
    const outcomeTimer = setTimeout(() => {
      setShowOutcome(true)
      playGameSound(interactionDrinks(inter) > 0 ? 'drink' : 'dice-result')
    }, spinMs)
    const hideTimer = setTimeout(() => setCurrent(null), spinMs + SPECTACLE_OUTCOME_HOLD_MS)
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
          className="pointer-events-none fixed inset-0 z-[118] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4 px-6">
            <div className="flex items-center gap-2 rounded-full border border-gold/20 bg-felt-deep/90 px-4 py-1.5">
              <span className="rounded-full border border-gold/40 bg-gold/[0.15] px-2 py-0.5 text-xs font-semibold text-gold">
                {caseLabel}
              </span>
              <span className="max-w-[11rem] truncate text-sm font-semibold text-cream">{actorName}</span>
            </div>

            {(current.kind === 'roue' || current.kind === 'roue-defis') && (
              <SpinningWheel
                key={lastSeenRef.current}
                segment={current.kind === 'roue' ? current.segment : current.drinks > 0 ? 1 : 2}
                reduced={reduced}
                legendSafe={labels.wheelLegendSafe}
                legendDrink={labels.wheelLegendDrink}
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
            {current.kind === 'duel' && (
              <>
                <p className="max-w-[18rem] truncate text-center text-sm font-semibold text-cream">
                  {actorName} <span aria-hidden>⚔️</span> {targetName}
                </p>
                <DuelWheel
                  key={lastSeenRef.current}
                  segment={duelSegment(current)}
                  reduced={reduced}
                  legendWinner={labels.duelWinner ?? ''}
                  legendLoser={labels.duelLoser ?? ''}
                />
              </>
            )}

            <AnimatePresence>
              {showOutcome && (
                <motion.p
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 18 }}
                  className={cn(
                    'rounded-2xl border px-5 py-2.5 text-center font-display text-lg font-bold shadow-xl',
                    interactionDrinks(current) > 0
                      ? 'border-suit-red/60 bg-suit-red/90 text-cream'
                      : 'border-emerald-400/40 bg-emerald-700/70 text-emerald-50'
                  )}
                >
                  {outcomeText(current, labels, targetName, currentFrom, actorName)}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
