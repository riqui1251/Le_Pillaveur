import type { EngineState } from '@/lib/petit-buveur/engine'
import type { PetitBuveurCastState } from '@/lib/cast-types'

/** Le dé reste affiché puis laisse place au reveal de case — TV muette, aucun son joué ici. */
export const DICE_HOLD_MS = 1300
export const CASE_HOLD_MS = 2600

/**
 * Ce que la TV lit du Petit Buveur : l'état du moteur en ligne OU le payload
 * diffusé par une partie locale. Les deux portent pions et tour courant ; le
 * dé et la case arrivent par des champs différents.
 */
export type TvPetitBuveurState = {
  players: { id: string; name: string; position: number; drinks: number }[]
  currentPlayer: number
} & Partial<Pick<EngineState, 'version' | 'lastDice' | 'lastCase'>> &
  Pick<PetitBuveurCastState, 'dice' | 'reveal' | 'ambiance'>

export type TvPetitBuveurCues = {
  /** Change à chaque lancer à montrer ; null = rien à montrer. */
  diceKey: string | null
  dice: number | null
  /** Change à chaque case à révéler ; null = rien à révéler. */
  caseKey: string | null
  caseType: string | null
}

function isDieValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
}

function isSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * En ligne, une seule `version` sert de déclencheur au dé puis à la case (une
 * action appliquée = tout rejouer). En local diffusé, dé et case ont chacun
 * leur `seq` : le téléphone pousse le lancer avant que le pion n'arrive.
 */
export function petitBuveurTvCues(state: TvPetitBuveurState): TvPetitBuveurCues {
  const castDice = state.dice && isDieValue(state.dice.value) && isSeq(state.dice.seq) ? state.dice : null
  const castReveal =
    state.reveal && typeof state.reveal.caseType === 'string' && state.reveal.caseType && isSeq(state.reveal.seq)
      ? state.reveal
      : null
  const version = typeof state.version === 'number' ? state.version : null

  const onlineDice = version !== null && isDieValue(state.lastDice) ? state.lastDice : null
  const onlineCase = version !== null && state.lastCase?.type ? state.lastCase.type : null

  return {
    diceKey: castDice ? `cast:${castDice.seq}` : onlineDice !== null ? `v:${version}` : null,
    dice: castDice ? castDice.value : onlineDice,
    caseKey: castReveal ? `cast:${castReveal.seq}` : onlineCase !== null ? `v:${version}` : null,
    caseType: castReveal ? castReveal.caseType : onlineCase,
  }
}

/** Délai avant la carte de case : elle attend que le dé, s'il est à l'écran, ait fini. */
export function caseRevealDelay(diceShownAt: number | null, now: number): number {
  if (diceShownAt === null) return 0
  return Math.max(0, DICE_HOLD_MS - (now - diceShownAt))
}
