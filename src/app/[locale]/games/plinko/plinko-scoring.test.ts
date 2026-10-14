import { describe, expect, it } from 'vitest'
import {
  JACKPOT_VALUE,
  SCORE_EFFECT_TYPES,
  applyScoreEffect,
  ballCategory,
  calculateFinalSips,
  emptyScoringEffects,
  previewSlotValues,
  tallyTurn,
  type BallColor,
  type ScoreEffectType,
  type ScoredBall,
  type ScoringEffects,
} from './plinko-scoring'

function effects(partial: Partial<ScoringEffects> = {}): ScoringEffects {
  return { ...emptyScoringEffects(), ...partial }
}

function ballAfter(color: BallColor, pins: ScoreEffectType[]) {
  const ball = { color, effects: emptyScoringEffects() }
  for (const pin of pins) applyScoreEffect(ball, pin)
  return ball
}

/** Copie de la règle d'attribution de handleTurnEnd avant extraction : sert de référence. */
function legacyTally(red: ScoredBall | null, green: ScoredBall | null, extras: ScoredBall[]) {
  const redBase = red?.finalSipResult ?? 0
  const greenBase = green?.finalSipResult ?? 0
  const redSwap = red?.effects.scoreSwap ? 1 : 0
  const greenSwap = green?.effects.scoreSwap ? 1 : 0
  let totalRedSips = 0
  let totalGreenSips = 0
  if (red) {
    if (red.color === 'red') {
      if (redSwap) totalGreenSips += redBase; else totalRedSips += redBase
    } else {
      if (redSwap) totalRedSips += redBase; else totalGreenSips += redBase
    }
  }
  if (green) {
    if (green.color === 'green') {
      if (greenSwap) totalRedSips += greenBase; else totalGreenSips += greenBase
    } else {
      if (greenSwap) totalGreenSips += greenBase; else totalRedSips += greenBase
    }
  }
  extras.forEach((b) => {
    if (b.color === 'red') totalRedSips += b.finalSipResult ?? 0
    else totalGreenSips += b.finalSipResult ?? 0
  })
  return { redSips: totalRedSips, greenSips: totalGreenSips }
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : un échec se rejoue à l'identique. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('calculateFinalSips', () => {
  it('sans effet, rend la valeur de la case', () => {
    expect(calculateFinalSips(3, effects(), false)).toBe(3)
    expect(calculateFinalSips(3, effects(), true)).toBe(3)
  })

  it('×2 une seule fois en mode simple, 2^n en mode cumulatif', () => {
    expect(calculateFinalSips(3, effects({ multiplierCount: 1 }), false)).toBe(6)
    expect(calculateFinalSips(3, effects({ multiplierCount: 3 }), false)).toBe(6)
    expect(calculateFinalSips(3, effects({ multiplierCount: 1 }), true)).toBe(6)
    expect(calculateFinalSips(3, effects({ multiplierCount: 3 }), true)).toBe(24)
  })

  it('+1 et −1 après le multiplicateur, borné à 0', () => {
    expect(calculateFinalSips(2, effects({ sipsToAdd: 2 }), false)).toBe(4)
    expect(calculateFinalSips(2, effects({ sipsToSubtract: 1 }), false)).toBe(1)
    expect(calculateFinalSips(1, effects({ sipsToSubtract: 5 }), false)).toBe(0)
    expect(calculateFinalSips(2, effects({ multiplierCount: 1, sipsToAdd: 1 }), false)).toBe(5)
    expect(calculateFinalSips(2, effects({ multiplierCount: 1, sipsToAdd: 1, sipsToSubtract: 7 }), false)).toBe(0)
  })

  it('l’annulation rend la case brute, même avec jackpot', () => {
    expect(calculateFinalSips(2, effects({ effectsReset: true, multiplierCount: 2, sipsToAdd: 3 }), true)).toBe(2)
    expect(calculateFinalSips(2, effects({ effectsReset: true, jackpotHit: true }), false)).toBe(2)
  })

  it('le jackpot vaut une valeur fixe, quels que soient les autres effets', () => {
    expect(calculateFinalSips(1, effects({ jackpotHit: true, multiplierCount: 2, sipsToSubtract: 3 }), true)).toBe(JACKPOT_VALUE)
  })
})

describe('applyScoreEffect', () => {
  it('chaque pion modifie le bon compteur', () => {
    expect(ballAfter('red', ['multiplier', 'multiplier']).effects.multiplierCount).toBe(2)
    expect(ballAfter('red', ['addSip']).effects.sipsToAdd).toBe(1)
    expect(ballAfter('red', ['subtractSip']).effects.sipsToSubtract).toBe(1)
    expect(ballAfter('red', ['cancellation']).effects.effectsReset).toBe(true)
    expect(ballAfter('red', ['jackpot']).effects.jackpotHit).toBe(true)
    expect(ballAfter('red', ['scoreSwap']).effects.scoreSwap).toBe(true)
  })

  it('colorSwap inverse la couleur et échange +1 / −1', () => {
    const ball = ballAfter('red', ['addSip', 'addSip', 'subtractSip', 'colorSwap'])
    expect(ball.color).toBe('green')
    expect(ball.effects.sipsToAdd).toBe(1)
    expect(ball.effects.sipsToSubtract).toBe(2)
    expect(ballAfter('green', ['colorSwap', 'colorSwap']).color).toBe('green')
  })
})

