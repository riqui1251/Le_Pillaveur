import { describe, expect, it } from 'vitest'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { createRng } from './rng'
import {
  autoAction,
  createInitialState,
  currentDeciderId,
  reduce,
  EngineError,
  PB_SPEECH_CAP,
  type EnginePending,
  type EngineSettings,
  type EngineState,
  type InteractionChoice,
  type PbSayMove,
  type PbSpeech,
} from './engine'
import { needsTarget, type EngineCase } from './types'
import {
  PB_FINISH_IN_REACH,
  PB_TABLE_SPEECH_PER_ROUND,
  pbTalkChance,
  petitBuveurBotSay,
} from './bot-speech'
import {
  applyBotAction,
  applyRoomAction,
  buildPetitBuveurEngineState,
  parseEngineState,
  serializeEngineState,
  toClientView,
  withPetitBuveurSay,
  type RoomActionInput,
} from './server-adapter'

const SETTINGS: EngineSettings = { difficulty: 'normal', defiDrinks: [1, 2, 1, 3, 2, 1, 2] }
const ALWAYS = () => 0
/** Dé de parole qui ne tombe jamais. */
const SILENT = () => 1
const NOW = 1_000_000

const IDS = ['h', 'b1', 'b2', 'h2']

/** Riqui (humain), Raoul et Josiane (bots), Léa (humaine), aux cases données ; `current` au tour. */
function make(positions: number[], { current = 0, seed = 'paroles' as string | number } = {}): EngineState {
  const s = createInitialState(
    ['Riqui', 'Raoul', 'Josiane', 'Léa'].map((name, i) => ({ id: IDS[i], name })),
    SETTINGS,
    seed
  )
  s.players.forEach((p, i) => {
    p.position = positions[i] ?? 0
    if (p.id.startsWith('b')) p.isBot = true
  })
  return { ...s, currentPlayer: current }
}

function withPending(s: EngineState, c: EngineCase, extra: Partial<EnginePending> = {}): EngineState {
  return {
    ...s,
    phase: 'awaiting-interaction',
    lastCase: c,
    pending: {
      caseType: c.type,
      playerId: s.players[s.currentPlayer].id,
      needsTarget: needsTarget(c.type),
      case: c,
      ...extra,
    },
  }
}

const resolve = (s: EngineState, playerId: string, choice?: InteractionChoice) =>
  reduce(s, { type: 'RESOLVE_INTERACTION', playerId, choice })
const plan = (before: EngineState, after: EngineState, rand: () => number = ALWAYS) =>
  petitBuveurBotSay(toClientView(before), toClientView(after), rand)
const say = (s: EngineState, ...moves: PbSayMove[]) => reduce(s, { type: 'SAY', moves })
const sp = (playerId: string, round: number, kind: PbSpeech['kind'] = 'aim', targetId = 'h'): PbSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})
/** Une suite de tirages, puis 0. */
const scripted = (...values: number[]) => () => values.shift() ?? 0

