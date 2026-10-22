import { afterEach, describe, expect, it, vi } from 'vitest'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createPurpleState,
  purpleSpeechRound,
  reducePurple,
  toPurpleClientView,
  withPurpleSpeech,
  PURPLE_SPEECH_CAP,
  PURPLE_SPEECH_KINDS,
  type PurpleBet,
  type PurpleCard,
  type PurpleSay,
  type PurpleSpeech,
  type PurpleSpeechKind,
  type PurpleState,
} from './engine'
import { purpleBotSpeech, purpleTalkChance, type PurpleSpeechEvent } from './bot-speech'
import { withPurpleBotTalk } from './server-adapter'

const always = (v: number) => () => v
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}
const RED: PurpleCard = { value: '5', suit: '♥', color: 'red' }
const BLACK: PurpleCard = { value: '9', suit: '♠', color: 'black' }

/** Riqui (humain), Raoul (agressif), Gépéto (farceur, bavardage 3), Bernadette (prudente, 1). */
function table(currentPlayer: number, deck: PurpleCard[], overrides: Partial<PurpleState> = {}): PurpleState {
  const s = createPurpleState(
    [
      { id: 'h', name: 'Riqui' },
      { id: 'b1', name: 'Raoul', isBot: true },
      { id: 'b2', name: 'Gépéto', isBot: true },
      { id: 'b3', name: 'Bernadette', isBot: true },
    ],
    'seed'
  )
  return { ...s, currentPlayer, deck: [...deck, ...s.deck], ...overrides }
}

function bet(state: PurpleState, bet: PurpleBet) {
  const playerId = state.players[state.currentPlayer].id
  const after = reducePurple(state, { type: 'BET', playerId, bet })
  return { after, event: { type: 'bet', playerId, bet } as PurpleSpeechEvent }
}

const speak = (before: PurpleState, after: PurpleState, event: PurpleSpeechEvent, rand: () => number) =>
  purpleBotSpeech(toPurpleClientView(before), toPurpleClientView(after), event, rand)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('le coup et ses réactions', () => {
  it('pari d’au moins deux cartes gagné par un bot : panache, adressé au suivant', () => {
    const state = table(2, [RED, RED])
    const { after, event } = bet(state, 'double-rouge')
    expect(after.isCorrect).toBe(true)
    expect(speak(state, after, event, always(0))).toEqual([{ playerId: 'b2', kind: 'panache', targetId: 'b3' }])
    const single = bet(table(2, [RED]), 'rouge')
    expect(speak(table(2, [RED]), single.after, single.event, always(0))).toEqual([])
  })

  it('l’humain boit : UN bot, tiré au sort, le chambre (mock)', () => {
    const state = table(0, [RED])
    const { after, event } = bet(state, 'noir')
    expect(after.pendingReveal).toBe(true)
    expect(speak(state, after, event, always(0))).toEqual([{ playerId: 'b1', kind: 'mock', targetId: 'h' }])
    expect(speak(state, after, event, seq(0.9, 0))).toEqual([{ playerId: 'b3', kind: 'mock', targetId: 'h' }])
    expect(speak(state, after, event, always(0.99))).toEqual([])
  })

  it('un bot boit : il se lamente auprès du suivant ; s’il se tait, un autre bot peut le chambrer', () => {
    const state = table(3, [RED])
    const { after, event } = bet(state, 'noir')
    // Le suivant de Bernadette est Riqui : la lamentation vise un humain, elle passe devant.
    expect(speak(state, after, event, always(0))).toEqual([{ playerId: 'b3', kind: 'lament', targetId: 'h' }])
    expect(speak(state, after, event, seq(0, 0.99, 0))).toEqual([{ playerId: 'b1', kind: 'mock', targetId: 'b3' }])
  })

  it('un bot continue sur une cagnotte chargée : dare ; il passe la main : handOff au nouveau porteur', () => {
    const won = bet(table(1, [RED, RED, BLACK]), 'double-rouge').after
    const loaded = { ...won, drinkCounter: 4 }
    const going = reducePurple(loaded, { type: 'CONTINUE', playerId: 'b1' })
    expect(speak(loaded, going, { type: 'continue', playerId: 'b1' }, always(0))).toEqual([
      { playerId: 'b1', kind: 'dare', targetId: 'b2' },
    ])
    const light = { ...won, drinkCounter: 2 }
    expect(
      speak(light, reducePurple(light, { type: 'CONTINUE', playerId: 'b1' }), { type: 'continue', playerId: 'b1' }, always(0))
    ).toEqual([])
    const passed = reducePurple(loaded, { type: 'PASS', playerId: 'b1' })
    expect(speak(loaded, passed, { type: 'pass', playerId: 'b1' }, always(0))).toEqual([
      { playerId: 'b1', kind: 'handOff', targetId: 'b2' },
    ])
  })

  it('un humain qui continue ou passe ne fait parler personne', () => {
    const won = bet(table(0, [RED, RED]), 'double-rouge').after
    const passed = reducePurple(won, { type: 'PASS', playerId: 'h' })
    expect(speak(won, passed, { type: 'pass', playerId: 'h' }, always(0))).toEqual([])
  })
})

