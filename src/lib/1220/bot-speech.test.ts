import { afterEach, describe, expect, it, vi } from 'vitest'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { createRng } from '@/lib/petit-buveur/rng'
import { evaluatePlayerRoll1220 } from '@/lib/game-1220'
import {
  createGame1220State,
  reduceGame1220,
  toGame1220ClientView,
  withGame1220Speech,
  GAME_1220_SPEECH_CAP,
  GAME_1220_SPEECH_KINDS,
  GAME_1220_SPEECH_WINDOW,
  type Game1220Say,
  type Game1220Speech,
  type Game1220SpeechKind,
  type Game1220State,
} from './engine'
import { game1220BotSpeech, GAME_1220_TALK } from './bot-speech'
import { reactionTalkChance } from '@/lib/online/reaction-speech'
import { withGame1220BotTalk } from './server-adapter'

const always = (v: number) => () => v
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

/** Riqui (humain) et trois bots aux paris par défaut : pair, 11-20, boire au 7, donner au 13. */
function table(humanDrink = 7): Game1220State {
  const s = createGame1220State(
    [
      { id: 'h', name: 'Riqui' },
      { id: 'b1', name: 'Raoul', isBot: true },
      { id: 'b2', name: 'Gépéto', isBot: true },
      { id: 'b3', name: 'Bernadette', isBot: true },
    ],
    'seed',
    1_000
  )
  const drafted = reduceGame1220(s, { type: 'SET_DRAFT', playerId: 'h', choices: { drinkNumber: humanDrink } })
  const ready = reduceGame1220(drafted, { type: 'READY', playerId: 'h' })
  expect(ready.phase).toBe('play')
  return ready
}

/** Un lancer aux dés CHOISIS, évalué comme le moteur (ROLL ne laisse pas choisir ses dés). */
function rolled(state: Game1220State, d12: number, d20: number): Game1220State {
  const results = state.configs!.map((cfg) => {
    const r = evaluatePlayerRoll1220(d12, d20, cfg)
    return {
      playerId: cfg.playerId,
      name: cfg.name,
      drinkSips: r.drinkSips,
      giveEffective: r.giveEffective,
      giveReasons: r.giveReasons.map((g) => g.id),
      partialHit: r.partialHit,
      partialNumbers: r.partialNumbers,
    }
  })
  const entry = { d12, d20, results }
  return { ...state, lastRoll: entry, history: [entry, ...state.history], rollCount: state.rollCount + 1 }
}

const speak = (s: Game1220State, rand: () => number, roller = 'h') => game1220BotSpeech(toGame1220ClientView(s), roller, rand)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('les réactions au lancer', () => {
  it('l’humain boit : UN bot, tiré au sort, le chambre (mock) — avant ses propres malheurs', () => {
    const after = rolled(table(), 3, 4)
    expect(after.lastRoll!.results.every((r) => r.drinkSips === 1)).toBe(true)
    expect(speak(after, always(0))).toEqual([{ playerId: 'b1', kind: 'mock', targetId: 'h' }])
    expect(speak(after, seq(0.9, 0))).toEqual([{ playerId: 'b3', kind: 'mock', targetId: 'h' }])
  })

  it('seuls les bots boivent : l’un d’eux s’en prend au lanceur (jinx)', () => {
    const after = rolled(table(8), 3, 4)
    expect(speak(after, always(0))).toEqual([{ playerId: 'b1', kind: 'jinx', targetId: 'h' }])
    expect(speak(after, always(0.99))).toEqual([])
  })

  it('le chiffre « donner » d’un bot sort : bullseye ; il distribue large : gift ; un chiffre sur un seul dé : almost', () => {
    expect(speak(rolled(table(8), 6, 7), always(0))).toEqual([{ playerId: 'b1', kind: 'bullseye', targetId: 'h' }])
    const wide = rolled(table(8), 2, 10)
    expect(wide.lastRoll!.results.find((r) => r.playerId === 'b1')!.giveEffective).toBe(2)
    expect(speak(wide, always(0))).toEqual([{ playerId: 'b1', kind: 'gift', targetId: 'h' }])
    const near = rolled(table(9), 7, 1)
    expect(near.lastRoll!.results.find((r) => r.playerId === 'b1')!.partialHit).toBe(true)
    expect(speak(near, always(0))).toEqual([{ playerId: 'b1', kind: 'almost', targetId: 'h' }])
  })

  it('un lancer sans histoire (rien bu, peu donné, aucun chiffre) : rien', () => {
    const quiet = rolled(table(8), 1, 2)
    expect(quiet.lastRoll!.results.every((r) => r.drinkSips === 0 && r.giveEffective < 2 && !r.partialHit)).toBe(true)
    expect(speak(quiet, always(0))).toEqual([])
  })
})

