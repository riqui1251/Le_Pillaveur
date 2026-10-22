import { describe, expect, it } from 'vitest'
import { botTraitsFor, BOT_PERSONAS } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createSFState,
  reduceSF,
  sfActive,
  toSFClientView,
  toSFSpectatorView,
  SF_COUNTDOWN_MS,
  SF_SAY_KINDS,
  SF_SPEECH_CAP,
  type SFSay,
  type SFState,
} from './engine'
import { applySFBotAction, parseSFState } from './server-adapter'
import { sfBotSay, SF_SUBMIT_TALK_MAX } from './bot-speech'
import { sfRevealReactions, SF_REVEAL_REACTIONS_MAX } from './reveal-reactions'

/**
 * Paroles des bots de Sans Filtre : une bulle jointe à la carte abattue,
 * acceptée par le moteur, sobre (une par manche à l'abattage, min(2,
 * bavardage) par bot), jamais sans humain à table, et tirée de la seule vue
 * du bot — ni les mains des autres ni l'auteur d'une réponse ne la font
 * varier.
 */

const T0 = 1_000_000
const BLACKS = ['Trou n°1 : ___.', 'Trou n°2 : ___.', 'Trou n°3 : ___.', 'Trou n°4 : ___.']
const WHITES = Array.from({ length: 200 }, (_, i) => `réponse ${i}`)

type Seat = { id: string; name: string; isBot?: boolean }
const human = (id: string, name = id): Seat => ({ id, name })
const bot = (id: string, name: string): Seat => ({ id, name, isBot: true })

/** Partie créée, countdown consommé : manche 1 en abattage à T0. */
function table(seats: Seat[], seed: string | number = 'seed', rounds = 3): SFState {
  const raw = createSFState(seats, BLACKS, WHITES, seed, T0 - SF_COUNTDOWN_MS, rounds)
  return reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const handOf = (s: SFState, id: string) => s.players.find((p) => p.id === id)!.hand
const play = (s: SFState, id: string, say?: SFSay) =>
  reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: handOf(s, id)[0], now: T0, say })

/** Tous ceux qui doivent encore abattre le font (sauf `except`). */
function playAll(s: SFState, except: string[] = []): SFState {
  let next = s
  for (const p of sfActive(next)) {
    if (next.phase !== 'submit') break
    if (p.id === next.judgeId || except.includes(p.id) || next.submissions.some((x) => x.playerId === p.id)) continue
    next = play(next, p.id)
  }
  return next
}

const ZERO = () => 0
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}
const say = (s: SFState, botId: string, rand: () => number) => {
  const p = s.players.find((x) => x.id === botId)!
  return sfBotSay(toSFClientView(s, botId), botId, botTraitsFor(p.name), rand)
}
const withCrowns = (s: SFState, crowns: Record<string, number>): SFState => ({
  ...s,
  players: s.players.map((p) => ({ ...p, crowns: crowns[p.id] ?? p.crowns })),
})

// Deux humains : Riqui juge la manche 1, Léa joue avec Gépéto et Kéké.
const DUO = [human('h', 'Riqui'), human('l', 'Léa'), bot('g', 'Gépéto'), bot('k', 'Kéké')]
// Table solo : les bots jugent aussi ; Gépéto juge la manche 1.
const SOLO = [bot('g', 'Gépéto'), human('h', 'Riqui'), bot('k', 'Kéké'), bot('b', 'Bernadette')]

