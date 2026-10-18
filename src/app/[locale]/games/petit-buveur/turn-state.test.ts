import { describe, expect, it } from 'vitest'
import {
  applyDiceRoll,
  clampBoardPosition,
  clonePlayers,
  detectWinner,
  hopDurationMs,
} from './turn-state'
import { resolveNoTargetCase } from './resolve-case'
import type { Case } from './case-config'
import type { GamePlayer } from './case-types'

const BOARD = 30

const t = ((key: string) => key) as unknown as {
  (key: string, values?: Record<string, string | number>): string
  raw: (key: string) => unknown
}
t.raw = () => []

function mk(id: string, position: number, extra: Partial<GamePlayer> = {}): GamePlayer {
  return {
    id,
    name: id,
    preferences: { color: 'bg-red-500' },
    position,
    drinks: 0,
    protected: false,
    cursed: 0,
    linkedTurns: 0,
    ...extra,
  }
}

const ctx = (actorIndex: number) => ({ boardSize: BOARD, actorIndex, lastMoveDelta: 0, lastCase: null })

describe('clonePlayers', () => {
  it("rend des objets neufs : modifier la copie ne touche pas l'état d'origine", () => {
    const state = [mk('A', 3), mk('B', 5)]
    const copy = clonePlayers(state)
    copy[0].position = 9
    copy[1].drinks = 4
    expect(state[0].position).toBe(3)
    expect(state[1].drinks).toBe(0)
    expect(copy).not.toBe(state)
    expect(copy[0]).not.toBe(state[0])
  })
})

describe('clampBoardPosition', () => {
  it('borne entre 0 et la dernière case', () => {
    expect(clampBoardPosition(-2, BOARD)).toBe(0)
    expect(clampBoardPosition(31, BOARD)).toBe(29)
    expect(clampBoardPosition(12, BOARD)).toBe(12)
  })
})

describe('applyDiceRoll', () => {
  it('déplace le lanceur sans muter la liste reçue', () => {
    const before = [mk('A', 5), mk('B', 8)]
    const r = applyDiceRoll(before, 0, 4, BOARD)
    expect(r.players[0].position).toBe(9)
    expect(r.moveDelta).toBe(4)
    expect(r.from).toBe(5)
    expect(r.to).toBe(9)
    expect(before[0].position).toBe(5)
  })

  it('un joueur ancré ne bouge pas, perd son ancre et compte 0 pour la copie', () => {
    const r = applyDiceRoll([mk('A', 7, { anchored: true })], 0, 5, BOARD)
    expect(r.players[0].position).toBe(7)
    expect(r.players[0].anchored).toBe(false)
    expect(r.moveDelta).toBe(0)
  })

  it('borne à la case d’arrivée', () => {
    expect(applyDiceRoll([mk('A', 27)], 0, 6, BOARD).to).toBe(29)
  })

  it('relance Chance : le total du tour cumule les deux dés (règle 6, constat 51)', () => {
    const first = applyDiceRoll([mk('A', 2), mk('B', 0)], 0, 4, BOARD)
    const second = applyDiceRoll(first.players, 0, 3, BOARD)
    const turnTotal = first.moveDelta + second.moveDelta
    expect(second.players[0].position).toBe(9)
    expect(turnTotal).toBe(7)
  })
})

describe('detectWinner (règle 1)', () => {
  it('personne sur la dernière case : aucun vainqueur', () => {
    expect(detectWinner([mk('A', 28), mk('B', 10)], 0, BOARD)).toBeNull()
  })

  it("un non-acteur posé sur l'arrivée gagne aussitôt (copie, constat 8)", () => {
    expect(detectWinner([mk('A', 10), mk('B', 29), mk('C', 3)], 0, BOARD)?.id).toBe('B')
  })

  it("plusieurs à l'arrivée : l'acteur gagne s'il y est", () => {
    expect(detectWinner([mk('A', 29), mk('B', 29), mk('C', 29)], 1, BOARD)?.id).toBe('B')
  })

  it("plusieurs à l'arrivée sans l'acteur : premier dans l'ordre de jeu après lui", () => {
    const players = [mk('A', 29), mk('B', 4), mk('C', 29), mk('D', 1)]
    expect(detectWinner(players, 1, BOARD)?.id).toBe('C')
    expect(detectWinner(players, 3, BOARD)?.id).toBe('A')
  })
})

describe('hopDurationMs', () => {
  it("attend l'arrivée du pion le plus déplacé", () => {
    expect(hopDurationMs([mk('A', 5), mk('B', 8)], [mk('A', 9), mk('B', 7)])).toBe(4 * 120 + 250)
    expect(hopDurationMs([mk('A', 5)], [mk('A', 5)])).toBe(250)
  })
})

describe('case sans cible résolue sur la liste APRÈS le lancer (constat 6)', () => {
  const afterRoll = () => applyDiceRoll([mk('A', 5), mk('B', 8), mk('C', 12), mk('D', 3)], 0, 4, BOARD).players

  it('case bonus : avance depuis la case atteinte au dé', () => {
    const r = resolveNoTargetCase({ type: 'case-bonus', effect: 1 }, afterRoll(), ctx(0), t, p => p.name)
    expect(r.players[0].position).toBe(10)
    expect(r.outcome).toMatchObject({ htmlParams: { from: '10', to: '11' } })
  })

  it('grappin : rejoint le joueur devant la case atteinte', () => {
    const r = resolveNoTargetCase({ type: 'grappin', effect: 0 }, afterRoll(), ctx(0), t, p => p.name)
    expect(r.players[0].position).toBe(12)
  })

  it('recul groupé : recule ceux derrière la case atteinte', () => {
    const r = resolveNoTargetCase({ type: 'recul-groupe', effect: -1 }, afterRoll(), ctx(0), t, p => p.name)
    expect(r.players.map(p => p.position)).toEqual([9, 7, 12, 2])
  })
})

describe('arrivée sur la dernière case par une case sans cible (constat 8)', () => {
  it('case bonus depuis 28 : le lanceur gagne', () => {
    const r = resolveNoTargetCase({ type: 'case-bonus', effect: 1 }, [mk('A', 28), mk('B', 10)], ctx(0), t, p => p.name)
    expect(detectWinner(r.players, 0, BOARD)?.id).toBe('A')
  })

  it("pont côté pile avec deux joueurs sur 28 : l'acteur gagne", () => {
    const random = Math.random
    Math.random = () => 0.1
    try {
      const r = resolveNoTargetCase({ type: 'pont', effect: 0 } as Case, [mk('A', 28), mk('B', 28), mk('C', 3)], ctx(0), t, p => p.name)
      expect(r.players.filter(p => p.position === 29).map(p => p.id)).toEqual(['A', 'B'])
      expect(detectWinner(r.players, 0, BOARD)?.id).toBe('A')
    } finally {
      Math.random = random
    }
  })
})
