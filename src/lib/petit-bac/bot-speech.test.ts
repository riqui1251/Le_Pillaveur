import { afterEach, describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createPbcState,
  reducePbc,
  toPbcSpectatorView,
  PbcEngineError,
  PBC_COUNTDOWN_MS,
  PBC_REVEAL_MIN_MS,
  PBC_SAY_KINDS_OF_PHASE,
  PBC_SPEECH_CAP,
  PBC_STOP_MIN_MS,
  PBC_WRITE_MS,
  type PbcInitialPlayer,
  type PbcSayMove,
  type PbcSpeech,
  type PbcState,
} from './engine'
import { PBC_CITED_MAX, pbcCitedAnswer, pbcRevealSay, pbcStopSay } from './bot-speech'
import { applyPbcRoomAction, markPbcPlayerLeft, parsePbcState, serializePbcState } from './server-adapter'

const T0 = 1_000_000
const ALWAYS = () => 0
const NEVER = () => 0.999

/** Un déserteur converti garde son pseudo humain : aucun persona, voix neutre. */
const BOT: PbcInitialPlayer = { id: 'b1', name: 'Paul', isBot: true }
const H1 = { id: 'h1', name: 'Riqui' }
const H2 = { id: 'h2', name: 'Léa' }
const H3 = { id: 'h3', name: 'Nora' }

/** Partie en écriture, à T0, lettre imposée « B ». */
function make(players: PbcInitialPlayer[], rounds = 3): PbcState {
  const base = createPbcState(players, 'seed', T0 - PBC_COUNTDOWN_MS, rounds)
  const raw: PbcState = { ...base, letters: Array.from({ length: rounds }, () => 'B') }
  return reducePbc(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const FULL = ['Bastien', 'Baleine', 'Brest', 'Boulanger', 'Batman']
const STOP_AT = T0 + PBC_STOP_MIN_MS + 1000
const stop = (s: PbcState, id: string, answers = FULL) =>
  reducePbc(s, { type: 'STOP', playerId: id, answers, now: STOP_AT })
const submit = (s: PbcState, id: string, answers: string[]) =>
  reducePbc(s, { type: 'SUBMIT', playerId: id, answers, now: STOP_AT + 500 })
const say = (s: PbcState, ...moves: PbcSayMove[]) => reducePbc(s, { type: 'SAY', moves })
const view = (s: PbcState) => toPbcSpectatorView(s)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pbcStopSay : « Déjà ?! » au STOP d’un humain', () => {
  it('un bot réagit, vers qui a crié STOP', () => {
    const s = stop(make([H1, H2, BOT]), 'h1')
    expect(s.phase).toBe('flush')
    expect(pbcStopSay(view(s), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'stop', targetId: 'h1' }])
  })

  it('ANTI-FUITE : les copies sont secrètes au gel — la vue lue n’en porte aucune, et la parole ne dépend pas d’elles', () => {
    const a = stop(make([H1, H2, BOT]), 'h1')
    const b = stop(make([H1, H2, BOT]), 'h1', ['Bob', 'Bison', 'Bayonne', 'Banquier', 'Bambi'])
    for (const s of [a, b]) {
      const v = view(s)
      expect(v.revealGrid).toBeNull()
      expect(v.myAnswers).toBeNull()
      expect(JSON.stringify(v)).not.toContain('Bastien')
    }
    expect(JSON.stringify(view(b))).not.toContain('Bambi')
    expect(pbcStopSay(view(a), ALWAYS)).toEqual(pbcStopSay(view(b), ALWAYS))
  })

  it('rien sans STOP (fin au chrono), une seule fois par manche, et au gré du dé', () => {
    const timeUp = reducePbc(make([H1, H2, BOT]), {
      type: 'ADVANCE',
      claimedKey: phaseKey(make([H1, H2, BOT])),
      now: T0 + 200_000,
    })
    expect(timeUp.phase).toBe('flush')
    expect(pbcStopSay(view(timeUp), ALWAYS)).toEqual([])
    const s = stop(make([H1, H2, BOT]), 'h1')
    const once = say(s, ...pbcStopSay(view(s), ALWAYS))
    expect(pbcStopSay(view(once), ALWAYS)).toEqual([])
    expect(pbcStopSay(view(s), NEVER)).toEqual([])
  })
})

