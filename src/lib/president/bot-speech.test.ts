import { afterEach, describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createPreState,
  preCloseNeeded,
  prePickBotPlay,
  preRankOf,
  reducePre,
  toPreSpectatorView,
  withPreSpeech,
  PRE_SPEECH_CAP,
  PRE_SPEECH_KINDS,
  type PreSay,
  type PreSpeech,
  type PreSpeechKind,
  type PreState,
} from './engine'
import { presidentBotSpeech, preTalkChance, type PreSpeechEvent } from './bot-speech'
import { withPreBotTalk } from './server-adapter'

const NOW = 1_000_000
// Cartes : rang r, couleur s → r*4+s. Rang 0='3' … 11='A', 12='2'.
const c = (rank: number, suit = 0) => rank * 4 + suit
const always = (v: number) => () => v
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

/** Riqui (humain), Raoul (agressif, bavardage 2), Gépéto (farceur, 3), Bernadette (prudente, 1). */
const SEATS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Gépéto', isBot: true },
  { id: 'b3', name: 'Bernadette', isBot: true },
]

function table(hands: Record<string, number[]>, turnId: string, overrides: Partial<PreState> = {}): PreState {
  const created = createPreState(SEATS, 'seed', NOW, 3)
  const dealt = reducePre(created, { type: 'ADVANCE', claimedKey: phaseKey(created), now: NOW + 5_000 })
  return {
    ...dealt,
    players: dealt.players.map((p) => ({ ...p, hand: hands[p.id] ?? [c(0), c(1), c(2)] })),
    currentTurnId: turnId,
    lastPlay: null,
    trickRun: null,
    trickPlays: [],
    passedIds: [],
    outOrder: [],
    lastExchange: null,
    ...overrides,
  }
}

function play(state: PreState, playerId: string, cards: number[]) {
  const after = reducePre(state, { type: 'PLAY', playerId, cards, now: NOW + 6_000 })
  return { after, event: { type: 'play', playerId, cards } as PreSpeechEvent }
}

const speak = (before: PreState, after: PreState, event: PreSpeechEvent | null, rand: () => number) =>
  presidentBotSpeech(toPreSpectatorView(before), toPreSpectatorView(after), event, rand)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('le coup d’un bot', () => {
  it('le 2 qui coupe la pose d’un humain : « Coupé ! », adressé à l’humain coupé', () => {
    const lead = play(table({ h: [c(3), c(5)], b1: [c(12), c(7)] }, 'h'), 'h', [c(3)]).after
    const { after, event } = play(lead, 'b1', [c(12)])
    expect(speak(lead, after, event, always(0))).toEqual([{ playerId: 'b1', kind: 'cut', targetId: 'h' }])
    expect(speak(lead, after, event, always(0.99))).toEqual([])
  })

  it('l’humain coupe un bot : le bot râle (grumble), seul candidat', () => {
    const lead = play(table({ b3: [c(3), c(5)], h: [c(12), c(7)] }, 'b3'), 'b3', [c(3)]).after
    const { after, event } = play(lead, 'h', [c(12)])
    expect(speak(lead, after, event, always(0))).toEqual([{ playerId: 'b3', kind: 'grumble', targetId: 'h' }])
  })

  it('entre deux bots : le coupeur d’abord ; muet, la victime peut râler — jamais les deux', () => {
    const lead = play(table({ b1: [c(3), c(5)], b2: [c(12), c(7)] }, 'b1'), 'b1', [c(3)]).after
    const { after, event } = play(lead, 'b2', [c(12)])
    expect(speak(lead, after, event, always(0))).toEqual([{ playerId: 'b2', kind: 'cut', targetId: 'b1' }])
    expect(speak(lead, after, event, seq(0.99, 0))).toEqual([{ playerId: 'b1', kind: 'grumble', targetId: 'b2' }])
  })

  it('brelan posé : brag, adressé à qui doit répondre', () => {
    const state = table({ b1: [c(4), c(4, 1), c(4, 2), c(9)] }, 'b1')
    const { after, event } = play(state, 'b1', [c(4), c(4, 1), c(4, 2)])
    expect(after.currentTurnId).toBe('b2')
    expect(speak(state, after, event, always(0))).toEqual([{ playerId: 'b1', kind: 'brag', targetId: 'b2' }])
  })

  it('pose égale : ouRien, adressé au joueur qui doit égaler', () => {
    const lead = play(table({ h: [c(5), c(8)], b1: [c(5, 1), c(9)], b2: [c(5, 2), c(10)] }, 'h'), 'h', [c(5)]).after
    const { after, event } = play(lead, 'b1', [c(5, 1)])
    expect(speak(lead, after, event, always(0))).toEqual([{ playerId: 'b1', kind: 'ouRien', targetId: after.currentTurnId }])
  })

  it('main vidée : out, adressé à qui garde le plus de cartes (comptes publics)', () => {
    const state = table({ b1: [c(6)], h: [c(1), c(2), c(3), c(4)], b2: [c(1, 1)], b3: [c(2, 1), c(3, 1)] }, 'b1')
    const { after, event } = play(state, 'b1', [c(6)])
    expect(after.outOrder).toEqual(['b1'])
    expect(speak(state, after, event, always(0))).toEqual([{ playerId: 'b1', kind: 'out', targetId: 'h' }])
  })

  it('carré fermé hors tour : close à qui a posé la paire, et la victime ne double pas la bulle', () => {
    const lead = play(
      table({ h: [c(7), c(7, 1), c(2)], b2: [c(7, 2), c(7, 3), c(9)] }, 'h'),
      'h',
      [c(7), c(7, 1)]
    ).after
    expect(preCloseNeeded(lead)).toEqual({ rank: 7, count: 2 })
    const after = reducePre(lead, { type: 'CLOSE', playerId: 'b2', cards: [c(7, 2), c(7, 3)], now: NOW + 7_000 })
    const event: PreSpeechEvent = { type: 'close', playerId: 'b2', cards: [c(7, 2), c(7, 3)] }
    expect(speak(lead, after, event, always(0))).toEqual([{ playerId: 'b2', kind: 'close', targetId: 'h' }])
  })

  it('un passe, une pose ordinaire ou une pose humaine sans victime bot : rien', () => {
    const state = table({ h: [c(3), c(5)], b1: [c(4), c(9)] }, 'h')
    const lead = play(state, 'h', [c(3)])
    expect(speak(state, lead.after, lead.event, always(0))).toEqual([])
    const follow = play(lead.after, 'b1', [c(4)])
    expect(speak(lead.after, follow.after, follow.event, always(0))).toEqual([])
    const passed = reducePre(follow.after, { type: 'PASS', playerId: 'b2', now: NOW + 7_000 })
    expect(speak(follow.after, passed, null, always(0))).toEqual([])
  })
})

