import { describe, expect, it } from 'vitest'
import { createInitialState, reduce, type EnginePlayer, type EngineState } from '@/lib/petit-buveur/engine'
import type { Case, CaseType, PetitBuveurT } from './case-config'
import type { GamePlayer } from './case-types'
import { applyTargetedCase } from './apply-case'
import { addDrinks, tickTurnEnd } from './local-rules'
import { resolveNoTargetCase } from './resolve-case'

/**
 * Contrat de règles : le jeu local et le moteur en ligne appliquent chaque
 * case déterministe à l'identique (positions, gorgées, statuts, liens), puis
 * passent la main de la même façon (protection, liens, malédiction, passe-tour).
 */

const t = Object.assign((key: string) => key, { raw: () => [], has: () => false }) as unknown as PetitBuveurT

type Seat = {
  id: string
  position: number
  protectedTurns?: number
  cursed?: number
  mirrorTo?: string
  linkedTo?: string
  linkedTurns?: number
}

const TABLES: Record<string, Seat[]> = {
  simple: [
    { id: 'a', position: 5 },
    { id: 'b', position: 0 },
    { id: 'c', position: 12 },
    { id: 'd', position: 3 },
  ],
  protectedOthers: [
    { id: 'a', position: 5 },
    { id: 'b', position: 0, protectedTurns: 3 },
    { id: 'c', position: 12, protectedTurns: 2 },
    { id: 'd', position: 3 },
  ],
  protectedActorAndLinks: [
    { id: 'a', position: 7, protectedTurns: 4, mirrorTo: 'd' },
    { id: 'b', position: 2, cursed: 2 },
    { id: 'c', position: 0 },
    { id: 'd', position: 9, linkedTo: 'c', linkedTurns: 3 },
  ],
}

const TARGETED: Case[] = [
  { type: 'gorgée', effect: 3 },
  { type: 'tous', effect: 2 },
  { type: 'avance', effect: 1 },
  { type: 'recul', effect: -1 },
  { type: 'bombe', effect: 2 },
  { type: 'protection', effect: 0 },
  { type: 'malediction', effect: 3 },
  { type: 'miroir', effect: 0 },
  { type: 'piege', effect: 0 },
  { type: 'passe-tour', effect: 0 },
  { type: 'double-peine', effect: 4 },
  { type: 'copie', effect: 0 },
  { type: 'ancre', effect: 0 },
  { type: 'inversion', effect: 2 },
  { type: 'miroir-inverse', effect: 1 },
]

const NO_TARGET: Case[] = [
  { type: 'normal', effect: 0 },
  { type: 'solo', effect: 1 },
  { type: 'case-bonus', effect: 1 },
  { type: 'recul-groupe', effect: -1 },
  { type: 'grappin', effect: 0 },
]

const TURN_DICE = 4

function localPlayers(seats: Seat[]): GamePlayer[] {
  return seats.map(s => ({
    id: s.id,
    name: s.id,
    preferences: { color: '' },
    position: s.position,
    drinks: 0,
    protected: Boolean(s.protectedTurns),
    protectionTurnsLeft: s.protectedTurns,
    cursed: s.cursed ?? 0,
    linkedTo: s.linkedTo,
    linkedTurns: s.linkedTurns ?? 0,
    mirrorDrinkTargetId: s.mirrorTo,
    mirrorDrinkTurns: s.mirrorTo ? 2 : 0,
  }))
}

function engineState(seats: Seat[], c: Case, needsTarget: boolean): EngineState {
  const base = createInitialState(
    seats.map(s => ({ id: s.id, name: s.id })),
    { difficulty: 'normal', defiDrinks: [] },
    'parity'
  )
  const players: EnginePlayer[] = base.players.map((p, i) => {
    const s = seats[i]
    return {
      ...p,
      position: s.position,
      protected: Boolean(s.protectedTurns),
      protectionTurnsLeft: s.protectedTurns,
      cursed: s.cursed ?? 0,
      linkedTo: s.linkedTo,
      linkedTurns: s.linkedTurns,
      mirrorDrinkTargetId: s.mirrorTo,
      mirrorDrinkTurns: s.mirrorTo ? 2 : undefined,
    }
  })
  return {
    ...base,
    players,
    phase: 'awaiting-interaction',
    lastDice: TURN_DICE,
    lastMoveDelta: TURN_DICE,
    turnDiceTotal: TURN_DICE,
    lastCase: { type: c.type, effect: c.effect },
    pending: { caseType: c.type, playerId: 'a', needsTarget, case: { type: c.type, effect: c.effect } },
  }
}

