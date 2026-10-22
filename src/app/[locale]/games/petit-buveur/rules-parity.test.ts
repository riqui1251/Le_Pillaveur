import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  reduce,
  type EnginePlayer,
  type EngineState,
  type InteractionChoice,
} from '@/lib/petit-buveur/engine'
import { rngFromState } from '@/lib/petit-buveur/rng'
import type { Case, CaseType, PetitBuveurT } from './case-config'
import type { GamePlayer } from './case-types'
import {
  applyChainLink,
  applyChallengeResult,
  applyChanceAdvance,
  applyDoubleCase,
  applyPileFace,
  applyShameDice,
  applyTargetedCase,
  applyVote,
  applyWheelDrinks,
  resolveExchange,
  resolveTeleport,
} from './apply-case'
import { addDrinks, isShielded, tickTurnEnd, type FreshLinks } from './local-rules'
import { resolveNoTargetCase } from './resolve-case'

/**
 * Contrat de règles : le jeu local et le moteur en ligne appliquent chaque
 * case à l'identique (positions, gorgées, statuts, liens), puis passent la
 * main de la même façon (protection, liens, malédiction, passe-tour). Toutes
 * les cases y passent : déterministes, à fenêtre (le choix fait, ou le tirage
 * du serveur rejoué en local) et au hasard (même générateur, même résultat).
 * Seule la roue des défis manque : jamais tirée en ligne.
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

function engineState(seats: Seat[], c: Case, needsTarget: boolean, seed: string | number = 'parity'): EngineState {
  const base = createInitialState(
    seats.map(s => ({ id: s.id, name: s.id })),
    { difficulty: 'normal', defiDrinks: [] },
    seed
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
function localPassTurn(players: GamePlayer[], fresh: Partial<FreshLinks> = {}): GamePlayer[] {
  const list = players.map(p => ({ ...p }))
  tickTurnEnd(list, 0, { fresh: { mirror: Boolean(fresh.mirror), chain: Boolean(fresh.chain) } })
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
          const localAfter = localPassTurn(local.players, { mirror: Boolean(local.mirrorLinked) })
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
        const localAfter = localPassTurn(local.players)
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
    let localList = localPassTurn(local.players, { mirror: Boolean(local.mirrorLinked) })
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

// ─── Cases à fenêtre et tirages : même effet une fois le choix fait ─────────

const CTX = { actorIndex: 0, boardSize: 30, turnDiceTotal: TURN_DICE, t }

/** Résolution en ligne d'une case en attente (choix de l'acteur `a`). */
function online(seats: Seat[], c: Case, choice: InteractionChoice, needsTarget = false, seed: string | number = 'parity'): EngineState {
  return reduce(engineState(seats, c, needsTarget, seed), { type: 'RESOLVE_INTERACTION', playerId: 'a', choice })
}

/** Tables d'un seul usage : départ (recul impossible), case partagée (pont). */
const START_TABLE: Seat[] = [
  { id: 'a', position: 0 },
  { id: 'b', position: 4 },
  { id: 'c', position: 9, protectedTurns: 2 },
]
const SHARED_TABLE: Seat[] = [
  { id: 'a', position: 6 },
  { id: 'b', position: 6 },
  { id: 'c', position: 6, protectedTurns: 3 },
  { id: 'd', position: 2 },
]

const DOUBLE_CASES: Case[][] = [
  [{ type: 'gorgée', effect: 3 }, { type: 'recul', effect: -1 }],
  [{ type: 'avance', effect: 1 }, { type: 'protection', effect: 0 }],
  [{ type: 'malediction', effect: 3 }, { type: 'solo', effect: 1 }],
  [{ type: 'miroir-inverse', effect: 1 }, { type: 'gorgée', effect: 2 }],
  [{ type: 'copie', effect: 0 }, { type: 'passe-tour', effect: 0 }],
  [{ type: 'case-bonus', effect: 1 }, { type: 'recul-groupe', effect: -1 }],
]