describe('fin de manche : la distribution des rôles', () => {
  /** b1 et b2 sont sortis ; le dernier coup de l'humain clôt la manche, Bernadette finit Trou. */
  function lastPlay(trouIsHuman = false) {
    const hands = trouIsHuman ? { h: [c(4), c(8)], b3: [c(5)] } : { h: [c(5)], b3: [c(4), c(8)] }
    const state = table({ ...hands, b1: [], b2: [] }, trouIsHuman ? 'b3' : 'h', { outOrder: ['b1', 'b2'] })
    const actor = trouIsHuman ? 'b3' : 'h'
    const card = trouIsHuman ? c(5) : c(5)
    const { after, event } = play(state, actor, [card])
    return { state, after, event }
  }

  it('le Trou boude (sulk) et le Président le chambre (mockTrou) : deux remarques au plus, deux auteurs', () => {
    const { state, after, event } = lastPlay()
    expect(after.phase).toBe('interlude')
    expect(after.lastRanking).toEqual(['b1', 'b2', 'h', 'b3'])
    expect(speak(state, after, event, always(0))).toEqual([
      { playerId: 'b3', kind: 'sulk', targetId: 'b1' },
      { playerId: 'b1', kind: 'mockTrou', targetId: 'b3' },
    ])
  })

  it('un humain Trou : la pique qui le vise passe devant', () => {
    const { state, after, event } = lastPlay(true)
    expect(after.lastRanking).toEqual(['b1', 'b2', 'b3', 'h'])
    const said = speak(state, after, event, always(0))
    expect(said[0]).toEqual({ playerId: 'b1', kind: 'mockTrou', targetId: 'h' })
    expect(said).toHaveLength(2)
    expect(new Set(said.map((s) => s.playerId)).size).toBe(2)
  })

  it('les suiveurs et les prudents saluent le Président (hail), les farceurs et agressifs chambrent', () => {
    const { state, after, event } = lastPlay()
    // b3 (Trou) et b1 (Président) se taisent : Gépéto (farceur) chambre le Trou.
    expect(speak(state, after, event, seq(0.99, 0.99, 0))).toEqual([{ playerId: 'b2', kind: 'mockTrou', targetId: 'b3' }])
    const humble = { ...state, players: state.players.map((p) => (p.id === 'b2' ? { ...p, name: 'Suzette' } : p)) }
    const ended = play(humble, 'h', [c(5)])
    expect(speak(humble, ended.after, ended.event, seq(0.99, 0.99, 0))).toEqual([{ playerId: 'b2', kind: 'hail', targetId: 'b1' }])
  })
})