describe('pbcRevealSay : la grille commentée à la révélation', () => {
  /** Manche révélée : h1 crie STOP avec FULL, les autres humains rendent `copies`. */
  function revealed(copies: Record<string, string[]>, players: PbcInitialPlayer[] = [H1, H2, H3, BOT]): PbcState {
    let s = stop(make(players), 'h1')
    for (const [id, answers] of Object.entries(copies)) s = submit(s, id, answers)
    expect(s.phase).toBe('reveal')
    return s
  }

  it('un doublon entre humains d’abord (twin), la case citée valant 1 point', () => {
    const s = revealed({ h2: ['Bastien', '', '', '', ''], h3: ['Bob', 'Bison', '', '', ''] })
    const [move] = pbcRevealSay(view(s), ALWAYS)
    expect(move).toMatchObject({ playerId: 'b1', kind: 'twin', category: 0 })
    expect(['h1', 'h2']).toContain(move.targetId)
    expect(s.roundPoints?.[move.targetId ?? '']?.[0]).toBe(1)
  })

  it('sinon une réponse à 2 points d’un humain (contest), citée telle quelle', () => {
    const s = revealed({ h2: ['', '', '', '', ''], h3: ['', '', '', '', ''] })
    const [move] = pbcRevealSay(view(s), ALWAYS)
    expect(move).toMatchObject({ playerId: 'b1', kind: 'contest', targetId: 'h1' })
    const spoken = say(s, move)
    const sp = spoken.speech![0]
    expect(FULL).toContain(pbcCitedAnswer(view(spoken), sp))
    expect(spoken.roundPoints?.h1?.[sp.category!]).toBe(2)
  })

  it('sinon le meneur humain, seul en tête (tease) ; rien à dire : rien', () => {
    let s = make([H1, H2, BOT])
    s = { ...s, players: s.players.map((p) => (p.id === 'h2' ? { ...p, total: 9 } : p)) }
    s = reducePbc(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + 200_000 })
    s = submit(s, 'h1', ['', '', '', '', ''])
    s = submit(s, 'h2', ['', '', '', '', ''])
    expect(s.phase).toBe('reveal')
    expect(pbcRevealSay(view(s), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'tease', targetId: 'h2' }])
    const tie = { ...s, players: s.players.map((p) => (p.id === 'h1' ? { ...p, total: 9 } : p)) }
    expect(pbcRevealSay(view(tie), ALWAYS)).toEqual([])
  })

  it('sobriété : un commentaire par révélation, plafond du bot, et aucun humain présent : rien', () => {
    const s = revealed({ h2: ['', '', '', '', ''], h3: ['', '', '', '', ''] })
    const once = say(s, ...pbcRevealSay(view(s), ALWAYS))
    expect(pbcRevealSay(view(once), ALWAYS)).toEqual([])
    expect(pbcRevealSay(view(s), NEVER)).toEqual([])
    const alone = s.players.reduce(
      (acc, p) => (p.isBot ? acc : reducePbc(acc, { type: 'LEAVE', playerId: p.id, at: STOP_AT + 900 })),
      s
    )
    expect(pbcRevealSay(view(alone), ALWAYS)).toEqual([])
  })
})

describe('pbcCitedAnswer', () => {
  it('raccourcit une longue réponse et rend un tiret hors de la grille', () => {
    let s = stop(make([H1, H2, BOT]), 'h1')
    s = submit(s, 'h2', ['B'.repeat(40), '', '', '', ''])
    const long: PbcSpeech = { playerId: 'b1', kind: 'contest', targetId: 'h2', round: 0, category: 0 }
    const cited = pbcCitedAnswer(view(s), long)
    expect([...cited]).toHaveLength(PBC_CITED_MAX)
    expect(cited.endsWith('…')).toBe(true)
    expect(pbcCitedAnswer({ revealGrid: null }, long)).toBe('—')
  })
})