describe('ballCategory', () => {
  it('suit la couleur courante', () => {
    expect(ballCategory({ color: 'red', effects: {} }, true)).toBe('red')
    expect(ballCategory({ color: 'green', effects: {} }, true)).toBe('green')
  })

  it('scoreSwap inverse la catégorie d’une balle principale seulement', () => {
    expect(ballCategory({ color: 'red', effects: { scoreSwap: true } }, true)).toBe('green')
    expect(ballCategory({ color: 'green', effects: { scoreSwap: true } }, true)).toBe('red')
    expect(ballCategory({ color: 'red', effects: { scoreSwap: true } }, false)).toBe('red')
  })

  it('colorSwap puis scoreSwap ramène à la catégorie de départ', () => {
    expect(ballCategory(ballAfter('red', ['colorSwap', 'scoreSwap']), true)).toBe('red')
  })
})

describe('previewSlotValues', () => {
  it('donne la valeur finale pour chaque case', () => {
    expect(previewSlotValues([1, 2, 3], effects({ multiplierCount: 1, sipsToAdd: 1 }), false)).toEqual([3, 5, 7])
    expect(previewSlotValues([1, 2, 3], effects({ jackpotHit: true }), false)).toEqual([7, 7, 7])
    expect(previewSlotValues([1, 2, 3], effects({ sipsToSubtract: 2 }), false)).toEqual([0, 0, 1])
  })
})

describe('tallyTurn', () => {
  it('attribue chaque balle à sa catégorie finale', () => {
    const red = { color: 'red' as const, effects: {}, finalSipResult: 3 }
    const green = { color: 'green' as const, effects: { scoreSwap: true }, finalSipResult: 2 }
    const extra = { color: 'green' as const, effects: { scoreSwap: true }, finalSipResult: 4 }
    expect(tallyTurn(red, green, [extra])).toEqual({ redSips: 5, greenSips: 4 })
  })

  it('reste identique à l’ancienne règle de handleTurnEnd', () => {
    const next = rng(42)
    const color = (): BallColor => (next() < 0.5 ? 'red' : 'green')
    const ball = (): ScoredBall => ({
      color: color(),
      effects: next() < 0.3 ? { scoreSwap: true } : {},
      finalSipResult: next() < 0.1 ? undefined : Math.floor(next() * 10),
    })
    for (let i = 0; i < 500; i++) {
      const red = next() < 0.1 ? null : ball()
      const green = next() < 0.1 ? null : ball()
      const extras = Array.from({ length: Math.floor(next() * 3) }, ball)
      expect(tallyTurn(red, green, extras)).toEqual(legacyTally(red, green, extras))
    }
  })
})

describe('aperçu = résultat compté', () => {
  it('pour des suites d’effets aléatoires, la valeur prévue de la case d’arrivée est celle comptée dans la catégorie prévue', () => {
    const next = rng(7)
    for (let i = 0; i < 1000; i++) {
      const isCumulativeMode = next() < 0.5
      const slots = Array.from({ length: 10 }, () => 1 + Math.floor(next() * 4))
      const pick = () => SCORE_EFFECT_TYPES[Math.floor(next() * SCORE_EFFECT_TYPES.length)]
      const red = ballAfter('red', Array.from({ length: Math.floor(next() * 6) }, pick))
      const green = ballAfter('green', Array.from({ length: Math.floor(next() * 6) }, pick))
      const redSlot = Math.floor(next() * 10)
      const greenSlot = Math.floor(next() * 10)

      const redPreview = previewSlotValues(slots, red.effects, isCumulativeMode)[redSlot]
      const greenPreview = previewSlotValues(slots, green.effects, isCumulativeMode)[greenSlot]
      const expected = { red: 0, green: 0 }
      expected[ballCategory(red, true)] += redPreview
      expected[ballCategory(green, true)] += greenPreview

      const counted = tallyTurn(
        { ...red, finalSipResult: calculateFinalSips(slots[redSlot], red.effects, isCumulativeMode) },
        { ...green, finalSipResult: calculateFinalSips(slots[greenSlot], green.effects, isCumulativeMode) },
        [],
      )
      expect(counted).toEqual({ redSips: expected.red, greenSips: expected.green })
      expect(counted).toEqual(legacyTally(
        { ...red, finalSipResult: redPreview },
        { ...green, finalSipResult: greenPreview },
        [],
      ))
    }
  })
})
