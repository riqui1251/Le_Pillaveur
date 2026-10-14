import { describe, expect, it } from 'vitest'
import { resolveNoTargetCase } from './resolve-case'
import type { Case } from './case-config'
import type { GamePlayer } from './case-types'

const t = ((key: string) => key) as unknown as {
  (key: string, values?: Record<string, string | number>): string
  raw: (key: string) => unknown
}
t.raw = () => []

const ctx = (actorIndex: number, rng?: () => number) => ({
  boardSize: 30,
  actorIndex,
  lastMoveDelta: 0,
  lastCase: null,
  rng,
})

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

  // Contrat règle 2 : la protection ne bloque que la case d'un AUTRE joueur.
  // L'ancien test (solo bloqué pour un acteur protégé) encodait l'écart avec le moteur en ligne.
  it('solo fait boire l’acteur même protégé (c’est sa propre case)', () => {
    const actor = { ...makePlayer('p1', 'A'), protected: true, protectionTurnsLeft: 2 }
    const c: Case = { type: 'solo', effect: 3 }
    const result = resolveNoTargetCase(c, [actor], { boardSize: 30, actorIndex: 0, lastMoveDelta: 0, lastCase: null }, t, (p) => p.name)
    expect(result.players[0].drinks).toBe(3)
    expect(result.drinks).toEqual([{ playerId: 'p1', count: 3 }])
  })

  it('normale : aucun effet, message case safe (règle 12)', () => {
    const players = [makePlayer('p1', 'A', 4), makePlayer('p2', 'B', 2)]
    const result = resolveNoTargetCase({ type: 'normal', effect: 0 }, players, ctx(0), t)
    expect(result.players.map(p => [p.position, p.drinks])).toEqual([[4, 0], [2, 0]])
    expect(result.outcome).toMatchObject({ type: 'i18n', key: 'game.outcomes.safeCaseBoard' })
  })

  it('pont : liste figée avant déplacement, message avec la case du pont (règle 13)', () => {
    const players = [makePlayer('a', 'A', 9), makePlayer('b', 'B', 9), makePlayer('c', 'C', 10)]
    const result = resolveNoTargetCase({ type: 'pont', effect: 0 }, players, ctx(0, () => 0.1), t)
    expect(result.players.map(p => p.position)).toEqual([10, 10, 10])
    expect(result.outcome).toMatchObject({ key: 'resolveCase.pont', params: { count: 2, case: 10 } })
  })

  it('pont −1 : un protégé ne recule pas, rien depuis la case 1 (règles 2 et 14)', () => {
    const shielded = { ...makePlayer('b', 'B', 9), protected: true, protectionTurnsLeft: 2 }
    const back = resolveNoTargetCase({ type: 'pont', effect: 0 }, [makePlayer('a', 'A', 9), shielded], ctx(0, () => 0.9), t)
    expect(back.players.map(p => p.position)).toEqual([8, 9])
    const atStart = resolveNoTargetCase({ type: 'pont', effect: 0 }, [makePlayer('a', 'A', 0)], ctx(0, () => 0.9), t)
    expect(atStart.players[0].position).toBe(0)
    expect(atStart.outcome).toMatchObject({ key: 'resolveCase.pontNoBack' })
  })

  it('recul groupé : protégés et joueurs en case 1 ne bougent pas (règles 2 et 14)', () => {
    const shielded = { ...makePlayer('b', 'B', 5), protected: true, protectionTurnsLeft: 2 }
    const players = [makePlayer('a', 'A', 9), shielded, makePlayer('c', 'C', 0), makePlayer('d', 'D', 3)]
    const result = resolveNoTargetCase({ type: 'recul-groupe', effect: -1 }, players, ctx(0), t)
    expect(result.players.map(p => p.position)).toEqual([9, 5, 0, 2])
  })

  it('loterie : gorgées journalisées pour les statistiques', () => {
    const players = [makePlayer('a', 'A'), makePlayer('b', 'B'), makePlayer('c', 'C')]
    const result = resolveNoTargetCase({ type: 'loterie', effect: 0 }, players, ctx(0, () => 0), t)
    expect(result.drinks).toHaveLength(1)
    expect(result.drinks[0].count).toBe(2)
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
