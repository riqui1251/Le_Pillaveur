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
import { BOARD_SIZE, type CaseType, type EngineCase } from './types'

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

describe('cases interactives', () => {
  const withPending = (caseType: CaseType, lastCase: EngineCase, needsTgt = false): EngineState => ({
    ...createInitialState(PLAYERS, SETTINGS, 'inter'),
    phase: 'awaiting-interaction',
    pending: { caseType, playerId: 'p1', needsTarget: needsTgt },
    lastCase,
  })

  it('de-honte : résolution déterministe + effet valide', () => {
    const s = withPending('de-honte', { type: 'de-honte', effect: 0 })
    const a = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1' })
    const b = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1' })
    expect(a).toEqual(b)
    expect(a.phase).toBe('playing')
    expect(a.pending).toBeNull()
    const p1 = a.players.find((p) => p.id === 'p1')!
    expect([0, 2]).toContain(p1.drinks)
    expect(p1.position).toBeGreaterThanOrEqual(0)
    expect(p1.position).toBeLessThanOrEqual(BOARD_SIZE - 1)
  })

  it('pile-face : seule la cible peut boire, déterministe', () => {
    const s = withPending('pile-face', { type: 'pile-face', effect: 2 })
    const choice = { targetId: 'p2', side: 'pile' as const }
    const a = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice })
    const b = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice })
    expect(a).toEqual(b)
    expect(a.players.find((p) => p.id === 'p3')!.drinks).toBe(0)
    expect([0, 2]).toContain(a.players.find((p) => p.id === 'p2')!.drinks)
  })

  it('refuse une résolution par un autre joueur', () => {
    const s = withPending('de-honte', { type: 'de-honte', effect: 0 })
    expect(() => reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p2' })).toThrow(EngineError)
  })

  it('case à cible : gorgée fait boire la cible choisie', () => {
    const s = withPending('gorgée', { type: 'gorgée', effect: 3 }, true)
    const next = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice: { targetId: 'p2' } })
    expect(next.players.find((p) => p.id === 'p2')!.drinks).toBe(3)
    expect(next.players.find((p) => p.id === 'p1')!.drinks).toBe(0)
    expect(next.phase).toBe('playing')
  })

  it('case à cible : bombe touche tout le monde, double sur la cible', () => {
    const s = withPending('bombe', { type: 'bombe', effect: 2 }, true)
    const next = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice: { targetId: 'p2' } })
    expect(next.players.find((p) => p.id === 'p2')!.drinks).toBe(4)
    expect(next.players.find((p) => p.id === 'p1')!.drinks).toBe(2)
    expect(next.players.find((p) => p.id === 'p3')!.drinks).toBe(2)
  })

  it('case à cible : avance peut faire gagner la cible', () => {
    const base = withPending('avance', { type: 'avance', effect: 1 }, true)
    base.players[1].position = BOARD_SIZE - 2 // p2 à une case de la fin
    const next = reduce(base, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice: { targetId: 'p2' } })
    expect(next.phase).toBe('finished')
    expect(next.winner).toBe('p2')
  })

  it('roue : l’acteur boit entre 0 et 12 (déterministe)', () => {
    const s = withPending('roue', { type: 'roue', effect: 0 })
    const a = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1' })
    const b = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1' })
    expect(a).toEqual(b)
    const d = a.players.find((p) => p.id === 'p1')!.drinks
    expect(d).toBeGreaterThanOrEqual(0)
    expect(d).toBeLessThanOrEqual(12)
  })

  it('chance : l’acteur avance de 2', () => {
    const s = withPending('chance', { type: 'chance', effect: 0 })
    s.players[0].position = 5
    const next = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1' })
    expect(next.players.find((p) => p.id === 'p1')!.position).toBe(7)
  })

  it('teleport : échange de position avec le leader', () => {
    const s = withPending('teleport', { type: 'teleport', effect: 0 })
    s.players[0].position = 2
    s.players[1].position = 20
    s.players[2].position = 10
    const next = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice: { option: 'leader' } })
    expect(next.players.find((p) => p.id === 'p1')!.position).toBe(20)
    expect(next.players.find((p) => p.id === 'p2')!.position).toBe(2)
  })

  it('vote : la cible désignée boit', () => {
    const s = withPending('vote', { type: 'vote', effect: 3 })
    const next = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice: { targetId: 'p3' } })
    expect(next.players.find((p) => p.id === 'p3')!.drinks).toBe(3)
  })

  it('echange : positions échangées avec la cible', () => {
    const s = withPending('echange', { type: 'echange', effect: 0 })
    s.players[0].position = 3
    s.players[1].position = 15
    const next = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'p1', choice: { targetId: 'p2' } })
    expect(next.players.find((p) => p.id === 'p1')!.position).toBe(15)
    expect(next.players.find((p) => p.id === 'p2')!.position).toBe(3)
  })
})
