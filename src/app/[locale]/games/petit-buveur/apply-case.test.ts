import { describe, expect, it } from 'vitest'
import type { Case, PetitBuveurT } from './case-config'
import type { GamePlayer } from './case-types'
import {
  applyChainLink,
  applyChanceAdvance,
  applyDoubleCase,
  applyPileFace,
  applyShameDice,
  applyTargetedCase,
  applyVote,
  applyWheelDrinks,
  resolveExchange,
  resolveTeleport,
  type ApplyContext,
} from './apply-case'

const t = Object.assign((key: string) => key, { raw: () => [], has: () => false }) as unknown as PetitBuveurT

function mk(id: string, position: number, extra: Partial<GamePlayer> = {}): GamePlayer {
  return {
    id,
    name: id,
    preferences: { color: '' },
    position,
    drinks: 0,
    protected: false,
    cursed: 0,
    linkedTurns: 0,
    ...extra,
  }
}

const shielded = { protected: true, protectionTurnsLeft: 3 }

const ctx = (extra: Partial<ApplyContext> = {}): ApplyContext => ({
  actorIndex: 0,
  boardSize: 30,
  turnDiceTotal: 0,
  t,
  ...extra,
})

const apply = (c: Case, players: GamePlayer[], targetId: string, extra?: Partial<ApplyContext>) =>
  applyTargetedCase(c, players, targetId, ctx(extra))

describe('applyTargetedCase : protection (règle 2)', () => {
  it('avance ciblée : effet positif, jamais bloqué', () => {
    const r = apply({ type: 'avance', effect: 2 }, [mk('a', 3), mk('b', 5, shielded)], 'b')
    expect(r.players[1].position).toBe(7)
  })

  it('recul, malédiction, ancre, passe-tour : bloqués sur un protégé', () => {
    const players = [mk('a', 3), mk('b', 5, shielded)]
    for (const c of [
      { type: 'recul', effect: -1 },
      { type: 'malediction', effect: 3 },
      { type: 'ancre', effect: 0 },
      { type: 'passe-tour', effect: 0 },
      { type: 'miroir-inverse', effect: 1 },
    ] as Case[]) {
      const r = apply(c, players, 'b')
      expect(r.players[1]).toMatchObject({ position: 5, cursed: 0, protected: true })
      expect(r.players[1].anchored).toBeFalsy()
      expect(r.players[1].skipNextTurn).toBeFalsy()
      expect(r.players[0].mirrorDrinkTargetId).toBeUndefined()
    }
  })

  it('miroir : les protégés gardent leur case, les autres sont miroités', () => {
    const players = [mk('a', 2), mk('b', 9, shielded), mk('c', 14)]
    const r = apply({ type: 'miroir', effect: 0 }, players, 'c')
    expect(r.players.map(p => p.position)).toEqual([14, 9, 2])
  })

  it('mélange : les protégés gardent leur case (règle 15 sur les autres)', () => {
    const players = [mk('a', 2), mk('b', 9, shielded), mk('c', 14), mk('d', 20)]
    const r = apply({ type: 'melange', effect: 0 }, players, 'c', { rng: () => 0 })
    expect(r.players[1].position).toBe(9)
    expect(r.players.filter(p => p.id !== 'b').map(p => p.position).sort((x, y) => x - y)).toEqual([2, 14, 20])
  })

  it('tous : la cible est épargnée, un protégé ne boit pas', () => {
    const r = apply({ type: 'tous', effect: 2 }, [mk('a', 0), mk('b', 0), mk('c', 0, shielded)], 'b')
    expect(r.players.map(p => p.drinks)).toEqual([2, 0, 0])
  })
})

