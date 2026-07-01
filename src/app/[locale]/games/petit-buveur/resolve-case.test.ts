import { describe, expect, it } from 'vitest'
import { resolveNoTargetCase } from './resolve-case'
import type { Case } from './case-config'
import type { GamePlayer } from './case-types'

const t = ((key: string) => key) as unknown as {
  (key: string, values?: Record<string, string | number>): string
  raw: (key: string) => unknown
}
t.raw = () => []

function makePlayer(id: string, name: string, position = 0): GamePlayer {
  return {
    id,
    name,
    preferences: { color: 'bg-red-500' },
    position,
    drinks: 0,
    protected: false,
    cursed: 0,
    linkedTurns: 0,
  }
}

describe('resolveNoTargetCase', () => {
  it('applique solo une seule fois', () => {
    const players = [makePlayer('p1', 'A')]
    const c: Case = { type: 'solo', effect: 1 }
    const result = resolveNoTargetCase(c, players, { boardSize: 30, actorIndex: 0, lastMoveDelta: 0, lastCase: null }, t, (p) => p.name)
    expect(result.players[0].drinks).toBe(1)
  })

  it('borne les positions pour case bonus', () => {
    const players = [makePlayer('p1', 'A', 29)]
    const c: Case = { type: 'case-bonus', effect: 3 }
    const result = resolveNoTargetCase(c, players, { boardSize: 30, actorIndex: 0, lastMoveDelta: 0, lastCase: null }, t, (p) => p.name)
    expect(result.players[0].position).toBe(29)
  })

  it('solo respecte la protection (aucune gorgée si l’acteur est protégé)', () => {
    const actor = { ...makePlayer('p1', 'A'), protected: true, protectionTurnsLeft: 2 }
    const c: Case = { type: 'solo', effect: 3 }
    const result = resolveNoTargetCase(c, [actor], { boardSize: 30, actorIndex: 0, lastMoveDelta: 0, lastCase: null }, t, (p) => p.name)
    expect(result.players[0].drinks).toBe(0)
  })

  it('loterie respecte la protection du joueur tiré au sort pour boire', () => {
    const actor = makePlayer('p1', 'A')
    // Les deux cibles potentielles sont protégées : quel que soit le tirage, personne ne boit.
    const p2 = { ...makePlayer('p2', 'B'), protected: true, protectionTurnsLeft: 2 }
    const p3 = { ...makePlayer('p3', 'C'), protected: true, protectionTurnsLeft: 2 }
    const c: Case = { type: 'loterie', effect: 0 }
    const result = resolveNoTargetCase(c, [actor, p2, p3], { boardSize: 30, actorIndex: 0, lastMoveDelta: 0, lastCase: null }, t, (p) => p.name)
    expect(result.players.find((p) => p.id === 'p2')!.drinks).toBe(0)
    expect(result.players.find((p) => p.id === 'p3')!.drinks).toBe(0)
  })
})