describe('petitBuveurBotSay : ce que le coup inspire au bot qu’il touche', () => {
  it('aim : sa case fait boire un humain, il le taquine ; un bot visé, rien à dire', () => {
    const s = withPending(make([3, 5, 0, 1], { current: 1 }), { type: 'gorgée', effect: 3 })
    expect(plan(s, resolve(s, 'b1', { targetId: 'h' }))).toEqual([{ playerId: 'b1', kind: 'aim', targetId: 'h' }])
    expect(plan(s, resolve(s, 'b1', { targetId: 'b2' }))).toEqual([])
  })

  it('ouch : sa propre case le fait boire, il râle devant un humain', () => {
    const s = withPending(make([3, 5, 0, 1], { current: 1 }), { type: 'gorgée', effect: 3 })
    expect(plan(s, resolve(s, 'b1', { targetId: 'b1' }))).toEqual([{ playerId: 'b1', kind: 'ouch', targetId: 'h' }])
  })

  it('payback : la case d’un humain le fait boire ou le maudit, il promet la revanche à cet humain', () => {
    const drink = withPending(make([3, 5, 0, 1]), { type: 'gorgée', effect: 3 })
    expect(plan(drink, resolve(drink, 'h', { targetId: 'b1' }))).toEqual([
      { playerId: 'b1', kind: 'payback', targetId: 'h' },
    ])
    const curse = withPending(make([3, 5, 0, 1]), { type: 'malediction', effect: 3 })
    expect(plan(curse, resolve(curse, 'h', { targetId: 'b2' }))).toEqual([
      { playerId: 'b2', kind: 'payback', targetId: 'h' },
    ])
  })

  it('sentBack : la case d’un humain le renvoie en arrière, il se lamente', () => {
    const s = withPending(make([3, 5, 0, 1]), { type: 'recul', effect: 2 })
    const after = resolve(s, 'h', { targetId: 'b1' })
    expect(after.players[1].position).toBe(3)
    expect(plan(s, after)).toEqual([{ playerId: 'b1', kind: 'sentBack', targetId: 'h' }])
  })

  it('overtake : il double un humain, il le chambre ; celui qu’il n’a pas dépassé n’entend rien', () => {
    const s = withPending(make([7, 5, 0, 1], { current: 1 }), { type: 'avance', effect: 3 })
    expect(plan(s, resolve(s, 'b1', { targetId: 'b1' }))).toEqual([
      { playerId: 'b1', kind: 'overtake', targetId: 'h' },
    ])
    const level = withPending(make([8, 5, 0, 1], { current: 1 }), { type: 'avance', effect: 3 })
    expect(plan(level, resolve(level, 'b1', { targetId: 'b1' }))).toEqual([])
  })

  it(`closeToWin : à un lancer de l’arrivée (case ${PB_FINISH_IN_REACH + 1}), il fanfaronne devant l’humain le mieux placé — avant de chambrer qui il double`, () => {
    const s = withPending(make([22, 20, 0, 10], { current: 1 }), { type: 'avance', effect: 4 })
    expect(plan(s, resolve(s, 'b1', { targetId: 'b1' }))).toEqual([
      { playerId: 'b1', kind: 'closeToWin', targetId: 'h' },
    ])
  })

  it('duelLost : un bot qui perd le duel lancé par un humain réagit ; vainqueur, il se tait', () => {
    let lost = 0
    let won = 0
    for (let seed = 0; seed < 40 && (lost === 0 || won === 0); seed += 1) {
      const s = withPending(make([6, 6, 0, 1], { seed }), { type: 'normal', effect: 0 }, {
        stage: 'duel',
        opponents: ['b1'],
        needsTarget: false,
      })
      const after = resolve(s, 'h', { targetId: 'b1' })
      const duel = after.lastInteraction?.kind === 'duel' ? after.lastInteraction : null
      expect(duel).not.toBeNull()
      if (duel?.challengerWins) {
        lost += 1
        expect(plan(s, after)).toEqual([{ playerId: 'b1', kind: 'duelLost', targetId: 'h' }])
      } else {
        won += 1
        expect(plan(s, after)).toEqual([])
      }
    }
    expect(lost).toBeGreaterThan(0)
    expect(won).toBeGreaterThan(0)
  })

  it('flipLost : le bot visé par le pile ou face d’un humain perd la pièce, il accuse la pièce — avant les gorgées', () => {
    let lost = 0
    for (let seed = 0; seed < 40 && lost === 0; seed += 1) {
      const s = withPending(make([3, 5, 0, 1], { seed }), { type: 'pile-face', effect: 2 }, {
        stage: 'side',
        targetId: 'b1',
        needsTarget: false,
      })
      const after = resolve(s, 'b1', { side: 'pile' })
      if (after.lastInteraction?.kind !== 'pile-face' || after.lastInteraction.flip === 'pile') continue
      lost += 1
      expect(plan(s, after)).toEqual([{ playerId: 'b1', kind: 'flipLost', targetId: 'h' }])
    }
    expect(lost).toBe(1)
  })

  it('une bulle au plus par coup ; à rang égal, l’ordre tournant tiré au sort désigne qui parle', () => {
    const bomb = withPending(make([3, 5, 0, 1]), { type: 'bombe', effect: 1 })
    const after = resolve(bomb, 'h', { targetId: 'h2' })
    expect(plan(bomb, after, scripted(0, 0))).toEqual([{ playerId: 'b1', kind: 'payback', targetId: 'h' }])
    expect(plan(bomb, after, scripted(0.6, 0))).toEqual([{ playerId: 'b2', kind: 'payback', targetId: 'h' }])
    // b2 en tête de l'ordre, mais son dé ne tombe pas : b1 a encore sa chance.
    expect(plan(bomb, after, scripted(0.6, 0.99, 0))).toEqual([{ playerId: 'b1', kind: 'payback', targetId: 'h' }])
  })

  it('le dé de parole suit le caractère : bavardage, audace du fanfaron, rancune du rancunier', () => {
    const raoul = botTraitsFor('Raoul')
    const gaston = botTraitsFor('Gaston')
    const germaine = botTraitsFor('Germaine')
    expect(pbTalkChance('overtake', raoul)).toBeGreaterThan(pbTalkChance('overtake', gaston))
    expect(pbTalkChance('payback', germaine)).toBeGreaterThan(pbTalkChance('payback', gaston))
    expect(pbTalkChance('duelLost', gaston)).toBeCloseTo(2 * pbTalkChance('payback', gaston))
    for (const kind of ['ouch', 'aim', 'closeToWin', 'duelLost'] as const) {
      expect(pbTalkChance(kind, botTraitsFor('Josiane'))).toBeLessThanOrEqual(1)
    }
    const s = withPending(make([3, 5, 0, 1], { current: 1 }), { type: 'gorgée', effect: 3 })
    const after = resolve(s, 'b1', { targetId: 'h' })
    const chance = pbTalkChance('aim', raoul)
    expect(plan(s, after, scripted(0, chance - 0.01))).toHaveLength(1)
    expect(plan(s, after, scripted(0, chance + 0.01))).toEqual([])
    expect(plan(s, after, SILENT)).toEqual([])
  })
})