describe('applyTargetedCase : déplacements', () => {
  it('recul depuis la case 1 : aucun déplacement, message « ne peut pas reculer » (règle 14)', () => {
    const r = apply({ type: 'recul', effect: -1 }, [mk('a', 3), mk('b', 0)], 'b')
    expect(r.players[1].position).toBe(0)
    expect(r.outcome).toMatchObject({ key: 'game.outcomes.cannotRecul' })
  })

  it('copie : la cible subit le déplacement TOTAL du tour, relance comprise (règle 6, #51)', () => {
    const r = apply({ type: 'copie', effect: 0 }, [mk('a', 9), mk('b', 0)], 'b', { turnDiceTotal: 7 })
    expect(r.players[1].position).toBe(7)
  })

  it('malédiction : 3 tours par défaut (règle 3)', () => {
    const r = apply({ type: 'malediction', effect: 0 }, [mk('a', 3), mk('b', 5)], 'b')
    expect(r.players[1].cursed).toBe(3)
  })

  it('miroir inversé : lien posé par l’acteur, signalé comme frais (règle 5)', () => {
    const r = apply({ type: 'miroir-inverse', effect: 1 }, [mk('a', 3), mk('b', 5)], 'b')
    expect(r.players[0]).toMatchObject({ mirrorDrinkTargetId: 'b', mirrorDrinkTurns: 1 })
    expect(r.mirrorLinked).toBe(true)
  })

  it('n’altère jamais la liste reçue', () => {
    const players = [mk('a', 3), mk('b', 5)]
    apply({ type: 'gorgée', effect: 2 }, players, 'b')
    expect(players[1].drinks).toBe(0)
  })
})

describe('applyDoubleCase (règle 11)', () => {
  it('applique les deux cases à la même cible, dans l’ordre', () => {
    const r = applyDoubleCase(
      [
        { type: 'gorgée', effect: 2 },
        { type: 'recul', effect: -1 },
      ],
      [mk('a', 3), mk('b', 5)],
      'b',
      ctx()
    )
    expect(r.players[1]).toMatchObject({ drinks: 2, position: 4 })
  })

  it('une case sans cible s’applique à l’acteur, arrêt à la victoire', () => {
    const r = applyDoubleCase(
      [
        { type: 'case-bonus', effect: 1 },
        { type: 'gorgée', effect: 2 },
      ],
      [mk('a', 28), mk('b', 5)],
      'b',
      ctx()
    )
    expect(r.players[0].position).toBe(29)
    expect(r.players[1].drinks).toBe(0)
  })
})

describe('resolveExchange / resolveTeleport (règles 2 et 16)', () => {
  it('échange avec soi-même refusé', () => {
    const r = resolveExchange([mk('a', 3), mk('b', 5)], 0, 'a', t)
    expect(r.partnerId).toBeNull()
    expect(r.players.map(p => p.position)).toEqual([3, 5])
  })

  it('échange visant un protégé : annulé avec message', () => {
    const r = resolveExchange([mk('a', 3), mk('b', 5, shielded)], 0, 'b', t)
    expect(r.players.map(p => p.position)).toEqual([3, 5])
    expect(r.outcome).toMatchObject({ type: 'compose' })
  })

  it('échange normal', () => {
    const r = resolveExchange([mk('a', 3), mk('b', 5)], 0, 'b', t)
    expect(r.players.map(p => p.position)).toEqual([5, 3])
  })

  it('téléport vers le 1er quand on est déjà 1er : aucun échange avec soi-même', () => {
    const r = resolveTeleport([mk('a', 12), mk('b', 5)], 0, 'leader', t)
    expect(r.partnerId).toBeNull()
    expect(r.outcome).toMatchObject({ key: 'game.outcomes.teleportSelf' })
  })

  it('téléport vers le 1er : échange de positions', () => {
    const r = resolveTeleport([mk('a', 2), mk('b', 15), mk('c', 7)], 0, 'leader', t)
    expect(r.players.map(p => p.position)).toEqual([15, 2, 7])
  })
})

