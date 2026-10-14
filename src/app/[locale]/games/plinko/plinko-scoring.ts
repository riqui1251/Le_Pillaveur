import type { SpecialPinType } from '@/lib/plinko-pins'

export type BallColor = 'red' | 'green'

export const JACKPOT_VALUE = 7

/** Effets d'une balle qui comptent dans son résultat (sous-ensemble de BallAnimationData.effects). */
export interface ScoringEffects {
  multiplierCount: number
  sipsToAdd: number
  sipsToSubtract: number
  effectsReset: boolean
  jackpotHit: boolean
  scoreSwap?: boolean
}

export interface ScoredBall {
  color: BallColor
  effects: { scoreSwap?: boolean }
  finalSipResult?: number
}

export function emptyScoringEffects(): ScoringEffects {
  return { multiplierCount: 0, sipsToAdd: 0, sipsToSubtract: 0, effectsReset: false, jackpotHit: false }
}

export function calculateFinalSips(baseSips: number, effects: ScoringEffects, isCumulativeMode: boolean): number {
  if (effects.effectsReset) return Math.round(baseSips)
  if (effects.jackpotHit) return JACKPOT_VALUE

  let finalSips = baseSips
  if (effects.multiplierCount > 0) {
    finalSips *= isCumulativeMode ? Math.pow(2, effects.multiplierCount) : 2
  }
  finalSips += effects.sipsToAdd
  finalSips = Math.max(0, finalSips - effects.sipsToSubtract)
  return Math.round(finalSips)
}

/** Catégorie créditée à l'arrivée : la couleur courante, inversée par scoreSwap pour une balle principale seulement. */
export function ballCategory(ball: { color: BallColor; effects: { scoreSwap?: boolean } }, isMain: boolean): BallColor {
  if (isMain && ball.effects.scoreSwap) return ball.color === 'red' ? 'green' : 'red'
  return ball.color
}

export function previewSlotValues(slotSipValues: number[], effects: ScoringEffects, isCumulativeMode: boolean): number[] {
  return slotSipValues.map((base) => calculateFinalSips(base, effects, isCumulativeMode))
}

/** Totaux « boit » / « donne » d'un tour, tels que handleTurnEnd les attribue. */
export function tallyTurn(
  red: ScoredBall | null,
  green: ScoredBall | null,
  extras: ScoredBall[],
): { redSips: number; greenSips: number } {
  const totals = { red: 0, green: 0 }
  for (const ball of [red, green]) {
    if (ball) totals[ballCategory(ball, true)] += ball.finalSipResult ?? 0
  }
  for (const ball of extras) {
    totals[ballCategory(ball, false)] += ball.finalSipResult ?? 0
  }
  return { redSips: totals.red, greenSips: totals.green }
}

export const SCORE_EFFECT_TYPES = [
  'multiplier', 'addSip', 'subtractSip', 'cancellation', 'colorSwap', 'jackpot', 'scoreSwap',
] as const satisfies readonly SpecialPinType[]

export type ScoreEffectType = (typeof SCORE_EFFECT_TYPES)[number]

export function isScoreEffectType(type: SpecialPinType): type is ScoreEffectType {
  return (SCORE_EFFECT_TYPES as readonly SpecialPinType[]).includes(type)
}

/** Applique (en mutant la balle) un pion qui touche au résultat ; les autres pions restent gérés par la boucle d'animation. */
export function applyScoreEffect(ball: { color: BallColor; effects: ScoringEffects }, type: ScoreEffectType): void {
  switch (type) {
    case 'multiplier': ball.effects.multiplierCount++; break
    case 'addSip': ball.effects.sipsToAdd++; break
    case 'subtractSip': ball.effects.sipsToSubtract++; break
    case 'cancellation': ball.effects.effectsReset = true; break
    case 'colorSwap': {
      ball.color = ball.color === 'red' ? 'green' : 'red'
      const add = ball.effects.sipsToAdd
      ball.effects.sipsToAdd = ball.effects.sipsToSubtract
      ball.effects.sipsToSubtract = add
      break
    }
    case 'jackpot': ball.effects.jackpotHit = true; break
    case 'scoreSwap': ball.effects.scoreSwap = true; break
  }
}