describe('plafond, sobriété et anti-triche', () => {
  it(`plafond min(${GAME_1220_SPEECH_CAP}, bavardage) sur ${GAME_1220_SPEECH_WINDOW} lancers : qui l’a atteint se tait`, () => {
    const after = rolled(table(), 3, 4)
    const round = after.rollCount
    const said = (id: string, n: number, r: number): Game1220Speech[] =>
      Array.from({ length: n }, () => ({ playerId: id, kind: 'jinx' as const, targetId: 'h', round: r }))
    const full = [...said('b1', 2, round - 1), ...said('b2', 2, round - 2), ...said('b3', 1, round - 3)]
    expect(speak({ ...after, speech: full }, always(0))).toEqual([])
    const old = [...said('b1', 2, round - GAME_1220_SPEECH_WINDOW), ...said('b2', 2, round - 2), ...said('b3', 1, round - 3)]
    expect(speak({ ...after, speech: old }, always(0))).toEqual([{ playerId: 'b1', kind: 'mock', targetId: 'h' }])
  })

  it('table sans humain présent : aucune bulle', () => {
    const after = rolled(table(), 3, 4)
    const gone = { ...after, players: after.players.map((p) => (p.id === 'h' ? { ...p, leftAt: 1 } : p)) }
    expect(speak(gone, always(0))).toEqual([])
  })

  it('invariance : la graine des dés changée ⇒ mêmes bulles (le planificateur ne voit pas le lancer suivant)', () => {
    const after = rolled(table(), 3, 4)
    for (const v of [0, 0.3, 0.6, 0.9]) {
      expect(withGame1220BotTalk({ ...after, rngState: 12345 }, 'h', always(v)).speech).toEqual(
        withGame1220BotTalk(after, 'h', always(v)).speech
      )
    }
    expect('rngState' in toGame1220ClientView(after)).toBe(false)
  })

  it('pur : ni Math.random ni Date.now ; la parole ne touche que le fil', () => {
    const after = rolled(table(), 3, 4)
    const random = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')
    const talked = withGame1220BotTalk(after, 'h', always(0))
    expect(random).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
    expect(talked.speech).toEqual([{ playerId: 'b1', kind: 'mock', targetId: 'h', round: 1 }])
    expect({ ...talked, speech: undefined, speechBase: undefined }).toEqual({ ...after, speech: undefined, speechBase: undefined })
  })

  it('les chances suivent le bavardage, jamais systématiques', () => {
    const chance = (kind: Game1220SpeechKind, name: string) => reactionTalkChance(GAME_1220_TALK[kind], botTraitsFor(name))
    for (const kind of GAME_1220_SPEECH_KINDS) {
      expect(chance(kind, 'Josiane')).toBeLessThan(1)
      expect(chance(kind, 'Josiane')).toBeGreaterThan(chance(kind, 'Germaine'))
    }
  })
})

