import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  reduce,
  currentPlayerId,
  EngineError,
  type EngineState,
  type EngineSettings,
  type EnginePlayerInit,
} from './engine'
import { BOARD_SIZE } from './types'

const SETTINGS: EngineSettings = { difficulty: 'normal', defiDrinks: [1, 2, 1, 3, 2, 1, 2] }
const PLAYERS: EnginePlayerInit[] = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Chloé' },
]

/** Pilote une partie jusqu'à la fin de façon déterministe. */
function playToEnd(seed: string, maxSteps = 5000): { state: EngineState; steps: number } {
  let state = createInitialState(PLAYERS, SETTINGS, seed)
  let steps = 0
  while (state.phase !== 'finished' && steps < maxSteps) {
    if (state.phase === 'playing') {
      const pid = currentPlayerId(state)!
      state = reduce(state, { type: 'ROLL', playerId: pid })
    } else if (state.phase === 'awaiting-interaction') {
      state = reduce(state, { type: 'RESOLVE_INTERACTION', playerId: state.pending!.playerId })
    }
    steps += 1
  }
  return { state, steps }
}

describe('moteur Petit Buveur — cœur', () => {
  it('createInitialState : état propre', () => {
    const s = createInitialState(PLAYERS, SETTINGS, 'seed')
    expect(s.players).toHaveLength(3)
    expect(s.players.every((p) => p.position === 0 && p.drinks === 0)).toBe(true)
    expect(s.currentPlayer).toBe(0)
    expect(s.phase).toBe('playing')
    expect(s.winner).toBeNull()
  })

  it('refuse un ROLL hors-tour', () => {
    const s = createInitialState(PLAYERS, SETTINGS, 'seed')
    expect(() => reduce(s, { type: 'ROLL', playerId: 'p2' })).toThrow(EngineError)
  })

  it('un ROLL déplace le joueur courant', () => {
    const s = createInitialState(PLAYERS, SETTINGS, 'move')
    const next = reduce(s, { type: 'ROLL', playerId: 'p1' })
    expect(next.lastDice).toBeGreaterThanOrEqual(1)
    expect(next.lastDice).toBeLessThanOrEqual(6)
    expect(next.players[0].position).toBe(next.lastDice)
    expect(next.version).toBe(1)
  })

  it('RESOLVE_INTERACTION refusé hors interaction', () => {
    const s = createInitialState(PLAYERS, SETTINGS, 'seed')
    expect(() => reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1' })).toThrow(EngineError)
  })

  it('une partie complète se termine avec un gagnant', () => {
    const { state, steps } = playToEnd('partie-1')
    expect(state.phase).toBe('finished')
    expect(state.winner).not.toBeNull()
    expect(steps).toBeLessThan(5000)
    // Le gagnant est sur la dernière case
    const winner = state.players.find((p) => p.id === state.winner)!
    expect(winner.position).toBe(BOARD_SIZE - 1)
  })

  it('invariants : positions bornées, gorgées jamais négatives', () => {
    const { state } = playToEnd('partie-2')
    for (const p of state.players) {
      expect(p.position).toBeGreaterThanOrEqual(0)
      expect(p.position).toBeLessThanOrEqual(BOARD_SIZE - 1)
      expect(p.drinks).toBeGreaterThanOrEqual(0)
    }
  })

  it('déterministe : même graine ⇒ même partie', () => {
    const a = playToEnd('même-graine')
    const b = playToEnd('même-graine')
    expect(a.steps).toBe(b.steps)
    expect(a.state).toEqual(b.state)
  })

  it('graines différentes ⇒ parties différentes', () => {
    const a = playToEnd('graine-A')
    const b = playToEnd('graine-B')
    expect(a.state.winner === b.state.winner && a.steps === b.steps).toBe(false)
  })

  it('ne peut pas jouer après la fin', () => {
    const { state } = playToEnd('fin')
    expect(() => reduce(state, { type: 'ROLL', playerId: state.players[0].id })).toThrow(EngineError)
  })
})