describe('moteur : la parole jointe à la carte', () => {
  const s = table(DUO)

  it('un bot l’écrit dans la même réduction que sa carte, pour la manche en cours', () => {
    expect(s.judgeId).toBe('h')
    const next = play(s, 'g', { kind: 'pitch', targetId: 'h' })
    expect(next.speech).toEqual([{ playerId: 'g', kind: 'pitch', targetId: 'h', round: 0 }])
    expect(next.version).toBe(s.version + 1)
  })

  it('pitch et bribe visent le juge, rival un autre joueur, chase le seul en tête devant l’auteur', () => {
    expect(play(s, 'g', { kind: 'bribe', targetId: 'h' }).speech).toHaveLength(1)
    expect(() => play(s, 'g', { kind: 'pitch', targetId: 'l' })).toThrow('INVALID_TARGET')
    expect(play(s, 'g', { kind: 'rival', targetId: 'l' }).speech).toHaveLength(1)
    expect(() => play(s, 'g', { kind: 'rival', targetId: 'h' })).toThrow('INVALID_TARGET')
    expect(() => play(s, 'g', { kind: 'chase', targetId: 'l' })).toThrow('INVALID_TARGET')
    expect(play(withCrowns(s, { l: 2 }), 'g', { kind: 'chase', targetId: 'l' }).speech).toHaveLength(1)
    expect(() => play(withCrowns(s, { l: 2, g: 2 }), 'g', { kind: 'chase', targetId: 'l' })).toThrow('INVALID_TARGET')
  })

  it('refuse un humain qui parle, une réaction, une cible absente, soi-même ou partie', () => {
    expect(() => play(s, 'l', { kind: 'pitch', targetId: 'h' })).toThrow('INVALID_KIND')
    expect(() => play(s, 'g', { kind: 'crown', targetId: 'h' })).toThrow('INVALID_KIND')
    expect(() => play(s, 'g', { kind: 'rival', targetId: 'g' })).toThrow('INVALID_TARGET')
    expect(() => play(s, 'g', { kind: 'rival', targetId: 'zz' })).toThrow('INVALID_TARGET')
    const gone = reduceSF(s, { type: 'LEAVE', playerId: 'l', at: T0 })
    expect(() => play(gone, 'g', { kind: 'rival', targetId: 'l' })).toThrow('INVALID_TARGET')
  })

  it('deux paroles par bot et par manche ; celles d’une autre manche ne comptent pas', () => {
    const full: SFState = {
      ...s,
      speech: [
        { playerId: 'g', kind: 'pitch', targetId: 'h', round: 0 },
        { playerId: 'g', kind: 'bribe', targetId: 'h', round: 0 },
      ],
    }
    expect(SF_SPEECH_CAP).toBe(2)
    expect(() => play(full, 'g', { kind: 'pitch', targetId: 'h' })).toThrow('ALREADY_SPOKE')
    const older: SFState = { ...full, speech: full.speech!.map((sp) => ({ ...sp, round: -1 })) }
    expect(play(older, 'g', { kind: 'pitch', targetId: 'h' }).speech).toHaveLength(3)
  })

  it('le fil traverse le jugement et le couronnement, puis se vide à la manche suivante', () => {
    let st = play(s, 'g', { kind: 'pitch', targetId: 'h' })
    st = playAll(st)
    expect(st.phase).toBe('judging')
    st = reduceSF(st, { type: 'JUDGE_PICK', playerId: 'h', card: st.submissions[0].card, now: T0 })
    expect(st.phase).toBe('reveal')
    expect(st.speech).toHaveLength(1)
    for (const p of st.players) expect(toSFClientView(st, p.id).speech).toEqual(st.speech)
    expect(toSFSpectatorView(st).speech).toEqual(st.speech)
    const next = reduceSF(st, { type: 'CONTINUE', playerId: 'h', now: T0 })
    expect(next.round).toBe(1)
    expect(next.speech).toEqual([])
  })

  it('un état sérialisé avant les paroles se relit sans fil', () => {
    const { speech, ...old } = s
    void speech
    expect(parseSFState(JSON.stringify(old))?.speech).toEqual([])
  })
})