describe('moteur : SAY, la parole d’un bot', () => {
  it('refuse un kind hors de sa phase, un humain, une mauvaise cible, une case qui ne rapporte pas, et le plafond', () => {
    const err = (fn: () => unknown, code: string) => {
      expect(fn).toThrow(PbcEngineError)
      expect(fn).toThrow(code)
    }
    const writing = make([H1, H2, BOT])
    err(() => say(writing, { playerId: 'b1', kind: 'stop', targetId: 'h1' }), 'NOT_SPEECH_PHASE')
    const flush = stop(writing, 'h1')
    err(() => say(flush, { playerId: 'b1', kind: 'tease', targetId: 'h1' }), 'INVALID_KIND')
    err(() => say(flush, { playerId: 'h2', kind: 'stop', targetId: 'h1' }), 'NOT_BOT')
    err(() => say(flush, { playerId: 'b1', kind: 'stop', targetId: 'h2' }), 'INVALID_TARGET')
    const reveal = submit(flush, 'h2', ['Bastien', '', '', '', ''])
    err(() => say(reveal, { playerId: 'b1', kind: 'contest', targetId: 'h1', category: 0 }), 'INVALID_CATEGORY')
    err(() => say(reveal, { playerId: 'b1', kind: 'twin', targetId: 'h1', category: 1 }), 'INVALID_CATEGORY')
    err(() => say(reveal, { playerId: 'b1', kind: 'contest', targetId: 'h1' }), 'INVALID_CATEGORY')
    const full = say(
      reveal,
      { playerId: 'b1', kind: 'twin', targetId: 'h1', category: 0 },
      { playerId: 'b1', kind: 'contest', targetId: 'h1', category: 1 }
    )
    expect(full.speech).toHaveLength(PBC_SPEECH_CAP)
    err(() => say(full, { playerId: 'b1', kind: 'tease', targetId: 'h1' }), 'ALREADY_SPOKE')
    expect(PBC_SAY_KINDS_OF_PHASE.flush).toEqual(['stop'])
  })

  it('le fil garde la manche qui s’achève, pas celle d’avant ; un état d’avant les paroles se relit', () => {
    let s = stop(make([H1, H2, BOT]), 'h1')
    s = say(s, { playerId: 'b1', kind: 'stop', targetId: 'h1' })
    s = submit(s, 'h2', ['', '', '', '', ''])
    s = reducePbc(s, { type: 'CONTINUE', playerId: 'h1', now: STOP_AT + 500 + PBC_REVEAL_MIN_MS })
    expect(s.phase).toBe('write')
    expect(s.speech?.map((sp) => sp.round)).toEqual([0])
    s = reducePbc(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + 400_000 })
    s = submit(s, 'h1', ['', '', '', '', ''])
    s = submit(s, 'h2', ['', '', '', '', ''])
    s = reducePbc(s, { type: 'CONTINUE', playerId: 'h1', now: T0 + 500_000 })
    expect(s.speech).toEqual([])
    const { speech: _speech, ...legacy } = make([H1, H2, BOT])
    void _speech
    expect(parsePbcState(JSON.stringify(legacy))?.speech).toEqual([])
    const spoken = say(stop(make([H1, H2, BOT]), 'h1'), { playerId: 'b1', kind: 'stop', targetId: 'h1' })
    expect(parsePbcState(serializePbcState(spoken))?.speech).toEqual(spoken.speech)
    expect(view(spoken).speech).toEqual(spoken.speech)
  })
})

describe('adaptateur : la parole naît dans l’écriture qu’elle commente', () => {
  it('le STOP d’un humain gèle la table et fait réagir le bot ; la révélation qui suit est commentée', () => {
    vi.spyOn(Date, 'now').mockReturnValue(STOP_AT)
    const res = applyPbcRoomAction(make([H1, H2, BOT]), 'h1', { type: 'stop', answers: FULL }, ALWAYS)
    expect(res.ok && res.state.phase).toBe('flush')
    if (!res.ok) return
    expect(res.state.speech?.map((sp) => `${sp.kind}>${sp.targetId}`)).toEqual(['stop>h1'])
    const reveal = applyPbcRoomAction(res.state, 'h2', { type: 'submit', answers: ['Bastien', '', '', '', ''] }, ALWAYS)
    expect(reveal.ok && reveal.state.phase).toBe('reveal')
    if (!reveal.ok) return
    expect(reveal.state.speech?.map((sp) => sp.kind)).toEqual(['stop', 'twin'])
  })

  it('STOP qui révèle d’un coup (les autres sont des bots) : la réaction et le commentaire, dans la même écriture', () => {
    vi.spyOn(Date, 'now').mockReturnValue(STOP_AT)
    const res = applyPbcRoomAction(make([H1, BOT]), 'h1', { type: 'stop', answers: FULL }, ALWAYS)
    expect(res.ok && res.state.phase).toBe('reveal')
    if (!res.ok) return
    expect(res.state.speech?.map((sp) => sp.kind)).toEqual(['stop', 'contest'])
    expect(res.state.speech).toHaveLength(Math.min(PBC_SPEECH_CAP, botTraitsFor('Paul').bavardage))
  })

  it('le départ du dernier attendu révèle la grille : elle est commentée aussi', () => {
    let s = stop(make([H1, H2, H3, BOT]), 'h1')
    s = submit(s, 'h2', ['', '', '', '', ''])
    const left = markPbcPlayerLeft(s, 'h3', STOP_AT + 800, ALWAYS)
    expect(left?.phase).toBe('reveal')
    expect(left?.speech?.map((sp) => sp.kind)).toEqual(['contest'])
  })
})