describe('cases à fenêtre : effet et message, une fois le choix fait', () => {
  it('vote : le désigné boit ; protégé par la case d’un autre, rien ne passe', () => {
    const players = [mk('a', 3), mk('b', 5), mk('c', 7, shielded)]
    const hit = applyVote({ type: 'vote', effect: 0 }, players, 'b', ctx())
    expect(hit.players[1].drinks).toBe(3)
    expect(hit.drinks).toEqual([{ playerId: 'b', count: 3 }])
    const blocked = applyVote({ type: 'vote', effect: 4 }, players, 'c', ctx())
    expect(blocked.players[2].drinks).toBe(0)
    expect(blocked.drinks).toEqual([])
  })

  it('dé de la honte : chaque face, et le 6 sur la case de départ ne recule pas', () => {
    const at = (position: number, roll: number) => applyShameDice(roll, [mk('a', position), mk('b', 4)], ctx())
    expect(at(5, 2).players[0]).toMatchObject({ position: 5, drinks: 0 })
    expect(at(5, 3).players[0]).toMatchObject({ position: 5, drinks: 2 })
    expect(at(5, 5).players[0].position).toBe(6)
    expect(at(5, 6).players[0].position).toBe(4)
    expect(at(0, 6).players[0].position).toBe(0)
    expect(at(0, 6).outcome).toMatchObject({ key: 'game.outcomes.cannotRecul' })
    expect(at(5, 4).outcome).toMatchObject({ key: 'shameDice.outcomeDrink', params: { roll: 4 } })
  })

  it('pile ou face : gagné, personne ne boit ; perdu, la cible boit (sa propre case n’est jamais bloquée)', () => {
    const players = [mk('a', 3, shielded), mk('b', 5)]
    const win = applyPileFace({ type: 'pile-face', effect: 2 }, players, 'b', 'pile', 'pile', ctx())
    expect(win.players[1].drinks).toBe(0)
    expect(win.outcome).toMatchObject({ key: 'game.outcomes.pileFaceWin' })
    const lose = applyPileFace({ type: 'pile-face', effect: 2 }, players, 'b', 'pile', 'face', ctx())
    expect(lose.players[1].drinks).toBe(2)
    const self = applyPileFace({ type: 'pile-face', effect: 2 }, players, 'a', 'face', 'pile', ctx())
    expect(self.players[0].drinks).toBe(2)
  })

  it('défi en chaîne : lien de N tours posé « frais », jamais soi, refusé sur un protégé', () => {
    const players = [mk('a', 3), mk('b', 5), mk('c', 7, shielded)]
    const linked = applyChainLink({ type: 'defi-chaine', effect: 5 }, players, 'b', ctx())
    expect(linked.players[0]).toMatchObject({ linkedTo: 'b', linkedTurns: 5 })
    expect(linked.chainLinked).toBe(true)
    expect(applyChainLink({ type: 'defi-chaine', effect: 5 }, players, 'a', ctx()).chainLinked).toBeUndefined()
    const blocked = applyChainLink({ type: 'defi-chaine', effect: 5 }, players, 'c', ctx())
    expect(blocked.players[0].linkedTo).toBeUndefined()
    expect(blocked.chainLinked).toBeUndefined()
  })

  it('chance « +2 cases » : bornée à la dernière case', () => {
    expect(applyChanceAdvance([mk('a', 28), mk('b', 1)], ctx()).players[0].position).toBe(29)
    expect(applyChanceAdvance([mk('a', 4), mk('b', 1)], ctx()).outcome).toMatchObject({ params: { case: 7 } })
  })

  it('roue : l’acteur boit le secteur tiré, même protégé (sa propre case)', () => {
    const r = applyWheelDrinks(7, [mk('a', 3, shielded), mk('b', 5)], 0)
    expect(r.players[0].drinks).toBe(7)
    expect(applyWheelDrinks(0, [mk('a', 3), mk('b', 5)], 0).drinks).toEqual([])
  })
})