describe('plafond, sobriété et anti-triche', () => {
  const cutScene = () => {
    const lead = play(table({ h: [c(3), c(5)], b1: [c(12), c(7)] }, 'h'), 'h', [c(3)]).after
    return { lead, ...play(lead, 'b1', [c(12)]) }
  }

  it(`plafond min(${PRE_SPEECH_CAP}, bavardage) par manche : qui l’a atteint se tait, une manche passée ne compte pas`, () => {
    const { lead, after, event } = cutScene()
    const said = (n: number, round: number): PreSpeech[] =>
      Array.from({ length: n }, () => ({ playerId: 'b1', kind: 'brag' as const, targetId: 'h', round }))
    expect(speak({ ...lead, speech: said(2, 0) }, { ...after, speech: said(2, 0) }, event, always(0))).toEqual([])
    expect(speak(lead, { ...after, speech: said(2, 0), manche: 1 }, event, always(0))).toHaveLength(1)
    // Bernadette (bavardage 1) n'a qu'une parole par manche.
    const bern = { ...after, players: after.players.map((p) => (p.id === 'b1' ? { ...p, name: 'Bernadette' } : p)) }
    expect(speak(lead, { ...bern, speech: said(1, 0) }, event, always(0))).toEqual([])
  })

  it('table sans humain présent (parti ou converti) : aucune bulle', () => {
    const { lead, after, event } = cutScene()
    const gone = { ...after, players: after.players.map((p) => (p.id === 'h' ? { ...p, leftAt: NOW } : p)) }
    expect(speak(lead, gone, event, always(0))).toEqual([])
  })

  it('les chances suivent le bavardage et le trait, jamais systématiques', () => {
    const gepeto = botTraitsFor('Gépéto')
    const bernadette = botTraitsFor('Bernadette')
    for (const kind of PRE_SPEECH_KINDS) {
      expect(preTalkChance(kind, gepeto)).toBeGreaterThan(preTalkChance(kind, bernadette) - 0.21)
      expect(preTalkChance(kind, gepeto)).toBeLessThan(1)
    }
    expect(preTalkChance('cut', botTraitsFor('Raoul'))).toBeGreaterThan(preTalkChance('cut', botTraitsFor('Suzette')))
    expect(preTalkChance('grumble', botTraitsFor('Germaine'))).toBeGreaterThan(preTalkChance('grumble', botTraitsFor('Lucien')))
  })

  it('invariance : les mains cachées brouillées ⇒ mêmes bulles (le planificateur ne lit que la vue spectateur)', () => {
    const { lead, after, event } = cutScene()
    const scramble = (s: PreState): PreState => ({
      ...s,
      players: s.players.map((p) => (p.id === 'b1' || p.id === 'h' ? p : { ...p, hand: p.hand.map((x) => (x + 17) % 52) })),
      rngState: 42,
    })
    for (const v of [0, 0.2, 0.4, 0.6]) {
      expect(withPreBotTalk(scramble(lead), scramble(after), event, always(v)).speech).toEqual(
        withPreBotTalk(lead, after, event, always(v)).speech
      )
    }
    const view = toPreSpectatorView(after)
    expect(view.myHand).toEqual([])
  })

  it('pur : ni Math.random ni Date.now ; la parole ne touche que le fil', () => {
    const random = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')
    const { lead, after, event } = cutScene()
    const talked = withPreBotTalk(lead, after, event, always(0))
    expect(random).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
    expect(talked.speech).toEqual([{ playerId: 'b1', kind: 'cut', targetId: 'h', round: 0 }])
    expect({ ...talked, speech: undefined }).toEqual({ ...after, speech: undefined })
  })
})

