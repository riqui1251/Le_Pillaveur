import { describe, expect, it } from 'vitest'
import { botTraitsFor, BOT_PERSONAS } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createDilState,
  dilActive,
  reduceDil,
  toDilClientView,
  toDilSpectatorView,
  DIL_COUNTDOWN_MS,
  DIL_SAY_KINDS,
  DIL_SPEECH_CAP,
  type DilCard,
  type DilSay,
  type DilState,
} from './engine'
import { applyDilBotAction, parseDilState } from './server-adapter'
import { dilBotSay, DIL_VOTE_TALK_MAX } from './bot-speech'
import { dilRevealReactions, DIL_REVEAL_REACTIONS_MAX } from './reveal-reactions'

/**
 * Paroles des bots de Dilemmes : une bulle jointe au vote, acceptée par le
 * moteur, sobre (une par manche pendant le vote, min(2, bavardage) par bot),
 * jamais sans humain à table — et le vote reste secret : ni le choix du bot
 * ni celui des autres ne fait varier ce qu'il dit.
 */

const T0 = 1_000_000
const PREFER: DilCard = { kind: 'prefer', a: 'option A', b: 'option B' }
const NEVER: DilCard = { kind: 'never', text: 'dormi au travail' }
const WHO: DilCard = { kind: 'who', text: 'finirait en garde à vue en premier ?' }

type Seat = { id: string; name: string; isBot?: boolean }
const human = (id: string, name = id): Seat => ({ id, name })
const bot = (id: string, name: string): Seat => ({ id, name, isBot: true })

/** Vote ouvert sur `cards` (la première d'abord). */
function table(seats: Seat[], cards: DilCard[] = [PREFER], seed = 'seed'): DilState {
  const raw = createDilState(seats, cards, seed, T0 - DIL_COUNTDOWN_MS, cards.length)
  // Ordre des cartes imposé : le moteur les mélange à la création.
  const ordered = { ...raw, cards }
  return reduceDil(ordered, { type: 'ADVANCE', claimedKey: phaseKey(ordered), now: T0 })
}

const choiceFor = (s: DilState, id: string, pickA = true) =>
  s.cards[s.round].kind === 'who' ? s.players.find((p) => p.id !== id && !p.leftAt)!.id : pickA ? 'A' : 'B'
const vote = (s: DilState, id: string, say?: DilSay, pickA = true) =>
  reduceDil(s, { type: 'VOTE', playerId: id, choice: choiceFor(s, id, pickA), now: T0, say })

const ZERO = () => 0
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}
const say = (s: DilState, botId: string, rand: () => number) => {
  const p = s.players.find((x) => x.id === botId)!
  return dilBotSay(toDilClientView(s, botId), botId, botTraitsFor(p.name), rand)
}

const SEATS = [human('h', 'Riqui'), human('l', 'Léa'), bot('k', 'Kéké'), bot('b', 'Bernadette'), bot('g', 'Gépéto')]

describe('moteur : la parole jointe au vote', () => {
  it('un bot l’écrit dans la même réduction que son vote, pour la manche en cours', () => {
    const s = table(SEATS)
    const next = vote(s, 'k', { kind: 'easy', targetId: 'h' })
    expect(next.speech).toEqual([{ playerId: 'k', kind: 'easy', targetId: 'h', round: 0 }])
    expect(next.version).toBe(s.version + 1)
  })

  it('refuse un humain qui parle, une réaction, confess hors « Je n’ai jamais », une cible absente, soi-même ou partie', () => {
    const s = table(SEATS)
    expect(() => vote(s, 'h', { kind: 'easy', targetId: 'l' })).toThrow('INVALID_KIND')
    expect(() => vote(s, 'k', { kind: 'twin', targetId: 'h' })).toThrow('INVALID_KIND')
    expect(() => vote(s, 'k', { kind: 'confess', targetId: 'h' })).toThrow('INVALID_KIND')
    expect(vote(table(SEATS, [NEVER]), 'k', { kind: 'confess', targetId: 'h' }).speech).toHaveLength(1)
    expect(() => vote(s, 'k', { kind: 'easy', targetId: 'k' })).toThrow('INVALID_TARGET')
    expect(() => vote(s, 'k', { kind: 'easy', targetId: 'zz' })).toThrow('INVALID_TARGET')
    const gone = reduceDil(s, { type: 'LEAVE', playerId: 'l', at: T0 })
    expect(() => vote(gone, 'k', { kind: 'easy', targetId: 'l' })).toThrow('INVALID_TARGET')
  })

  it('deux paroles par bot et par manche ; celles d’une autre manche ne comptent pas', () => {
    const s = table(SEATS)
    const full: DilState = {
      ...s,
      speech: [
        { playerId: 'k', kind: 'easy', targetId: 'h', round: 0 },
        { playerId: 'k', kind: 'tough', targetId: 'h', round: 0 },
      ],
    }
    expect(DIL_SPEECH_CAP).toBe(2)
    expect(() => vote(full, 'k', { kind: 'easy', targetId: 'h' })).toThrow('ALREADY_SPOKE')
    const older: DilState = { ...full, speech: full.speech!.map((sp) => ({ ...sp, round: -1 })) }
    expect(vote(older, 'k', { kind: 'easy', targetId: 'h' }).speech).toHaveLength(3)
  })

  it('public : le fil traverse la révélation, le même partout, puis se vide à la carte suivante', () => {
    let s = vote(table(SEATS, [PREFER, NEVER]), 'k', { kind: 'easy', targetId: 'h' })
    for (const id of ['h', 'l', 'b', 'g']) s = vote(s, id)
    expect(s.phase).toBe('reveal')
    expect(s.speech).toHaveLength(1)
    for (const p of s.players) expect(toDilClientView(s, p.id).speech).toEqual(s.speech)
    expect(toDilSpectatorView(s).speech).toEqual(s.speech)
    const next = reduceDil(s, { type: 'CONTINUE', playerId: 'h', now: T0 })
    expect(next.round).toBe(1)
    expect(next.speech).toEqual([])
  })

  it('un état sérialisé avant les paroles se relit sans fil', () => {
    const { speech, ...old } = table(SEATS)
    void speech
    expect(parseDilState(JSON.stringify(old))?.speech).toEqual([])
  })
})