describe('sobriété : rien pour personne, plafonds par bot et par tour de table', () => {
  const s = withPending(make([3, 5, 0, 1], { current: 1 }), { type: 'gorgée', effect: 3 })

  it('aucun humain présent pour la lire : aucune parole (une table de bots ne se parle pas)', () => {
    const gone = { ...s, players: s.players.map((p) => (p.isBot ? p : { ...p, leftAt: NOW })) }
    expect(plan(gone, resolve(gone, 'b1', { targetId: 'h' }))).toEqual([])
  })

  it('un humain parti n’est plus visé ; la cible reste un humain présent', () => {
    const gone = { ...s, players: s.players.map((p) => (p.id === 'h' ? { ...p, leftAt: NOW } : p)) }
    const ouch = resolve(gone, 'b1', { targetId: 'b1' })
    expect(plan(gone, ouch)).toEqual([{ playerId: 'b1', kind: 'ouch', targetId: 'h2' }])
  })

  it(`min(${PB_SPEECH_CAP}, bavardage) par bot et ${PB_TABLE_SPEECH_PER_ROUND} pour la table, par tour de table`, () => {
    const round = s.turnCount
    const capped = { ...s, speech: [sp('b1', round), sp('b1', round)] }
    expect(plan(capped, resolve(capped, 'b1', { targetId: 'h' }))).toEqual([])
    const lastRound = { ...s, speech: [sp('b1', round - 1), sp('b1', round - 1)] }
    expect(plan(lastRound, resolve(lastRound, 'b1', { targetId: 'h' }))).toHaveLength(1)
    const full = { ...s, speech: Array.from({ length: PB_TABLE_SPEECH_PER_ROUND }, () => sp('b2', round)) }
    expect(plan(full, resolve(full, 'b1', { targetId: 'h' }))).toEqual([])
    // Gaston ne dit qu'un mot par tour de table.
    const gaston = { ...s, players: s.players.map((p) => (p.id === 'b1' ? { ...p, name: 'Gaston' } : p)) }
    const spoke = { ...gaston, speech: [sp('b1', round)] }
    expect(plan(spoke, resolve(spoke, 'b1', { targetId: 'h' }))).toEqual([])
  })

  it('partie finie : plus un mot', () => {
    const near = withPending(make([3, 25, 0, 1], { current: 1 }), { type: 'avance', effect: 6 })
    const won = resolve(near, 'b1', { targetId: 'b1' })
    expect(won.phase).toBe('finished')
    expect(plan(near, won)).toEqual([])
  })

  it('un coup sans effet nouveau (passage de tour d’un absent) ne fait rien dire', () => {
    const after = resolve(s, 'b1', { targetId: 'h' })
    expect(plan(after, { ...after, version: after.version + 1 })).toEqual([])
  })
})