describe('plafond, sobriété et anti-triche', () => {
  const loss = () => {
    const state = table(0, [RED])
    return { state, ...bet(state, 'noir') }
  }

  it(`plafond min(${PURPLE_SPEECH_CAP}, bavardage) par fenêtre de tours : qui l’a atteint se tait`, () => {
    const { state, after, event } = loss()
    const said = (id: string, n: number, round: number): PurpleSpeech[] =>
      Array.from({ length: n }, () => ({ playerId: id, kind: 'panache' as const, targetId: 'h', round }))
    const full = [...said('b1', 2, 0), ...said('b2', 2, 0), ...said('b3', 1, 0)]
    expect(speak(state, { ...after, speech: full }, event, always(0))).toEqual([])
    expect(speak(state, { ...after, speech: full, turn: 8 }, event, always(0))).toHaveLength(1)
  })

  it('table sans humain présent : aucune bulle', () => {
    const { state, after, event } = loss()
    const gone = { ...after, players: after.players.map((p) => (p.id === 'h' ? { ...p, leftAt: 1 } : p)) }
    expect(speak(state, gone, event, always(0))).toEqual([])
  })

  it('invariance : le paquet restant brouillé ⇒ mêmes bulles (le planificateur ne voit pas la carte suivante)', () => {
    const { state, after, event } = loss()
    const shuffled = { ...after, deck: [...after.deck].reverse(), rngState: 99 }
    for (const v of [0, 0.3, 0.6, 0.9]) {
      expect(withPurpleBotTalk(state, shuffled, event, always(v)).speech).toEqual(
        withPurpleBotTalk(state, after, event, always(v)).speech
      )
    }
    expect(toPurpleClientView(after).deck.every((c) => c.value === '')).toBe(true)
  })

  it('pur : ni Math.random ni Date.now ; la parole ne touche que le fil', () => {
    const random = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')
    const { state, after, event } = loss()
    const talked = withPurpleBotTalk(state, after, event, always(0))
    expect(random).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
    expect(talked.speech).toEqual([{ playerId: 'b1', kind: 'mock', targetId: 'h', round: 0 }])
    expect({ ...talked, speech: undefined, speechBase: undefined }).toEqual({ ...after, speech: undefined, speechBase: undefined })
  })

  it('les chances suivent le bavardage, l’audace et le trait, jamais systématiques', () => {
    for (const kind of PURPLE_SPEECH_KINDS) expect(purpleTalkChance(kind, botTraitsFor('Gépéto'), 10)).toBeLessThan(1)
    expect(purpleTalkChance('panache', botTraitsFor('Dédé'))).toBeGreaterThan(purpleTalkChance('panache', botTraitsFor('Huguette')))
    expect(purpleTalkChance('mock', botTraitsFor('Paulette'), 5)).toBeGreaterThan(purpleTalkChance('mock', botTraitsFor('Paulette'), 1))
  })
})