describe('dilBotSay : qui parle, et quand', () => {
  it('rien hors vote, pour un humain, un converti, ni sans humain à table', () => {
    const s = table(SEATS)
    expect(say(s, 'h', ZERO)).toBeNull()
    expect(say({ ...s, phase: 'reveal' }, 'k', ZERO)).toBeNull()
    const converted: DilState = { ...s, players: s.players.map((p) => (p.id === 'k' ? { ...p, name: 'Riqui2' } : p)) }
    expect(say(converted, 'k', ZERO)).toBeNull()
    let alone = s
    for (const id of ['h', 'l']) alone = reduceDil(alone, { type: 'LEAVE', playerId: id, at: T0 })
    expect(say(alone, 'k', ZERO)).toBeNull()
  })

  it('le ton suit le trait : l’agressif tranche, la prudente hésite, le farceur selon son audace', () => {
    const s = table(SEATS)
    expect(say(s, 'k', ZERO)?.kind).toBe('easy')
    // Bernadette (bavardage 1) parle sous 1/6.
    expect(say(s, 'b', seq(0.1, 0))?.kind).toBe('tough')
    // Gépéto (audace 0,8) : tirage de parole, de cible, puis de ton.
    expect(say(s, 'g', seq(0, 0, 0.79))?.kind).toBe('easy')
    expect(say(s, 'g', seq(0, 0, 0.81))?.kind).toBe('tough')
  })

  it('confess, sur un « Je n’ai jamais » seulement, sous audace/2', () => {
    const never = table(SEATS, [NEVER])
    expect(say(never, 'k', seq(0, 0, 0.39))?.kind).toBe('confess')
    expect(say(never, 'k', seq(0, 0, 0.41))?.kind).toBe('easy')
    expect(say(table(SEATS, [WHO]), 'k', seq(0, 0, 0))?.kind).toBe('easy')
  })

  it('vise un humain qui n’a pas encore voté, à défaut un humain', () => {
    const s = vote(table(SEATS), 'h')
    expect(say(s, 'k', ZERO)?.targetId).toBe('l')
    expect(say(vote(s, 'l'), 'k', ZERO)?.targetId).toBe('h')
  })

  it('la chance de parler croît avec le bavardage ; une bulle de bot par manche pendant le vote', () => {
    const s = table([human('h', 'Riqui'), bot('ge', 'Germaine'), bot('su', 'Suzette'), bot('gp', 'Gépéto')])
    const at = (r: number) => () => r
    expect(say(s, 'ge', at(0.16))).not.toBeNull()
    expect(say(s, 'ge', at(0.17))).toBeNull()
    expect(say(s, 'su', at(0.33))).not.toBeNull()
    expect(say(s, 'su', at(0.34))).toBeNull()
    expect(say(s, 'gp', at(0.49))).not.toBeNull()
    expect(say(s, 'gp', at(0.51))).toBeNull()
    expect(DIL_VOTE_TALK_MAX).toBe(1)
    expect(say(vote(s, 'ge', { kind: 'easy', targetId: 'h' }), 'gp', ZERO)).toBeNull()
  })
})