describe('sfBotSay : qui parle, et quand', () => {
  it('rien hors abattage, pour un humain, le juge, un converti, ni sans humain à table', () => {
    const s = table(DUO)
    expect(say(s, 'l', ZERO)).toBeNull()
    expect(say({ ...s, phase: 'judging' }, 'g', ZERO)).toBeNull()
    const solo = table(SOLO)
    expect(solo.judgeId).toBe('g')
    expect(say(solo, 'g', ZERO)).toBeNull()
    const converted: SFState = { ...s, players: s.players.map((p) => (p.id === 'g' ? { ...p, name: 'Riqui2' } : p)) }
    expect(say(converted, 'g', ZERO)).toBeNull()
    const alone = reduceSF(solo, { type: 'LEAVE', playerId: 'h', at: T0 })
    expect(say(alone, 'k', ZERO)).toBeNull()
  })

  it('juge humain : pitch, ou bribe au gré de l’audace (sous audace/2)', () => {
    const s = table(DUO)
    // Kéké, audace 0,8 : bribe sous 0,4.
    expect(say(s, 'k', seq(0, 0.39))).toEqual({ playerId: 'k', kind: 'bribe', targetId: 'h' })
    expect(say(s, 'k', seq(0, 0.41))).toEqual({ playerId: 'k', kind: 'pitch', targetId: 'h' })
  })

  it('juge bot : rival, vers un humain de la manche qui n’a pas encore joué', () => {
    const s = table(SOLO)
    expect(say(s, 'k', ZERO)).toEqual({ playerId: 'k', kind: 'rival', targetId: 'h' })
    // L'humain a joué : il reste la cible (seul humain de la manche).
    expect(say(play(s, 'h'), 'k', ZERO)).toEqual({ playerId: 'k', kind: 'rival', targetId: 'h' })
  })

  it('chase : contre l’humain seul en tête aux couronnes, devant le bot, avec une probabilité égale à l’audace', () => {
    const s = withCrowns(table(DUO), { l: 2 })
    expect(say(s, 'k', seq(0, 0.79))?.kind).toBe('chase')
    expect(say(s, 'k', seq(0, 0.81, 0.99))?.kind).toBe('pitch')
    expect(say(withCrowns(s, { k: 2 }), 'k', ZERO)?.kind).toBe('bribe')
    expect(say(withCrowns(table(DUO), { k: 3 }), 'g', ZERO)?.kind).toBe('bribe')
  })

  it('la chance de parler croît avec le bavardage : un sixième par point', () => {
    const s = table([human('h', 'Riqui'), human('l', 'Léa'), bot('ge', 'Germaine'), bot('su', 'Suzette'), bot('gp', 'Gépéto')])
    const at = (r: number) => () => r
    expect(say(s, 'ge', at(0.16))).not.toBeNull()
    expect(say(s, 'ge', at(0.17))).toBeNull()
    expect(say(s, 'su', at(0.33))).not.toBeNull()
    expect(say(s, 'su', at(0.34))).toBeNull()
    expect(say(s, 'gp', at(0.49))).not.toBeNull()
    expect(say(s, 'gp', at(0.51))).toBeNull()
  })

  it('sobriété : une bulle de bot par manche à l’abattage', () => {
    expect(SF_SUBMIT_TALK_MAX).toBe(1)
    const s = play(table(DUO), 'g', { kind: 'pitch', targetId: 'h' })
    expect(say(s, 'k', ZERO)).toBeNull()
  })
})