/** Passage de main local, tel que game.tsx l'enchaîne (endTurn puis rollDice des suivants). */
function localPassTurn(players: GamePlayer[], freshMirror: boolean): GamePlayer[] {
  const list = players.map(p => ({ ...p }))
  tickTurnEnd(list, 0, { fresh: { mirror: freshMirror, chain: false } })
  for (let i = 1; i < list.length; i++) {
    const p = list[i]
    if (p.cursed > 0) {
      addDrinks(list, p.id, 1)
      p.cursed -= 1
    }
    if (!p.skipNextTurn) break
    p.skipNextTurn = false
  }
  return list
}

type Snapshot = Record<string, unknown>

function snap(p: GamePlayer | EnginePlayer): Snapshot {
  const prot = p.protected && (p.protectionTurnsLeft ?? 0) > 0
  return {
    position: p.position,
    drinks: p.drinks,
    protectionTurnsLeft: prot ? p.protectionTurnsLeft : 0,
    cursed: p.cursed,
    skipNextTurn: Boolean(p.skipNextTurn),
    anchored: Boolean(p.anchored),
    mirror: (p.mirrorDrinkTurns ?? 0) > 0 ? `${p.mirrorDrinkTargetId}:${p.mirrorDrinkTurns}` : null,
    chain: p.linkedTo && (p.linkedTurns ?? 0) > 0 ? `${p.linkedTo}:${p.linkedTurns}` : null,
  }
}

const byId = (list: (GamePlayer | EnginePlayer)[]) => Object.fromEntries(list.map(p => [p.id, snap(p)]))

describe('Parité local / en ligne : cases déterministes', () => {
  for (const [table, seats] of Object.entries(TABLES)) {
    for (const c of TARGETED) {
      for (const target of seats.map(s => s.id)) {
        it(`${table} · ${c.type} → ${target}`, () => {
          const local = applyTargetedCase(c, localPlayers(seats), target, {
            actorIndex: 0,
            boardSize: 30,
            turnDiceTotal: TURN_DICE,
            t,
          })
          const localAfter = localPassTurn(local.players, Boolean(local.mirrorLinked))
          const online = reduce(engineState(seats, c, true), {
            type: 'RESOLVE_INTERACTION',
            playerId: 'a',
            choice: { targetId: target },
          })
          expect(byId(online.players)).toEqual(byId(localAfter))
        })
      }
    }
    for (const c of NO_TARGET) {
      it(`${table} · ${c.type} (sans cible)`, () => {
        const local = resolveNoTargetCase(
          c,
          localPlayers(seats),
          { boardSize: 30, actorIndex: 0, lastMoveDelta: TURN_DICE, lastCase: null },
          t
        )
        const localAfter = localPassTurn(local.players, false)
        const online = reduce(engineState(seats, c, false), {
          type: 'RESOLVE_INTERACTION',
          playerId: 'a',
          choice: {},
        })
        expect(byId(online.players)).toEqual(byId(localAfter))
      })
    }
  }
})

describe('Parité local / en ligne : durée des liens sur plusieurs tours', () => {
  const linkCase = (type: CaseType, effect: number): Case => ({ type, effect })

  it.each([
    ['miroir-inverse', 1],
    ['malediction', 3],
  ] as const)('%s : même décompte tour après tour', (type, effect) => {
    const seats: Seat[] = [
      { id: 'a', position: 5 },
      { id: 'b', position: 1 },
    ]
    const c = linkCase(type, effect)
    const local = applyTargetedCase(c, localPlayers(seats), 'b', {
      actorIndex: 0,
      boardSize: 30,
      turnDiceTotal: 0,
      t,
    })
    let localList = localPassTurn(local.players, Boolean(local.mirrorLinked))
    let online = reduce(engineState(seats, c, true), {
      type: 'RESOLVE_INTERACTION',
      playerId: 'a',
      choice: { targetId: 'b' },
    })
    expect(byId(online.players)).toEqual(byId(localList))

    // Tour de b (aucun effet), puis tour de a, etc. : on compare après chaque fin de tour.
    for (let round = 0; round < 6; round++) {
      const leaving = online.currentPlayer
      const players = online.players.map(p => ({ ...p }))
      // Fin de tour sans case : le moteur passe la main via son propre réducteur
      // (case Normale résolue d'office).
      online = reduce(
        {
          ...online,
          players,
          phase: 'awaiting-interaction',
          pending: { caseType: 'normal', playerId: players[leaving].id, needsTarget: false, case: { type: 'normal', effect: 0 } },
        },
        { type: 'RESOLVE_INTERACTION', playerId: players[leaving].id, choice: {} }
      )
      const list = localList.map(p => ({ ...p }))
      tickTurnEnd(list, leaving)
      const next = (leaving + 1) % list.length
      const p = list[next]
      if (p.cursed > 0) {
        addDrinks(list, p.id, 1)
        p.cursed -= 1
      }
      localList = list
      expect(byId(online.players)).toEqual(byId(localList))
    }
  })
})