describe('le moteur accepte toute parole que le planificateur propose', () => {
  it('400 états tirés au hasard, les trois sortes de carte', () => {
    const rng = createRng('fuzz-dil')
    let checked = 0
    for (let n = 0; n < 400; n += 1) {
      const personas = rng.shuffle(BOT_PERSONAS).slice(0, 2 + rng.int(0, 4))
      const humans = Array.from({ length: 1 + rng.int(0, 2) }, (_, i) => human(`h${i}`, `H${i}`))
      let s = table(rng.shuffle([...humans, ...personas.map((p, i) => bot(`b${i}`, p.name))]), [rng.pick([PREFER, NEVER, WHO])], `f-${n}`)
      for (const p of dilActive(s)) if (s.phase === 'vote' && rng.chance(0.3)) s = vote(s, p.id, undefined, rng.chance(0.5))
      if (s.phase !== 'vote') continue
      for (const p of s.players.filter((x) => x.isBot && !s.votes[x.id])) {
        const move = say(s, p.id, rng.next)
        if (!move) continue
        expect(DIL_SAY_KINDS).toContain(move.kind)
        expect(s.players.find((x) => x.id === move.targetId)?.isBot).toBe(false)
        expect(() => vote(s, p.id, { kind: move.kind, targetId: move.targetId! })).not.toThrow()
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})

describe('anti-fuite : le vote reste secret', () => {
  it('ni le choix du bot ni les votes des autres ne font varier sa parole', () => {
    let spoke = 0
    for (let n = 0; n < 120; n += 1) {
      const card = [PREFER, NEVER, WHO][n % 3]
      const base = vote(table(SEATS, [card], `leak-${n}`), 'h', undefined, n % 2 === 0)
      // Mêmes visibles (Riqui a voté), autre secret : Riqui a voté autre chose.
      const other = card.kind === 'who' ? 'k' : base.votes.h === 'A' ? 'B' : 'A'
      const flipped: DilState = { ...base, votes: { h: other } }
      // Le choix du bot vient du flux `rand` : deux flux différents, deux choix possibles.
      const ra = applyDilBotAction(base, () => 0.1, createRng(`s${n}`).next)
      const rb = applyDilBotAction(flipped, () => 0.9, createRng(`s${n}`).next)
      if (!ra.ok || !rb.ok) throw new Error('tick refusé')
      expect(rb.state.speech, `${n}`).toEqual(ra.state.speech)
      spoke += ra.state.speech?.length ?? 0
    }
    expect(spoke).toBeGreaterThan(20)
  })
})

describe('simulation : des parties entières, sobres', () => {
  /** Joue une partie : les humains votent au hasard, les bots par l'adaptateur. */
  function playGame(seats: Seat[], seed: string, leaveAfter: number | null = null) {
    const rng = createRng(seed)
    const cards = Array.from({ length: 10 }, () => rng.pick([PREFER, NEVER, WHO]))
    let s = table(seats, cards, seed)
    const rounds: { round: number; state: DilState; reactions: number }[] = []
    let guard = 0
    while (s.phase !== 'finished' && guard < 400) {
      guard += 1
      if (s.phase === 'vote') {
        const r = applyDilBotAction(s, rng.next, rng.next)
        if (r.ok) {
          s = r.state
          continue
        }
        for (const p of dilActive(s).filter((x) => !x.isBot)) if (s.phase === 'vote') s = vote(s, p.id, undefined, rng.chance(0.5))
        continue
      }
      if (s.phase === 'reveal') {
        rounds.push({ round: s.round, state: s, reactions: dilRevealReactions(toDilSpectatorView(s)).length })
        if (leaveAfter !== null && s.round === leaveAfter) {
          for (const p of s.players.filter((x) => !x.isBot)) s = reduceDil(s, { type: 'LEAVE', playerId: p.id, at: T0 })
        }
        s = reduceDil(s, { type: 'CONTINUE', playerId: s.players[0].id, now: T0 })
      }
    }
    return { s, rounds }
  }

  it('par manche : une bulle au vote, une réaction, min(2, bavardage) par bot', () => {
    let total = 0
    for (let n = 0; n < 40; n += 1) {
      const personas = createRng(`p${n}`).shuffle(BOT_PERSONAS).slice(0, 2 + (n % 4))
      const humans = n % 2 ? [human('h', 'Riqui')] : [human('h', 'Riqui'), human('l', 'Léa')]
      const { s, rounds } = playGame([...humans, ...personas.map((p, i) => bot(`b${i}`, p.name))], `sim-${n}`)
      expect(s.phase).toBe('finished')
      for (const { state, reactions } of rounds) {
        const said = state.speech ?? []
        expect(said.length).toBeLessThanOrEqual(DIL_VOTE_TALK_MAX)
        expect(reactions).toBeLessThanOrEqual(DIL_REVEAL_REACTIONS_MAX)
        const all = [...said, ...dilRevealReactions(toDilSpectatorView(state))]
        for (const p of state.players) {
          const count = all.filter((sp) => sp.playerId === p.id).length
          expect(count, p.name).toBeLessThanOrEqual(p.isBot ? Math.min(DIL_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0)
        }
        total += said.length + reactions
      }
    }
    // 40 parties × 10 cartes : des bulles, mais au plus deux par carte.
    expect(total).toBeGreaterThan(200)
    expect(total).toBeLessThan(40 * 10 * 2)
  })

  it('les humains partis, les bots se taisent', () => {
    for (let n = 0; n < 15; n += 1) {
      const personas = createRng(`q${n}`).shuffle(BOT_PERSONAS).slice(0, 3)
      const { rounds } = playGame([human('h', 'Riqui'), ...personas.map((p, i) => bot(`b${i}`, p.name))], `alone-${n}`, 0)
      for (const { round, state, reactions } of rounds.filter((r) => r.round > 0)) {
        expect(state.speech, `${n}/${round}`).toEqual([])
        expect(reactions).toBe(0)
      }
    }
  })
})