describe('ANTI-FUITE : le bot ne sait que ce que voit la table', () => {
  /** Raoul vient de lancer et double Riqui ; la case tirée attend sa cible, cachée. */
  function rolledOnto(c: EngineCase, rngState: number): { before: EngineState; after: EngineState } {
    const before = make([7, 5, 0, 1], { current: 1 })
    const moved = { ...before, players: before.players.map((p) => (p.id === 'b1' ? { ...p, position: 9 } : p)) }
    return { before, after: { ...withPending(moved, c), lastDice: 4, lastMoveDelta: 4, rngState } }
  }

  it('cible à choisir à l’aveugle : la vue lue est la même quelle que soit la case tirée et l’état du RNG, la parole aussi', () => {
    const a = rolledOnto({ type: 'gorgée', effect: 3 }, 11)
    const b = rolledOnto({ type: 'malediction', effect: 3 }, 987654)
    expect(toClientView(a.after)).toEqual(toClientView(b.after))
    expect(JSON.stringify(toClientView(a.after))).not.toContain('gorgée')
    expect(plan(a.before, a.after)).toEqual([{ playerId: 'b1', kind: 'overtake', targetId: 'h' }])
    expect(plan(b.before, b.after)).toEqual(plan(a.before, a.after))
    expect(withPetitBuveurSay(a.before, a.after, ALWAYS).speech).toEqual(
      withPetitBuveurSay(b.before, b.after, ALWAYS).speech
    )
  })

  it('duel proposé avant la case : rien de la case tirée non plus', () => {
    const base = make([7, 5, 0, 1], { current: 1 })
    const duel = (c: EngineCase) =>
      withPending({ ...base, players: base.players.map((p) => (p.id === 'b1' ? { ...p, position: 7 } : p)) }, c, {
        stage: 'duel',
        opponents: ['h'],
        needsTarget: false,
      })
    const a = duel({ type: 'gorgée', effect: 3 })
    const b = duel({ type: 'protection', effect: 0 })
    expect(toClientView(a)).toEqual(toClientView(b))
    expect(plan(base, a, ALWAYS)).toEqual(plan(base, b, ALWAYS))
  })
})