describe('moteur : lancers et fil', () => {
  it('la « manche » des paroles est le lancer : rollCount, qui avance à chaque lancer', () => {
    const s = table()
    expect(s.rollCount).toBe(0)
    const once = withGame1220Speech(reduceGame1220(s, { type: 'ROLL', playerId: 'h' }), [
      { playerId: 'b1', kind: 'jinx', targetId: 'h' },
    ])
    expect(once.rollCount).toBe(1)
    expect(once.speech).toEqual([{ playerId: 'b1', kind: 'jinx', targetId: 'h', round: 1 }])
  })

  it('withGame1220Speech refuse un humain, un kind inconnu, une cible absente ou soi-même, un plafond atteint', () => {
    const s = rolled(table(), 3, 4)
    const say = (over: Partial<Game1220Say>): Game1220Say => ({ playerId: 'b1', kind: 'mock', targetId: 'h', ...over })
    expect(() => withGame1220Speech(s, [say({ playerId: 'h', targetId: 'b1' })])).toThrow('INVALID_SPEECH')
    expect(() => withGame1220Speech(s, [say({ kind: 'prophecy' as Game1220SpeechKind })])).toThrow('INVALID_SPEECH')
    expect(() => withGame1220Speech(s, [say({ targetId: 'nobody' })])).toThrow('INVALID_SPEECH')
    expect(() => withGame1220Speech(s, [say({ targetId: 'b1' })])).toThrow('INVALID_SPEECH')
    expect(() => withGame1220Speech(s, [say({}), say({}), say({})])).toThrow('ALREADY_SPOKE')
  })

  it(`le fil garde ${GAME_1220_SPEECH_WINDOW} lancers et compte l’élagué ; la version ne bouge pas`, () => {
    const old: Game1220Speech[] = [1, 2, 3, 4, 5].map((round) => ({ playerId: 'b3', kind: 'jinx', targetId: 'h', round }))
    const s = { ...rolled(table(), 3, 4), rollCount: 6, speech: old, speechBase: 1 }
    const next = withGame1220Speech(s, [{ playerId: 'b1', kind: 'mock', targetId: 'h' }])
    expect(next.speech?.map((sp) => sp.round)).toEqual([3, 4, 5, 6])
    expect(next.speechBase).toBe(3)
    expect(next.version).toBe(s.version)
  })
})

describe('simulation : des centaines de lancers, un humain et trois bots', () => {
  it('chaque parole est acceptée par le moteur, dans le plafond, et chaque kind finit par être dit', () => {
    const seen = new Set<Game1220SpeechKind>()
    let total = 0
    let rolls = 0
    for (let game = 0; game < 30; game += 1) {
      const sayRng = createRng(`g1220-say-${game}`)
      const sayRand = () => sayRng.next()
      const names = ['Raoul', 'Gépéto', 'Suzette', 'Ginette', 'Bernadette', 'Norbert', 'Germaine', 'Kéké']
      let state = createGame1220State(
        [
          { id: 'h', name: 'Riqui' },
          ...[0, 1, 2].map((i) => ({ id: `b${i}`, name: names[(game + i * 3) % names.length], isBot: true })),
        ],
        `g1220-${game}`,
        1_000
      )
      state = reduceGame1220(state, { type: 'SET_DRAFT', playerId: 'h', choices: { drinkNumber: 5 + (game % 10), giveNumber: 20 } })
      state = reduceGame1220(state, { type: 'READY', playerId: 'h' })
      for (let i = 0; i < 40; i += 1) {
        state = reduceGame1220(state, { type: 'ROLL', playerId: 'h' })
        rolls += 1
        const says = game1220BotSpeech(toGame1220ClientView(state), 'h', sayRand)
        expect(says.length).toBeLessThanOrEqual(1)
        state = withGame1220Speech(state, says)
        for (const say of says) seen.add(say.kind)
        total += says.length
        for (const p of state.players) {
          const mine = (state.speech ?? []).filter((sp) => sp.playerId === p.id)
          expect(mine.length).toBeLessThanOrEqual(p.isBot ? Math.min(GAME_1220_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0)
        }
      }
    }
    expect([...seen].sort()).toEqual([...GAME_1220_SPEECH_KINDS].sort())
    // Sobre : une bulle tous les quatre à huit lancers, jamais un commentaire par lancer.
    expect(total / rolls).toBeGreaterThan(0.1)
    expect(total / rolls).toBeLessThan(0.35)
  })
})
