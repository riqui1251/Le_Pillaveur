"use client"

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { LastInteraction } from '@/lib/petit-buveur/engine'
import { duelSegment, interactionDrinks, outcomeText, type SpectacleLabels } from '@/components/petit-buveur/InteractionSpectacle'
import { drinkIcon } from '@/components/petit-buveur/drink-feedback'
import type { TvPbPlayer } from './model'
import type { PbTexts } from './online-view'
import { TvPbBlankDie, TvPbDie, TvPbPawn } from './TvPbScreen'

/**
 * Superpositions plein écran de l'écran TV : le dé du joueur qui lance et le
 * spectacle des tirages. Mêmes étapes que sur les téléphones, en grand, sans
 * son ni flou d'arrière-plan (processeurs de télé). Sous
 * prefers-reduced-motion, la durée ne change pas (les téléphones gardent la
 * leur) : seules les animations tombent, et le tirage reste caché jusqu'au
 * résultat.
 */

export function TvPbDiceOverlay({
  phase,
  value,
  player,
  texts,
}: {
  phase: 'rolling' | 'result' | null
  value: number
  player: TvPbPlayer | null
  texts: PbTexts
}) {
  const reduced = useReducedMotion()
  const [spinFace, setSpinFace] = useState(1)
  const rolling = phase === 'rolling'
  useEffect(() => {
    if (!rolling || reduced) return
    const timer = setInterval(() => setSpinFace((f) => 1 + ((f + 1 + Math.floor(Math.random() * 4)) % 6)), 85)
    return () => clearInterval(timer)
  }, [rolling, reduced])

  return (
    <AnimatePresence>
      {phase && (
        <motion.div
          key="tv-pb-dice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.15 }}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/70"
        >
          <div className="flex flex-col items-center gap-6">
            {player && (
              <div className="flex max-w-[50rem] items-center gap-4 rounded-full border border-gold/30 bg-felt-deep/90 py-2 pl-2 pr-8">
                <TvPbPawn player={player} size={3.5} active />
                <span className="truncate text-4xl font-black text-cream">{player.name}</span>
              </div>
            )}
            {phase === 'rolling' ? (
              reduced ? (
                <TvPbBlankDie sizeRem={12} />
              ) : (
                <motion.div
                  animate={{ rotate: [0, -14, 10, -8, 12, 0], y: ['0rem', '-0.75rem', '0rem', '-0.4rem', '0rem'] }}
                  transition={{ duration: 0.55, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <TvPbDie value={spinFace} sizeRem={12} />
                </motion.div>
              )
            ) : (
              <motion.div
                key="result"
                initial={reduced ? { scale: 1 } : { scale: 1.35, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
              >
                <TvPbDie value={value} accent sizeRem={12} />
              </motion.div>
            )}
            <p className="text-4xl font-black text-gold">
              {phase !== 'result' ? '\u00a0' : player ? texts.t('diceOverlay.result', { name: player.name, value }) : value}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const WHEEL_SEGMENTS = 15
const isSafeSegment = (i: number) => (i + 1) % 3 === 0

function TvWheel({
  segment,
  reduced,
  showOutcome,
  soft,
  labels,
}: {
  segment: number
  reduced: boolean
  showOutcome: boolean
  soft: boolean
  labels: SpectacleLabels
}) {
  const segAngle = 360 / WHEEL_SEGMENTS
  const finalRotation = 360 * 5 - (segment * segAngle + segAngle / 2)
  // Sans animation, la roue ne doit pas se poser sur son segment avant la fin du suspense : flèche entre deux segments.
  const stillRotation = showOutcome ? finalRotation % 360 : 0
  const gradient = useMemo(() => {
    const stops = Array.from({ length: WHEEL_SEGMENTS }, (_, i) => {
      const color = isSafeSegment(i) ? '#059669' : i % 2 === 0 ? 'rgb(var(--suit-red-rgb))' : 'rgb(var(--suit-red-rgb) / 0.8)'
      return `${color} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [segAngle])
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div aria-hidden className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 text-5xl leading-none">
          🔻
        </div>
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: reduced ? stillRotation : finalRotation }}
          transition={reduced ? { duration: 0 } : { duration: 4.5, ease: [0.12, 0.68, 0.16, 1] }}
          className="relative h-[22rem] w-[22rem] rounded-full border-[0.25rem] border-gold/60 shadow-2xl"
          style={{ backgroundImage: gradient, backgroundColor: 'rgb(var(--cream-rgb))' }}
        >
          {Array.from({ length: WHEEL_SEGMENTS }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute left-1/2 top-1/2 text-3xl font-black leading-none text-cream"
              style={{ transform: `translate(-50%, -50%) rotate(${(i + 0.5) * segAngle}deg) translateY(-8.5rem)` }}
            >
              {isSafeSegment(i) ? '✓' : drinkIcon(soft ? 'soft' : 'alcool')}
            </span>
          ))}
          <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold/60 bg-felt-deep" />
        </motion.div>
      </div>
      <div className="flex items-center gap-8 rounded-full border border-gold/30 bg-felt-deep/90 px-6 py-1.5 text-xl font-bold text-cream/90">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-5 w-5 rounded-full bg-emerald-600" /> {labels.wheelLegendSafe}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-5 w-5 rounded-full bg-suit-red" /> {labels.wheelLegendDrink}
        </span>
      </div>
    </div>
  )
}

const DUEL_SEGMENTS = 12

/** Roue du duel en grand : secteurs pairs « gagnant » (or) pour le challenger, impairs « perdant » (rouge). */
function TvDuelWheel({
  segment,
  reduced,
  showOutcome,
  labels,
}: {
  segment: number
  reduced: boolean
  showOutcome: boolean
  labels: SpectacleLabels
}) {
  const segAngle = 360 / DUEL_SEGMENTS
  const finalRotation = 360 * 5 - (segment * segAngle + segAngle / 2)
  const stillRotation = showOutcome ? finalRotation % 360 : 0
  const gradient = useMemo(() => {
    const stops = Array.from({ length: DUEL_SEGMENTS }, (_, i) => {
      const color = i % 2 === 0 ? 'rgb(var(--gold-rgb))' : 'rgb(var(--suit-red-rgb))'
      return `${color} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [segAngle])
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div aria-hidden className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 text-5xl leading-none">
          🔻
        </div>
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: reduced ? stillRotation : finalRotation }}
          transition={reduced ? { duration: 0 } : { duration: 4.5, ease: [0.12, 0.68, 0.16, 1] }}
          className="relative h-[22rem] w-[22rem] rounded-full border-[0.25rem] border-gold/60 shadow-2xl"
          style={{ backgroundImage: gradient }}
        >
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold/60 bg-felt-deep text-4xl"
          >
            ⚔️
          </span>
        </motion.div>
      </div>
      <div className="flex items-center gap-8 rounded-full border border-gold/30 bg-felt-deep/90 px-6 py-1.5 text-xl font-bold text-cream/90">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-5 w-5 rounded-full bg-gold" /> {labels.duelWinner}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-5 w-5 rounded-full bg-suit-red" /> {labels.duelLoser}
        </span>
      </div>
    </div>
  )
}

function TvCoin({
  flip,
  labels,
  reduced,
  showOutcome,
}: {
  flip: 'pile' | 'face'
  labels: SpectacleLabels
  reduced: boolean
  showOutcome: boolean
}) {
  const finalRotation = 7 * 180 + (flip === 'face' ? 180 : 0)
  if (reduced && !showOutcome) {
    return (
      <div className="flex h-56 w-56 items-center justify-center rounded-full border-[0.25rem] border-gold-strong bg-gold font-display text-7xl font-black text-[#24201A] shadow-2xl">
        ?
      </div>
    )
  }
  return (
    <div style={{ perspective: '40rem' }}>
      <motion.div
        initial={{ rotateX: 0 }}
        animate={{ rotateX: reduced ? finalRotation % 360 : finalRotation }}
        transition={reduced ? { duration: 0 } : { duration: 1.8, ease: [0.2, 0.7, 0.3, 1] }}
        className="relative h-56 w-56"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full border-[0.25rem] border-gold-strong bg-gold font-display text-5xl font-black text-[#24201A] shadow-2xl"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {labels.pile}
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full border-[0.25rem] border-gold bg-gold-strong font-display text-5xl font-black text-[#24201A] shadow-2xl"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
        >
          {labels.face}
        </div>
      </motion.div>
    </div>
  )
}

function TvShameDie({ value, settled, reduced }: { value: number; settled: boolean; reduced: boolean }) {
  const [face, setFace] = useState(1)
  useEffect(() => {
    if (settled || reduced) return
    const spin = setInterval(() => setFace((f) => 1 + ((f + 2) % 6)), 90)
    return () => clearInterval(spin)
  }, [settled, reduced])
  if (reduced) return settled ? <TvPbDie value={value} accent sizeRem={12} /> : <TvPbBlankDie sizeRem={12} />
  return (
    <motion.div
      animate={settled ? { scale: 1 } : { rotate: [0, -10, 8, 0] }}
      transition={settled ? { type: 'spring', stiffness: 300, damping: 15 } : { duration: 0.5, repeat: Infinity }}
    >
      <TvPbDie value={settled ? value : face} accent={settled} sizeRem={12} />
    </motion.div>
  )
}

export function TvPbSpectacle({
  interaction,
  showOutcome,
  actorFrom,
  players,
  texts,
}: {
  interaction: LastInteraction | null
  showOutcome: boolean
  actorFrom: number | undefined
  players: TvPbPlayer[]
  texts: PbTexts
}) {
  const reduced = useReducedMotion() ?? false
  const labels: SpectacleLabels = {
    wheelSafe: texts.t('online.spectacle.wheelSafe'),
    wheelDrinks: texts.t.raw('online.spectacle.wheelDrinks') as string,
    wheelLegendSafe: texts.t('online.spectacle.wheelLegendSafe'),
    wheelLegendDrink: texts.t('online.spectacle.wheelLegendDrink'),
    pfWin: texts.t('online.spectacle.pfWin'),
    pfLose: texts.t.raw('online.spectacle.pfLose') as string,
    pile: texts.t('online.spectacle.pile'),
    face: texts.t('online.spectacle.face'),
    deHonteSafe: texts.t('online.spectacle.deHonteSafe'),
    deHonteDrink: texts.t('online.spectacle.deHonteDrink'),
    deHonteForward: texts.t('online.spectacle.deHonteForward'),
    deHonteBack: texts.t('online.spectacle.deHonteBack'),
    deHonteCannotBack: texts.t('online.spectacle.deHonteCannotBack'),
    duelWinnerStays: texts.t.raw('game.duel.winnerStays') as string,
    duelOpponentWins: texts.t.raw('game.duel.opponentWins') as string,
    duelLoserProtected: texts.t.raw('game.duel.loserProtected') as string,
    duelWinner: texts.t('wheel.winner'),
    duelLoser: texts.t('wheel.loser'),
  }
  const actor = interaction ? players.find((p) => p.id === interaction.actorId) ?? null : null
  const targetName =
    interaction?.kind === 'pile-face'
      ? players.find((p) => p.id === interaction.targetId)?.name ?? ''
      : interaction?.kind === 'duel'
        ? players.find((p) => p.id === interaction.opponentId)?.name ?? ''
        : ''

  return (
    <AnimatePresence>
      {interaction && (
        <motion.div
          key="tv-pb-spectacle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/75"
        >
          <div className="flex flex-col items-center gap-6 px-8">
            <div className="flex max-w-[56rem] items-center gap-4 rounded-full border border-gold/30 bg-felt-deep/90 py-2 pl-3 pr-8">
              <span className="shrink-0 rounded-full border border-gold/40 bg-gold/[0.15] px-4 py-1 text-2xl font-bold text-gold">
                {interaction.kind === 'duel' ? texts.t('game.duel.title') : texts.t(`caseTypes.${interaction.kind}`)}
              </span>
              {actor && <TvPbPawn player={actor} size={3} />}
              <span className="truncate text-4xl font-black text-cream">{actor?.name ?? ''}</span>
            </div>
            {(interaction.kind === 'roue' || interaction.kind === 'roue-defis') && (
              <TvWheel
                segment={interaction.kind === 'roue' ? interaction.segment : interaction.drinks > 0 ? 1 : 2}
                reduced={reduced}
                showOutcome={showOutcome}
                soft={texts.soft}
                labels={labels}
              />
            )}
            {interaction.kind === 'pile-face' && (
              <TvCoin flip={interaction.flip} labels={labels} reduced={reduced} showOutcome={showOutcome} />
            )}
            {interaction.kind === 'de-honte' && (
              <TvShameDie value={interaction.value} settled={showOutcome} reduced={reduced} />
            )}
            {interaction.kind === 'duel' && (
              <TvDuelWheel segment={duelSegment(interaction)} reduced={reduced} showOutcome={showOutcome} labels={labels} />
            )}
            <p
              className={cn(
                'rounded-3xl border-2 px-8 py-3 text-center font-display text-5xl font-bold shadow-xl',
                interactionDrinks(interaction) > 0
                  ? 'border-suit-red/60 bg-suit-red/90 text-cream'
                  : 'border-emerald-400/40 bg-emerald-700/70 text-emerald-50',
                !showOutcome && 'invisible'
              )}
            >
              {showOutcome ? outcomeText(interaction, labels, targetName, actorFrom, actor?.name ?? '') : '\u00a0'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