describe('simulation : sobriété et validité sur des parties entières', () => {
  it('chaque parole est celle d’un bot à un humain, une au STOP et une à la révélation au plus, min(2, bavardage) par bot', () => {
    let total = 0
    for (let i = 0; i < 40; i += 1) {
      const rng = createRng(`pbc-${i}`)
      const rand = () => rng.next()
      const humans = [H1, H2, H3].slice(0, 1 + (i % 3))
      const bots = Array.from({ length: 1 + (i % 2) }, (_, k) => ({ id: `b${k}`, name: `Déserteur ${k}`, isBot: true }))
      let s = make([...humans, ...bots], 3)
      const now = vi.spyOn(Date, 'now')
      let clock = STOP_AT
      const spoken: PbcSpeech[] = []
      for (let guard = 0; guard < 60 && s.phase !== 'finished'; guard += 1) {
        clock += 1000
        now.mockReturnValue(clock)
        const before = s.speech ?? []
        let res
        const waiting = humans.find((h) => !s.answers[h.id])
        if (s.phase === 'write' && rng.next() < 0.7) {
          clock = Math.max(clock, s.phaseEndsAt! - PBC_WRITE_MS + PBC_STOP_MIN_MS + 1000)
          now.mockReturnValue(clock)
          const answers = FULL.map((a, c) => (rng.next() < 0.5 ? a : `${a}${c}`))
          res = applyPbcRoomAction(s, humans[0].id, { type: 'stop', answers }, rand)
        } else if (s.phase === 'flush' && waiting) {
          const answers = FULL.map((a) => (rng.next() < 0.4 ? a : ''))
          res = applyPbcRoomAction(s, waiting.id, { type: 'submit', answers }, rand)
        } else if (s.phase === 'write' || s.phase === 'flush') {
          clock = s.phaseEndsAt!
          now.mockReturnValue(clock)
          res = applyPbcRoomAction(s, 'h1', { type: 'advance', phaseKey: phaseKey(s) }, rand)
        } else {
          clock += PBC_REVEAL_MIN_MS
          now.mockReturnValue(clock)
          res = applyPbcRoomAction(s, 'h1', { type: 'continue' }, rand)
        }
        expect(res.ok, `pbc-${i} ${s.phase} : ${!res.ok && res.error}`).toBe(true)
        if (!res.ok) break
        const known = new Set(before.map((sp) => JSON.stringify(sp)))
        for (const sp of res.state.speech ?? []) if (!known.has(JSON.stringify(sp))) spoken.push(sp)
        s = res.state
      }
      vi.restoreAllMocks()
      expect(s.phase).toBe('finished')
      total += spoken.length
      for (let round = 0; round < 3; round += 1) {
        const mine = spoken.filter((sp) => sp.round === round)
        expect(mine.filter((sp) => sp.kind === 'stop').length).toBeLessThanOrEqual(1)
        expect(mine.filter((sp) => sp.kind !== 'stop').length).toBeLessThanOrEqual(1)
        for (const sp of mine) {
          expect(sp.playerId.startsWith('b')).toBe(true)
          expect(sp.targetId?.startsWith('h')).toBe(true)
          expect(mine.filter((x) => x.playerId === sp.playerId).length).toBeLessThanOrEqual(PBC_SPEECH_CAP)
        }
      }
    }
    expect(total).toBeGreaterThan(20)
    expect(total).toBeLessThan(240)
  })
})