describe('moteur : SAY, la parole d’un bot', () => {
  const s = make([3, 5, 0, 1])

  it('refuse un kind inconnu, un humain qui parle, une cible bot, absente ou soi-même, et le plafond', () => {
    const err = (fn: () => unknown, code: string) => {
      expect(fn).toThrow(EngineError)
      expect(fn).toThrow(code)
    }
    err(() => say(s, { playerId: 'b1', kind: 'bavard' as PbSayMove['kind'], targetId: 'h' }), 'INVALID_KIND')
    err(() => say(s, { playerId: 'h', kind: 'aim', targetId: 'h2' }), 'NOT_BOT')
    err(() => say(s, { playerId: 'b1', kind: 'aim', targetId: 'b2' }), 'INVALID_TARGET')
    err(() => say(s, { playerId: 'b1', kind: 'aim', targetId: 'b1' }), 'INVALID_TARGET')
    err(() => say(s, { playerId: 'b1', kind: 'aim', targetId: 'nobody' }), 'INVALID_TARGET')
    const left = { ...s, players: s.players.map((p) => (p.id === 'h' ? { ...p, leftAt: NOW } : p)) }
    err(() => say(left, { playerId: 'b1', kind: 'aim', targetId: 'h' }), 'INVALID_TARGET')
    const capped = say(s, ...Array.from({ length: PB_SPEECH_CAP }, () => ({ playerId: 'b1', kind: 'aim' as const, targetId: 'h' })))
    err(() => say(capped, { playerId: 'b1', kind: 'ouch', targetId: 'h' }), 'ALREADY_SPOKE')
    const finished = { ...s, phase: 'finished' as const, winner: 'h' }
    err(() => say(finished, { playerId: 'b1', kind: 'aim', targetId: 'h' }), 'GAME_FINISHED')
  })

  it('une parole n’est pas un coup : seul `speech` change, numéroté par tour de table, l’ancien tour élagué', () => {
    const spoken = say(s, { playerId: 'b1', kind: 'aim', targetId: 'h' })
    expect(spoken.speech).toEqual([sp('b1', s.turnCount)])
    const { speech: _speech, ...rest } = spoken
    void _speech
    expect(rest).toEqual(s)
    const nextRound = say({ ...spoken, turnCount: s.turnCount + 1 }, { playerId: 'b2', kind: 'ouch', targetId: 'h2' })
    expect(nextRound.speech).toEqual([sp('b2', s.turnCount + 1, 'ouch', 'h2')])
    expect(say(s)).toBe(s)
  })

  it('un état d’avant les paroles se relit sans elles, et parle quand même ; la vue les rend publiques', () => {
    const json = serializeEngineState(s)
    expect(json).not.toContain('speech')
    const legacy = parseEngineState(json)!
    expect(legacy).toEqual(s)
    const spoken = say(legacy, { playerId: 'b1', kind: 'aim', targetId: 'h' })
    expect(parseEngineState(serializeEngineState(spoken))?.speech).toEqual(spoken.speech)
    expect(toClientView(spoken).speech).toEqual(spoken.speech)
    expect(parseEngineState(JSON.stringify({ ...s, speech: 'n’importe quoi' }))).toEqual(s)
  })
})

describe('adaptateur : la parole naît dans l’écriture du coup, sur son propre flux', () => {
  it('le coup d’un humain fait parler le bot qu’il touche ; le même coup sans parole donne la même partie', () => {
    const s = withPending(make([3, 5, 0, 1]), { type: 'gorgée', effect: 3 })
    const talking = applyRoomAction(s, 'h', { type: 'resolve', choice: { targetId: 'b1' } }, NOW, ALWAYS)
    const silent = applyRoomAction(s, 'h', { type: 'resolve', choice: { targetId: 'b1' } }, NOW, SILENT)
    expect(talking.ok && talking.state.speech).toEqual([sp('b1', 1, 'payback')])
    expect(silent.ok && silent.state.speech).toBeUndefined()
    if (!talking.ok || !silent.ok) return
    const { speech: _speech, ...rest } = talking.state
    void _speech
    expect(rest).toEqual(silent.state)
  })

  it('le coup d’un bot aussi, et un coup refusé ne dit rien', () => {
    const s = withPending(make([3, 5, 0, 1], { current: 1 }), { type: 'gorgée', effect: 3 })
    let found = false
    for (let seed = 0; seed < 40 && !found; seed += 1) {
      const t = { ...s, rngState: seed * 7919 + 1 }
      const auto = autoAction(t)
      if (auto.action.type !== 'RESOLVE_INTERACTION' || auto.action.choice?.targetId !== 'h') continue
      found = true
      const res = applyBotAction(t, NOW, ALWAYS)
      expect(res.ok && res.state.speech).toEqual([sp('b1', 1)])
    }
    expect(found).toBe(true)
    expect(applyRoomAction(s, 'h', { type: 'roll' }, NOW, ALWAYS).ok).toBe(false)
  })
})