describe('withPreSpeech', () => {
  const base = () => table({}, 'h')

  it('refuse un humain, un kind inconnu, une cible absente ou soi-même, un plafond atteint', () => {
    const s = base()
    const say = (over: Partial<PreSay>): PreSay => ({ playerId: 'b1', kind: 'brag', targetId: 'h', ...over })
    expect(() => withPreSpeech(s, [say({ playerId: 'h', targetId: 'b1' })])).toThrow('INVALID_SPEECH')
    expect(() => withPreSpeech(s, [say({ kind: 'lie' as PreSpeechKind })])).toThrow('INVALID_SPEECH')
    expect(() => withPreSpeech(s, [say({ targetId: 'nobody' })])).toThrow('INVALID_SPEECH')
    expect(() => withPreSpeech(s, [say({ targetId: 'b1' })])).toThrow('INVALID_SPEECH')
    expect(() => withPreSpeech(s, [say({}), say({}), say({})])).toThrow('ALREADY_SPOKE')
    const left = { ...s, players: s.players.map((p) => (p.id === 'b1' ? { ...p, leftAt: NOW } : p)) }
    expect(() => withPreSpeech(left, [say({})])).toThrow('INVALID_SPEECH')
  })

  it('écrit dans la manche courante sans changer la version ; ne garde que la manche précédente', () => {
    const s = { ...base(), manche: 2, speech: [0, 1, 2].map((round) => ({ playerId: 'b2', kind: 'cut' as const, targetId: 'h', round })) }
    const next = withPreSpeech(s, [{ playerId: 'b1', kind: 'brag', targetId: 'h' }])
    expect(next.version).toBe(s.version)
    expect(next.speech?.map((sp) => sp.round)).toEqual([1, 2, 2])
    expect(withPreSpeech(s, [])).toBe(s)
  })
})

describe('simulation : des parties entières, un humain et trois bots', () => {
  it('chaque parole est acceptée par le moteur, dans le plafond, et chaque kind finit par être dit', () => {
    const seen = new Set<PreSpeechKind>()
    let total = 0
    let manches = 0
    for (let game = 0; game < 60; game += 1) {
      const rng = createRng(`pre-sim-${game}`)
      const rand = () => rng.next()
      const sayRng = createRng(`pre-say-${game}`)
      const sayRand = () => sayRng.next()
      const names = ['Raoul', 'Gépéto', 'Suzette', 'Ginette', 'Bernadette', 'Norbert', 'Germaine', 'Kéké']
      const seats = [
        { id: 'h', name: 'Riqui', isBot: false },
        ...[0, 1, 2].map((i) => ({ id: `b${i}`, name: names[(game + i * 3) % names.length], isBot: true })),
      ]
      let state = createPreState(seats, `pre-${game}`, NOW, 3)
      let now = NOW
      for (let step = 0; step < 3_000 && state.phase !== 'finished'; step += 1) {
        now += 1_000
        const before = state
        let event: PreSpeechEvent | null = null
        if (state.phase !== 'playing') {
          now = Math.max(now, state.phaseEndsAt ?? now)
          state = reducePre(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now })
        } else {
          const needed = preCloseNeeded(state)
          const closer = needed
            ? state.players.find(
                (p) => !p.leftAt && p.hand.filter((x) => preRankOf(x) === needed.rank).length === needed.count
              )
            : undefined
          if (needed && closer && rand() < 0.5) {
            const cards = closer.hand.filter((x) => preRankOf(x) === needed.rank)
            state = reducePre(state, { type: 'CLOSE', playerId: closer.id, cards, now })
            event = { type: 'close', playerId: closer.id, cards }
          } else {
            const actor = state.currentTurnId!
            const cards = prePickBotPlay(state, actor, rand)
            if (cards) {
              state = reducePre(state, { type: 'PLAY', playerId: actor, cards, now })
              event = { type: 'play', playerId: actor, cards }
            } else {
              state = reducePre(state, { type: 'PASS', playerId: actor, now })
            }
          }
        }
        if (before.manche !== state.manche || state.phase === 'finished') manches += 1
        const says = presidentBotSpeech(toPreSpectatorView(before), toPreSpectatorView(state), event, sayRand)
        expect(says.length).toBeLessThanOrEqual(2)
        state = withPreSpeech(state, says)
        for (const say of says) seen.add(say.kind)
        total += says.length
        for (const p of state.players) {
          const mine = (state.speech ?? []).filter((sp) => sp.playerId === p.id && sp.round === state.manche)
          expect(mine.length).toBeLessThanOrEqual(p.isBot ? Math.min(PRE_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0)
        }
      }
      expect(state.phase).toBe('finished')
    }
    expect([...seen].sort()).toEqual([...PRE_SPEECH_KINDS].sort())
    // Sobre : quelques bulles par manche, pas un flot.
    expect(total / manches).toBeGreaterThan(1)
    expect(total / manches).toBeLessThan(6)
  })
})