describe('moteur : tours et fil', () => {
  it('passer, refermer le verdict ou partir au tour passent la main : un tour de plus', () => {
    const won = bet(table(0, [RED, RED, BLACK]), 'double-rouge').after
    expect(reducePurple(won, { type: 'PASS', playerId: 'h' }).turn).toBe(1)
    const lost = bet(table(0, [RED]), 'noir').after
    expect(reducePurple(lost, { type: 'CLOSE_REVEAL', playerId: 'h' }).turn).toBe(1)
    expect(reducePurple(table(0, []), { type: 'LEAVE', playerId: 'h', at: 1 }).turn).toBe(1)
    expect(reducePurple(won, { type: 'CONTINUE', playerId: 'h' }).turn).toBe(0)
    // Un état d'avant les paroles (sans turn) repart de 0.
    const legacy = { ...won, turn: undefined }
    expect(reducePurple(legacy, { type: 'PASS', playerId: 'h' }).turn).toBe(1)
  })

  it('fenêtre : six tours au moins, un tour de table au-delà', () => {
    const s = table(0, [])
    expect(purpleSpeechRound({ ...s, turn: 5 })).toBe(0)
    expect(purpleSpeechRound({ ...s, turn: 6 })).toBe(1)
    expect(purpleSpeechRound({ players: Array.from({ length: 8 }), turn: 7 })).toBe(0)
  })

  it('withPurpleSpeech refuse un humain, un kind inconnu, une cible absente ou soi-même, un plafond atteint', () => {
    const s = table(0, [])
    const say = (over: Partial<PurpleSay>): PurpleSay => ({ playerId: 'b1', kind: 'mock', targetId: 'h', ...over })
    expect(() => withPurpleSpeech(s, [say({ playerId: 'h', targetId: 'b1' })])).toThrow('INVALID_SPEECH')
    expect(() => withPurpleSpeech(s, [say({ kind: 'oracle' as PurpleSpeechKind })])).toThrow('INVALID_SPEECH')
    expect(() => withPurpleSpeech(s, [say({ targetId: 'nobody' })])).toThrow('INVALID_SPEECH')
    expect(() => withPurpleSpeech(s, [say({ targetId: 'b1' })])).toThrow('INVALID_SPEECH')
    expect(() => withPurpleSpeech(s, [say({}), say({}), say({})])).toThrow('ALREADY_SPOKE')
  })

  it('le fil garde deux fenêtres et compte l’élagué ; la version ne bouge pas', () => {
    const old: PurpleSpeech[] = [0, 0, 1, 2].map((round) => ({ playerId: 'b3', kind: 'lament', targetId: 'h', round }))
    const s = { ...table(0, []), turn: 13, speech: old, speechBase: 2 }
    const next = withPurpleSpeech(s, [{ playerId: 'b1', kind: 'mock', targetId: 'h' }])
    expect(next.speech?.map((sp) => sp.round)).toEqual([1, 2, 2])
    expect(next.speechBase).toBe(4)
    expect(next.version).toBe(s.version)
  })
})

describe('simulation : des parties entières, un humain et trois bots', () => {
  it('chaque parole est acceptée par le moteur, dans le plafond, et chaque kind finit par être dit', () => {
    const seen = new Set<PurpleSpeechKind>()
    let total = 0
    let turns = 0
    const BETS: PurpleBet[] = ['rouge', 'noir', 'purple', 'double-rouge', 'double-noir', 'double-purple']
    for (let game = 0; game < 40; game += 1) {
      const rng = createRng(`purple-sim-${game}`)
      const rand = () => rng.next()
      const sayRng = createRng(`purple-say-${game}`)
      const sayRand = () => sayRng.next()
      const names = ['Raoul', 'Gépéto', 'Suzette', 'Ginette', 'Bernadette', 'Norbert', 'Germaine', 'Kéké']
      let state = createPurpleState(
        [
          { id: 'h', name: 'Riqui' },
          ...[0, 1, 2].map((i) => ({ id: `b${i}`, name: names[(game + i * 3) % names.length], isBot: true })),
        ],
        `purple-${game}`
      )
      for (let step = 0; step < 400; step += 1) {
        const before = state
        const actor = state.players[state.currentPlayer].id
        let event: PurpleSpeechEvent | null = null
        if (state.pendingReveal) {
          state = reducePurple(state, { type: 'CLOSE_REVEAL', playerId: actor })
        } else if (state.canContinue) {
          const move = rand() < 0.5 ? 'continue' : 'pass'
          state = reducePurple(state, { type: move === 'continue' ? 'CONTINUE' : 'PASS', playerId: actor })
          event = { type: move, playerId: actor }
        } else {
          const choice = BETS[Math.floor(rand() * BETS.length)]
          state = reducePurple(state, { type: 'BET', playerId: actor, bet: choice })
          event = { type: 'bet', playerId: actor, bet: choice }
        }
        if (event) {
          const says = purpleBotSpeech(toPurpleClientView(before), toPurpleClientView(state), event, sayRand)
          expect(says.length).toBeLessThanOrEqual(1)
          state = withPurpleSpeech(state, says)
          for (const say of says) seen.add(say.kind)
          total += says.length
        }
        const round = purpleSpeechRound(state)
        for (const p of state.players) {
          const mine = (state.speech ?? []).filter((sp) => sp.playerId === p.id && sp.round === round)
          expect(mine.length).toBeLessThanOrEqual(p.isBot ? Math.min(PURPLE_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0)
        }
      }
      turns += state.turn ?? 0
    }
    expect([...seen].sort()).toEqual([...PURPLE_SPEECH_KINDS].sort())
    // Sobre : moins d'une bulle par tour de jeu.
    expect(total / turns).toBeGreaterThan(0.1)
    expect(total / turns).toBeLessThan(0.5)
  })
})