describe('simulation : parties entières avec des personas, sobriété et validité', () => {
  const NAMES = ['Raoul', 'Josiane', 'Gaston', 'Mauricette', 'Kéké', 'Bernadette', 'Norbert', 'Germaine']

  function play(seed: string, bots: number, humans: number) {
    const rng = createRng(seed)
    const sayRand = () => rng.next()
    const members = Array.from({ length: humans }, (_, i) => ({ userId: `h${i}`, displayName: `Humain ${i}` }))
    let s = buildPetitBuveurEngineState(members, 'normal', seed, bots)
    // Personas tirés au hasard par l'adaptateur : on les fixe pour une simulation rejouable.
    s = { ...s, players: s.players.map((p, i) => (p.isBot ? { ...p, name: NAMES[(i + rng.int(0, 7)) % NAMES.length] } : p)) }
    const writes: { before: EngineState; after: EngineState }[] = []
    for (let guard = 0; guard < 3000 && s.phase !== 'finished'; guard += 1) {
      const deciderId = currentDeciderId(s)!
      const decider = s.players.find((p) => p.id === deciderId)!
      let res
      if (decider.isBot) {
        res = applyBotAction(s, NOW, sayRand)
      } else {
        const { state, action } = autoAction(s)
        const input: RoomActionInput =
          action.type === 'RESOLVE_INTERACTION' ? { type: 'resolve', choice: action.choice } : { type: 'roll' }
        res = applyRoomAction(state, deciderId, input, NOW, sayRand)
      }
      expect(res.ok, `${seed} : ${!res.ok && res.error}`).toBe(true)
      if (!res.ok) break
      writes.push({ before: s, after: res.state })
      s = res.state
    }
    return { state: s, writes }
  }

  it('chaque parole est celle d’un bot à un humain présent, une au plus par coup, plafonnée par bot et par tour de table', () => {
    let total = 0
    let rolls = 0
    for (let i = 0; i < 30; i += 1) {
      const { state, writes } = play(`partie-${i}`, 1 + (i % 6), 1 + (i % 2))
      expect(state.phase).toBe('finished')
      rolls += writes.filter(({ before }) => before.phase === 'playing' && !before.pending).length
      const byId = new Map(state.players.map((p) => [p.id, p]))
      for (const { before, after } of writes) {
        const prev = (before.speech ?? []).filter((x) => x.round === after.turnCount)
        const now = (after.speech ?? []).filter((x) => x.round === after.turnCount)
        const added = now.length - prev.length
        expect(added).toBeLessThanOrEqual(1)
        if (added <= 0) continue
        total += 1
        const said = now[now.length - 1]
        expect(byId.get(said.playerId)?.isBot).toBe(true)
        const target = after.players.find((p) => p.id === said.targetId)
        expect(target && !target.isBot && !target.leftAt).toBe(true)
        expect(now.length).toBeLessThanOrEqual(PB_TABLE_SPEECH_PER_ROUND)
        const mine = now.filter((x) => x.playerId === said.playerId).length
        expect(mine).toBeLessThanOrEqual(Math.min(PB_SPEECH_CAP, botTraitsFor(byId.get(said.playerId)!.name).bavardage))
      }
    }
    // Ni muets ni moulins à paroles : une bulle tous les 2 à 10 lancers.
    expect(total).toBeGreaterThan(rolls / 10)
    expect(total).toBeLessThan(rolls / 2)
  })
})
