"use client"

import { useEffect, useState } from 'react'
import type { LastInteraction } from '@/lib/petit-buveur/engine'
import { SPECTACLE_OUTCOME_HOLD_MS, spectacleSpinMs } from '@/components/petit-buveur/InteractionSpectacle'
import { TV_CAST_ROLLING_MAX_MS, TV_DICE_RESULT_MS, TV_DICE_ROLL_MS, TV_END_REVEAL_MS } from '../petit-buveur-cues'

type DicePhase = 'rolling' | 'result' | 'done'

export type DiceCue = { key: string; value: number; actorId: string | null }

/**
 * Mise en scène d'un lancer : le dé roule puis montre sa valeur, et tant que
 * ce n'est pas fini les pions restent figés. La clé lue au montage ne rejoue
 * rien (TV allumée en cours de partie). Ajusté pendant le rendu : le rendu
 * qui reçoit le nouvel état fige déjà les pions. Valeur et lanceur sont
 * figés au départ, l'état peut passer à la suite pendant le spectacle.
 * Aucun raccourci sous prefers-reduced-motion : le téléphone qui lance roule
 * ses 700 ms quel que soit son réglage, la TV ne doit pas le devancer.
 */
export function useDiceShow(
  cue: DiceCue | null,
  /** Faux : lancer sans dé à l'écran (bot, joueur parti), retenu comme vu pour ne pas le rejouer plus tard. */
  staged = true
): { phase: 'rolling' | 'result' | null; active: boolean; value: number; actorId: string | null } {
  const [show, setShow] = useState<{ key: string | null; phase: DicePhase; value: number; actorId: string | null }>({
    key: cue?.key ?? null,
    phase: 'done',
    value: cue?.value ?? 1,
    actorId: cue?.actorId ?? null,
  })
  let current = show
  if (cue && cue.key !== show.key) {
    current = { key: cue.key, phase: staged ? 'rolling' : 'done', value: cue.value, actorId: cue.actorId }
    setShow(current)
  }
  const { key: currentKey, phase } = current
  useEffect(() => {
    if (phase === 'done') return
    const timer = setTimeout(
      () =>
        setShow((s) =>
          s.key === currentKey && s.phase === phase ? { ...s, phase: phase === 'rolling' ? 'result' : 'done' } : s
        ),
      phase === 'rolling' ? TV_DICE_ROLL_MS : TV_DICE_RESULT_MS
    )
    return () => clearTimeout(timer)
  }, [currentKey, phase])
  return {
    phase: phase === 'done' ? null : phase,
    active: phase !== 'done',
    value: current.value,
    actorId: current.actorId,
  }
}

export type CastDiceShow = {
  key: string | null
  phase: DicePhase
  value: number
  actorId: string | null
  /** Le dé roule tant que le téléphone le fait rouler (et non sur un minuteur). */
  following: boolean
  /** Tenue du résultat : celle du téléphone qui a lancé. */
  resultMs: number
}

export type CastDiceCue = { key: string | null; value: number | null; phase: 'rolling' | 'result' | null }

/** Dé TV au montage : rien à rejouer, lanceur inconnu (le dé en cours peut être celui du joueur d'avant). */
export function castDiceInitial(cue: CastDiceCue, resultMs: number): CastDiceShow {
  return { key: cue.key, phase: 'done', value: cue.value ?? 1, actorId: null, following: false, resultMs }
}

/**
 * Ce que devient le dé TV à la réception d'un état. Le téléphone pousse
 * « roule » puis « résultat » au moment où il les affiche : la TV roule tant
 * qu'il roule, puis tient la valeur autant que lui. Un « résultat » reçu sans
 * « roule » (états fusionnés en route) se montre directement ; un ancien
 * téléphone (sans phase) garde la séquence minutée d'origine, même sous
 * prefers-reduced-motion (son dé, lui, roule).
 */
export function castDiceOnCue(
  show: CastDiceShow,
  cue: CastDiceCue,
  actorId: string | null,
  resultMs: number
): CastDiceShow {
  if (cue.key && cue.key !== show.key) {
    if (cue.phase === 'rolling') return { key: cue.key, phase: 'rolling', value: 1, actorId, following: true, resultMs }
    if (cue.value === null) return show
    const legacy = cue.phase === null
    return {
      key: cue.key,
      phase: legacy ? 'rolling' : 'result',
      value: cue.value,
      actorId,
      following: false,
      resultMs: legacy ? TV_DICE_RESULT_MS : resultMs,
    }
  }
  if (show.following && show.phase === 'rolling' && cue.key === show.key && cue.phase === 'result' && cue.value !== null) {
    return { ...show, phase: 'result', value: cue.value, following: false }
  }
  return show
}

/**
 * Étape suivante d'elle-même, après `ms` : le résultat tenu s'efface, le dé
 * minuté d'un ancien téléphone montre sa valeur, et un dé resté « en train de
 * rouler » (téléphone fermé en plein lancer) finit par lâcher l'écran.
 */
