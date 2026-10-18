import { describe, expect, it } from 'vitest'
import {
  ballsInCategory,
  createLiveBalls,
  modifierSummary,
  withHit,
  withLanding,
  withSpawn,
} from './plinko-live'
import { JACKPOT_VALUE, applyScoreEffect, emptyScoringEffects, type BallColor } from './plinko-scoring'

function source(id: string, color: BallColor) {
  return { id, color, effects: emptyScoringEffects() }
}

describe('withHit', () => {
  it('ajoute les pions touchés dans l’ordre et copie les effets', () => {
    const red = source('red', 'red')
    applyScoreEffect(red, 'multiplier')
    let live = withHit(createLiveBalls(), red, { type: 'multiplier', doubled: false })
    applyScoreEffect(red, 'addSip')
    live = withHit(live, red, { type: 'addSip', doubled: false })

    expect(live.red.hits.map((h) => h.type)).toEqual(['multiplier', 'addSip'])
    expect(live.red.effects).toMatchObject({ multiplierCount: 1, sipsToAdd: 1 })
    red.effects.sipsToAdd = 99
    expect(live.red.effects.sipsToAdd).toBe(1)
    expect(live.green.hits).toEqual([])
  })

  it('la catégorie suit colorSwap et scoreSwap : les puces changent de ligne', () => {
    const red = source('red', 'red')
    applyScoreEffect(red, 'colorSwap')
    const live = withHit(createLiveBalls(), red, { type: 'colorSwap', doubled: false })
    expect(live.red.category).toBe('green')
    expect(ballsInCategory(live, 'green').map((b) => b.id)).toEqual(['red', 'green'])
    expect(ballsInCategory(live, 'red')).toEqual([])
  })

  it('regroupe les balles supplémentaires par catégorie, sans scoreSwap', () => {
    const extra = source('extra-1', 'green')
    applyScoreEffect(extra, 'scoreSwap')
    let live = withHit(createLiveBalls(), extra, { type: 'scoreSwap', doubled: false })
    live = withHit(live, extra, { type: 'addSip', doubled: false })
    expect(live.extras).toHaveLength(1)
    expect(live.extras[0]).toMatchObject({ isMain: false, category: 'green' })
    expect(live.extras[0].hits).toHaveLength(2)
    expect(ballsInCategory(live, 'green').map((b) => b.id)).toEqual(['green', 'extra-1'])
  })

  it('garde l’effet tiré par mystery', () => {
    const live = withHit(createLiveBalls(), source('green', 'green'), { type: 'mystery', resolved: 'addBall', doubled: false })
    expect(live.green.hits[0]).toEqual({ type: 'mystery', resolved: 'addBall', doubled: false })
  })
})

describe('withSpawn', () => {
  it('inscrit une balle supplémentaire dès sa naissance, avec les effets hérités', () => {
    const child = source('extra-split-1', 'red')
    applyScoreEffect(child, 'multiplier')
    applyScoreEffect(child, 'addSip')
    const live = withSpawn(createLiveBalls(), [child])
    expect(live.extras).toHaveLength(1)
    expect(live.extras[0]).toMatchObject({ id: 'extra-split-1', isMain: false, category: 'red', hits: [], landed: false })
    expect(live.extras[0].effects).toMatchObject({ multiplierCount: 1, sipsToAdd: 1 })
    expect(ballsInCategory(live, 'red').map((b) => b.id)).toEqual(['red', 'extra-split-1'])
  })

  it('n’écrase ni une balle déjà connue ni une balle principale', () => {
    const extra = source('extra-1', 'green')
    let live = withHit(createLiveBalls(), extra, { type: 'addSip', doubled: false })
    live = withSpawn(live, [extra, source('red', 'green')])
    expect(live.extras).toHaveLength(1)
    expect(live.extras[0].hits).toHaveLength(1)
    expect(live.red.category).toBe('red')
  })
})

describe('withLanding', () => {
  it('note la case d’arrivée, le résultat compté et la valeur de la case à ce moment', () => {
    const live = withLanding(createLiveBalls(), source('green', 'green'), 4, 6, 3)
    expect(live.green).toMatchObject({ landed: true, slot: 4, finalSips: 6, landedBase: 3 })
    expect(live.red.landed).toBe(false)
  })

  it('enregistre aussi l’arrivée d’une balle supplémentaire', () => {
    const extra = source('extra-1', 'red')
    const live = withLanding(withSpawn(createLiveBalls(), [extra]), extra, 2, 5, 5)
    expect(live.extras[0]).toMatchObject({ landed: true, slot: 2, finalSips: 5, landedBase: 5 })
  })
})

describe('modifierSummary', () => {
  const fx = (p: Partial<ReturnType<typeof emptyScoringEffects>>) => ({ ...emptyScoringEffects(), ...p })

  it('liste ×, + et − dans l’ordre du calcul', () => {
    expect(modifierSummary(fx({ multiplierCount: 2, sipsToAdd: 1, sipsToSubtract: 3 }), false, true, JACKPOT_VALUE)).toEqual([
      { kind: 'multiplier', factor: 2 },
      { kind: 'add', n: 1 },
      { kind: 'subtract', n: 3 },
    ])
    expect(modifierSummary(fx({ multiplierCount: 2 }), true, true, JACKPOT_VALUE)).toEqual([{ kind: 'multiplier', factor: 4 }])
  })

  it('annulation puis jackpot masquent le reste, comme dans le calcul', () => {
    expect(modifierSummary(fx({ effectsReset: true, jackpotHit: true, sipsToAdd: 2 }), false, true, JACKPOT_VALUE)).toEqual([{ kind: 'cancelled' }])
    expect(modifierSummary(fx({ jackpotHit: true, multiplierCount: 1 }), false, true, JACKPOT_VALUE)).toEqual([{ kind: 'jackpot', value: JACKPOT_VALUE }])
  })

  it('scoreSwap signalé pour une balle principale seulement', () => {
    expect(modifierSummary(fx({ scoreSwap: true }), false, true, JACKPOT_VALUE)).toEqual([{ kind: 'swapped' }])
    expect(modifierSummary(fx({ scoreSwap: true }), false, false, JACKPOT_VALUE)).toEqual([])
  })
})