describe('le moteur accepte toute parole que le planificateur propose', () => {
  it('400 états tirés au hasard', () => {
    const rng = createRng('fuzz-sf')
    let checked = 0
    for (let n = 0; n < 400; n += 1) {
      const personas = rng.shuffle(BOT_PERSONAS).slice(0, 3 + rng.int(0, 3))
      const humans = Array.from({ length: 1 + rng.int(0, 2) }, (_, i) => human(`h${i}`, `H${i}`))
      const seats = rng.shuffle([...humans, ...personas.map((p, i) => bot(`b${i}`, p.name))])
      let s = table(seats, `fuzz-${n}`)
      s = withCrowns(s, Object.fromEntries(s.players.map((p) => [p.id, rng.int(0, 2)])))
      for (const p of sfActive(s)) {
        if (s.phase === 'submit' && p.id !== s.judgeId && rng.chance(0.3)) s = play(s, p.id)
      }
      if (s.phase !== 'submit') continue
      for (const p of s.players.filter((x) => x.isBot)) {
        if (p.id === s.judgeId || s.submissions.some((x) => x.playerId === p.id)) continue
        const move = say(s, p.id, rng.next)
        if (!move) continue
        expect(SF_SAY_KINDS).toContain(move.kind)
        expect(s.players.find((x) => x.id === move.targetId)?.isBot).toBe(false)
        expect(() => play(s, p.id, { kind: move.kind, targetId: move.targetId! })).not.toThrow()
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})

describe('anti-fuite : ce qui est caché ne fait jamais varier une parole', () => {
  it('ni les mains des autres, ni la pioche, ni quelle carte chacun a abattue', () => {
    let spoke = 0
    for (let n = 0; n < 80; n += 1) {
      const base = table(n % 2 ? DUO : SOLO, `leak-${n}`)
      const a = play(base, base.players.find((p) => !p.isBot && p.id !== base.judgeId)!.id)
      const bot = a.players.find((p) => p.isBot && p.id !== a.judgeId && !a.submissions.some((x) => x.playerId === p.id))!
      // Mêmes visibles, secrets bousculés : les mains des autres, la pioche, la carte de Riqui.
      const b: SFState = {
        ...a,
        whiteDeck: [...a.whiteDeck].reverse(),
        players: a.players.map((p) => (p.id === bot.id ? p : { ...p, hand: [...p.hand].reverse().map((c) => c + 100) })),
        submissions: a.submissions.map((x) => ({ ...x, card: x.card + 50 })),
      }
      const ra = applySFBotAction(a, () => 0.5, createRng(`s${n}`).next)
      const rb = applySFBotAction(b, () => 0.5, createRng(`s${n}`).next)
      if (!ra.ok || !rb.ok) throw new Error('tick refusé')
      expect(rb.state.speech, `${n}`).toEqual(ra.state.speech)
      spoke += ra.state.speech?.length ?? 0
    }
    expect(spoke).toBeGreaterThan(10)
  })
})

describe('simulation : des parties entières, sobres', () => {
  /** Joue une partie : les humains abattent et jugent au hasard, les bots par l'adaptateur. */
  function playGame(seats: Seat[], seed: string, leaveAfter: number | null = null) {
    const rng = createRng(seed)
    let s = table(seats, seed, 4)
    const rounds: { round: number; state: SFState; reactions: number }[] = []
    let guard = 0
    while (s.phase !== 'finished' && guard < 300) {
      guard += 1
      if (s.phase === 'submit') {
        const r = applySFBotAction(s, rng.next, rng.next)
        if (r.ok) {
          s = r.state
          continue
        }
        for (const p of sfActive(s).filter((x) => !x.isBot && x.id !== s.judgeId)) {
          if (s.phase === 'submit' && !s.submissions.some((x) => x.playerId === p.id)) s = play(s, p.id)
        }
        continue
      }
      if (s.phase === 'judging') {
        const r = applySFBotAction(s, rng.next, rng.next)
        s = r.ok ? r.state : reduceSF(s, { type: 'JUDGE_PICK', playerId: s.judgeId!, card: rng.pick(s.submissions).card, now: T0 })
        continue
      }
      if (s.phase === 'reveal') {
        rounds.push({ round: s.round, state: s, reactions: sfRevealReactions(toSFSpectatorView(s)).length })
        if (leaveAfter !== null && s.round === leaveAfter) {
          for (const p of s.players.filter((x) => !x.isBot)) s = reduceSF(s, { type: 'LEAVE', playerId: p.id, at: T0 })
        }
        s = reduceSF(s, { type: 'CONTINUE', playerId: s.players[0].id, now: T0 })
      }
    }
    return { s, rounds }
  }

  it('par manche : une bulle à l’abattage, deux réactions, min(2, bavardage) par bot', () => {
    let total = 0
    for (let n = 0; n < 40; n += 1) {
      const personas = createRng(`p${n}`).shuffle(BOT_PERSONAS).slice(0, 3 + (n % 3))
      const humans = n % 2 ? [human('h', 'Riqui')] : [human('h', 'Riqui'), human('l', 'Léa')]
      const { s, rounds } = playGame([...humans, ...personas.map((p, i) => bot(`b${i}`, p.name))], `sim-${n}`)
      expect(s.phase).toBe('finished')
      for (const { state, reactions } of rounds) {
        const said = state.speech ?? []
        expect(said.filter((sp) => SF_SAY_KINDS.includes(sp.kind)).length).toBeLessThanOrEqual(SF_SUBMIT_TALK_MAX)
        expect(reactions).toBeLessThanOrEqual(SF_REVEAL_REACTIONS_MAX)
        const all = [...said, ...sfRevealReactions(toSFSpectatorView(state))]
        for (const p of state.players) {
          const count = all.filter((sp) => sp.playerId === p.id).length
          expect(count, p.name).toBeLessThanOrEqual(p.isBot ? Math.min(SF_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0)
        }
        total += said.length + reactions
      }
    }
    expect(total).toBeGreaterThan(60)
    expect(total).toBeLessThan(40 * 4 * 3)
  })

  it('les humains partis, les bots se taisent', () => {
    for (let n = 0; n < 15; n += 1) {
      const personas = createRng(`q${n}`).shuffle(BOT_PERSONAS).slice(0, 4)
      const { rounds } = playGame([human('h', 'Riqui'), ...personas.map((p, i) => bot(`b${i}`, p.name))], `alone-${n}`, 0)
      for (const { round, state, reactions } of rounds.filter((r) => r.round > 0)) {
        expect(state.speech, `${n}/${round}`).toEqual([])
        expect(reactions).toBe(0)
      }
    }
  })
})