export function castDiceStep(
  show: Pick<CastDiceShow, 'phase' | 'following' | 'resultMs'>
): { ms: number; phase: DicePhase } | null {
  if (show.phase === 'done') return null
  if (show.phase === 'result') return { ms: show.resultMs, phase: 'done' }
  if (show.following) return { ms: TV_CAST_ROLLING_MAX_MS, phase: 'done' }
  return { ms: TV_DICE_ROLL_MS, phase: 'result' }
}

/** Dé d'une partie LOCALE diffusée (castDiceOnCue, castDiceStep). Les pions restent figés tant qu'il est actif. */
export function useCastDiceShow(
  cue: CastDiceCue,
  actorId: string | null,
  resultMs: number
): { phase: 'rolling' | 'result' | null; active: boolean; value: number; actorId: string | null } {
  const [show, setShow] = useState<CastDiceShow>(() => castDiceInitial(cue, resultMs))
  const current = castDiceOnCue(show, cue, actorId, resultMs)
  if (current !== show) setShow(current)
  const { key, phase, following, resultMs: holdMs } = current
  useEffect(() => {
    const step = castDiceStep({ phase, following, resultMs: holdMs })
    if (!step) return
    const timer = setTimeout(
      () =>
        setShow((s) =>
          s.key === key && s.phase === phase && s.following === following
            ? { ...s, phase: step.phase, following: false }
            : s
        ),
      step.ms
    )
    return () => clearTimeout(timer)
  }, [key, phase, following, holdMs])
  return {
    phase: phase === 'done' ? null : phase,
    active: phase !== 'done',
    value: current.value,
    actorId: current.actorId,
  }
}

/**
 * Valeur tenue tant que `hold` : l'écran garde gorgées, effets et tour d'avant
 * pendant que le dé roule et que le pion marche, pour ne pas annoncer l'effet
 * de la case avant sa carte. `key` dit quand la valeur a changé.
 */
export function useHeldWhile<T>(value: T, key: string, hold: boolean): T {
  const [held, setHeld] = useState<{ key: string; value: T }>({ key, value })
  if (!hold && held.key !== key) {
    setHeld({ key, value })
    return value
  }
  return hold ? held.value : value
}

export type SpectacleShow = {
  interaction: LastInteraction | null
  /** Case de l'acteur avant le tirage, figée au début (voir outcomeText). */
  actorFrom: number | undefined
  showOutcome: boolean
  /** Le spectacle couvre l'écran : la carte et les gorgées de son effet attendent. */
  active: boolean
}

type SpectacleStage = 'spin' | 'outcome' | 'done'

/**
 * Spectacle des tirages (roue, pièce, dé de la honte) aux délais du
 * téléphone (InteractionSpectacle) : suspense, puis résultat tenu, puis fin.
 * Délais pleins même sous prefers-reduced-motion à la TV : chaque téléphone
 * applique son propre réglage, et un téléphone qui anime encore la roue ne
 * doit pas voir la télé donner le résultat avant lui.
 */
export function useSpectacleShow(
  key: string | null,
  interaction: LastInteraction | null | undefined,
  actorFrom: number | undefined
): SpectacleShow {
  const [show, setShow] = useState<{
    key: string | null
    stage: SpectacleStage
    interaction: LastInteraction | null
    actorFrom: number | undefined
  }>({ key, stage: 'done', interaction: null, actorFrom: undefined })
  let current = show
  if (key !== null && key !== show.key && interaction) {
    current = { key, stage: 'spin', interaction, actorFrom }
    setShow(current)
  }
  const { key: currentKey, stage } = current
  const kind = current.interaction?.kind ?? null
  useEffect(() => {
    if (stage === 'done' || !kind) return
    const ms = stage === 'spin' ? spectacleSpinMs(kind, false) : SPECTACLE_OUTCOME_HOLD_MS
    const timer = setTimeout(
      () =>
        setShow((s) =>
          s.key === currentKey && s.stage === stage ? { ...s, stage: stage === 'spin' ? 'outcome' : 'done' } : s
        ),
      ms
    )
    return () => clearTimeout(timer)
  }, [currentKey, stage, kind])
  const active = stage !== 'done' && current.interaction !== null
  return {
    interaction: active ? current.interaction : null,
    actorFrom: current.actorFrom,
    showOutcome: stage === 'outcome',
    active,
  }
}

/**
 * Écran de fin dévoilé une fois le pion arrivé et posé, comme au téléphone.
 * Une TV allumée sur une partie déjà finie n'a rien à attendre.
 */
export function useEndReveal(finished: boolean, settled: boolean): boolean {
  const [revealed, setRevealed] = useState(() => finished && settled)
  if (!finished && revealed) setRevealed(false)
  useEffect(() => {
    if (!finished || !settled || revealed) return
    const timer = setTimeout(() => setRevealed(true), TV_END_REVEAL_MS)
    return () => clearTimeout(timer)
  }, [finished, settled, revealed])
  return finished && revealed
}