describe('Parité local / en ligne : cases à fenêtre, le choix fait', () => {
  for (const [table, seats] of Object.entries(TABLES)) {
    const ids = seats.map(s => s.id)
    const others = ids.filter(id => id !== 'a')

    for (const target of ids) {
      it(`${table} · vote → ${target}`, () => {
        const c: Case = { type: 'vote', effect: 4 }
        const local = applyVote(c, localPlayers(seats), target, CTX)
        expect(byId(online(seats, c, { targetId: target }).players)).toEqual(byId(localPassTurn(local.players)))
      })
    }

    for (const target of others) {
      it(`${table} · echange → ${target}`, () => {
        const local = resolveExchange(localPlayers(seats), 0, target, t)
        const after = online(seats, { type: 'echange', effect: 0 }, { targetId: target })
        expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
      })

      it(`${table} · defi-chaine → ${target}`, () => {
        const c: Case = { type: 'defi-chaine', effect: 5 }
        const local = applyChainLink(c, localPlayers(seats), target, CTX)
        const after = online(seats, c, { targetId: target })
        expect(byId(after.players)).toEqual(byId(localPassTurn(local.players, { chain: Boolean(local.chainLinked) })))
      })
    }

    for (const which of ['leader', 'last'] as const) {
      it(`${table} · teleport ${which}`, () => {
        const local = resolveTeleport(localPlayers(seats), 0, which, t)
        const after = online(seats, { type: 'teleport', effect: 0 }, { option: which })
        expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
      })
    }

    it(`${table} · chance « +2 cases »`, () => {
      const local = applyChanceAdvance(localPlayers(seats), CTX)
      const after = online(seats, { type: 'chance', effect: 0 }, { chanceChoice: 'plus2' })
      expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
    })

    it(`${table} · roue : la valeur tirée par le serveur, bue comme en local`, () => {
      const seen = new Set<boolean>()
      for (let seed = 0; seed < 40; seed++) {
        const after = online(seats, { type: 'roue', effect: 0 }, {}, false, `roue-${seed}`)
        const inter = after.lastInteraction
        if (inter?.kind !== 'roue') throw new Error('roue sans tirage')
        seen.add(inter.drinks > 0)
        const local = applyWheelDrinks(inter.drinks, localPlayers(seats), 0)
        expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
      }
      expect(seen).toEqual(new Set([true, false]))
    })

    for (const target of ids) {
      it(`${table} · pile ou face → ${target}, gagné et perdu`, () => {
        const c: Case = { type: 'pile-face', effect: 2 }
        const outcomes = new Set<boolean>()
        for (let seed = 0; seed < 30; seed++) {
          for (const side of ['pile', 'face'] as const) {
            const staged = online(seats, c, { targetId: target }, false, `pf-${seed}`)
            const after = reduce(staged, { type: 'RESOLVE_INTERACTION', playerId: target, choice: { side } })
            const inter = after.lastInteraction
            if (inter?.kind !== 'pile-face') throw new Error('pièce sans tirage')
            outcomes.add(inter.side === inter.flip)
            const local = applyPileFace(c, localPlayers(seats), target, side, inter.flip, CTX)
            expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
          }
        }
        expect(outcomes).toEqual(new Set([true, false]))
      })
    }

    for (const type of ['defi', 'question'] as const) {
      for (const target of ids) {
        for (const completed of [true, false]) {
          it(`${table} · ${type} → ${target}, ${completed ? 'réussi' : 'raté'}`, () => {
            const c: Case = { type, effect: 2 }
            const players = localPlayers(seats)
            // En local, une cible protégée par un autre est annoncée protégée, sans arbitrage.
            const local = isShielded(players.find(p => p.id === target)!, 'a')
              ? { players }
              : applyChallengeResult(players, target, c.effect, completed, CTX)
            const after = online(seats, c, { targetId: target, succeeded: completed }, true)
            expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
          })
        }
      }
    }

    for (const cases of DOUBLE_CASES) {
      for (const target of ids) {
        it(`${table} · double-case ${cases.map(c => c.type).join(' + ')} → ${target}`, () => {
          const local = applyDoubleCase(cases, localPlayers(seats), target, CTX)
          const state = engineState(seats, { type: 'double-case', effect: 0 }, true)
          const after = reduce(
            { ...state, pending: { ...state.pending!, cases: cases.map(c => ({ type: c.type, effect: c.effect })) } },
            { type: 'RESOLVE_INTERACTION', playerId: 'a', choice: { targetId: target } }
          )
          expect(byId(after.players)).toEqual(byId(localPassTurn(local.players, { mirror: Boolean(local.mirrorLinked) })))
        })
      }
    }
  }

  for (const [table, seats] of Object.entries({ ...TABLES, depart: START_TABLE })) {
    it(`${table} · dé de la honte, chaque face`, () => {
      const faces = new Set<number>()
      for (let seed = 0; faces.size < 6 && seed < 400; seed++) {
        const after = online(seats, { type: 'de-honte', effect: 0 }, {}, false, `honte-${seed}`)
        const inter = after.lastInteraction
        if (inter?.kind !== 'de-honte') throw new Error('dé sans tirage')
        faces.add(inter.value)
        const local = applyShameDice(inter.value, localPlayers(seats), CTX)
        expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
      }
      expect(faces.size).toBe(6)
    })
  }
})

describe('Parité local / en ligne : tirages au hasard, même générateur, même résultat', () => {
  /** Le générateur du moteur, rejoué côté local : mêmes tirages dans le même ordre. */
  const sameRng = (state: EngineState) => {
    const g = rngFromState(state.rngState)
    return () => g.next()
  }

  for (const [table, seats] of Object.entries({ ...TABLES, partagee: SHARED_TABLE })) {
    for (const type of ['pont', 'loterie'] as const) {
      it(`${table} · ${type} (sans cible)`, () => {
        for (let seed = 0; seed < 25; seed++) {
          const c: Case = { type, effect: 0 }
          const state = engineState(seats, c, false, `${type}-${seed}`)
          const local = resolveNoTargetCase(
            c,
            localPlayers(seats),
            { boardSize: 30, actorIndex: 0, lastMoveDelta: TURN_DICE, lastCase: null, rng: sameRng(state) },
            t
          )
          const after = reduce(state, { type: 'RESOLVE_INTERACTION', playerId: 'a', choice: {} })
          expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
        }
      })
    }

    for (const type of ['roulette-russe', 'melange'] as const) {
      for (const target of seats.map(s => s.id)) {
        it(`${table} · ${type} → ${target}`, () => {
          for (let seed = 0; seed < 25; seed++) {
            const c: Case = { type, effect: type === 'roulette-russe' ? 6 : 0 }
            const state = engineState(seats, c, true, `${type}-${seed}`)
            const local = applyTargetedCase(c, localPlayers(seats), target, { ...CTX, rng: sameRng(state) })
            const after = reduce(state, { type: 'RESOLVE_INTERACTION', playerId: 'a', choice: { targetId: target } })
            expect(byId(after.players)).toEqual(byId(localPassTurn(local.players)))
          }
        })
      }
    }
  }
})
