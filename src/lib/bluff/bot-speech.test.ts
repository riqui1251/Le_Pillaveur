import { describe, expect, it } from 'vitest'
import { botTraitsFor, BOT_PERSONAS } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  bluffActive,
  createBluffState,
  reduceBluff,
  toBluffClientView,
  toBluffSpectatorView,
  BLUFF_COUNTDOWN_MS,
  BLUFF_REVEAL_MIN_MS,
  BLUFF_SAY_KINDS_OF,
  BLUFF_SPEECH_CAP,
  type BluffPrompt,
  type BluffSay,
  type BluffSpeechKind,
  type BluffState,
} from './engine'
import { applyBluffBotAction, parseBluffState } from './server-adapter'
import { bluffBotSay, BLUFF_PHASE_TALK_MAX } from './bot-speech'
import { bluffRevealReactions, BLUFF_REVEAL_REACTIONS_MAX } from './reveal-reactions'

/**
 * Paroles des bots du Grand Bluff : une bulle jointe au bluff ou au vote,
 * acceptée par le moteur, sobre (une par phase, min(2, bavardage) par bot),
 * jamais sans humain à table, et tirée de la seule vue du bot — rien de ce
 * qui est caché (vraie réponse, auteurs, votes des autres) ne la fait varier.
 */

const PROMPTS: BluffPrompt[] = [
  { id: 'q1', q: 'Capitale du Japon ?', answer: 'Tokyo', decoys: ['Osaka', 'Kyoto', 'Nagoya', 'Kobe'] },
  { id: 'q2', q: 'Capitale de l’Italie ?', answer: 'Rome', decoys: ['Milan', 'Turin', 'Naples', 'Gênes'] },
  { id: 'q3', q: 'Capitale de l’Espagne ?', answer: 'Madrid', decoys: ['Séville', 'Valence', 'Bilbao', 'Cadix'] },
]
const T0 = 1_000_000

type Seat = { id: string; name: string; isBot?: boolean }
const human = (id: string, name = id): Seat => ({ id, name })
const bot = (id: string, name: string): Seat => ({ id, name, isBot: true })

/** Partie créée, countdown consommé : phase submit à T0. */
function table(seats: Seat[], seed: string | number = 'seed', rounds = 3): BluffState {
  const raw = createBluffState(seats, PROMPTS, seed, T0 - BLUFF_COUNTDOWN_MS, rounds)
  return reduceBluff(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const submit = (s: BluffState, id: string, text = `bluff-${id}`, say?: BluffSay) =>
  reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: id, text, now: T0, say })

/** Tout le monde (sauf `except`) soumet un bluff distinct : phase vote. */
function toVote(s: BluffState, except: string[] = []): BluffState {
  let next = s
  for (const p of bluffActive(next)) {
    if (!except.includes(p.id) && !next.pendingFakes[p.id]) next = submit(next, p.id)
  }
  return next
}

const optionOf = (s: BluffState, voterId: string, pickReal: boolean) =>
  s.candidates.find((c) => (pickReal ? c.isReal : !c.isReal && c.authorId !== voterId))!.candidateId

const vote = (s: BluffState, id: string, pickReal = true, say?: BluffSay) =>
  reduceBluff(s, { type: 'VOTE', playerId: id, candidateId: optionOf(s, id, pickReal), now: T0, say })

const ZERO = () => 0
const NEVER = () => 0.999
/** Rand stubé : rejoue une séquence (la dernière valeur en boucle). */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}
const say = (state: BluffState, botId: string, rand: () => number) => {
  const p = state.players.find((x) => x.id === botId)!
  return bluffBotSay(toBluffClientView(state, botId), botId, botTraitsFor(p.name), rand)
}

describe('moteur : la parole jointe au coup', () => {
  const s = table([human('h'), bot('g', 'Gépéto'), bot('r', 'Raoul')])

  it('un bot l’écrit dans la même réduction que son bluff, pour la manche en cours', () => {
    const next = submit(s, 'g', 'Osaka', { kind: 'proud', targetId: 'h' })
    expect(next.speech).toEqual([{ playerId: 'g', kind: 'proud', targetId: 'h', round: 0 }])
    expect(next.version).toBe(s.version + 1)
  })

  it('refuse un humain qui parle, un kind d’un autre coup, une cible absente, soi-même ou partie', () => {
    expect(() => submit(s, 'h', 'Osaka', { kind: 'proud', targetId: 'g' })).toThrow('INVALID_KIND')
    expect(() => submit(s, 'g', 'Osaka', { kind: 'sure', targetId: 'h' })).toThrow('INVALID_KIND')
    expect(() => submit(s, 'g', 'Osaka', { kind: 'fooled', targetId: 'h' })).toThrow('INVALID_KIND')
    expect(() => submit(s, 'g', 'Osaka', { kind: 'proud', targetId: 'g' })).toThrow('INVALID_TARGET')
    expect(() => submit(s, 'g', 'Osaka', { kind: 'proud', targetId: 'zz' })).toThrow('INVALID_TARGET')
    const left = reduceBluff(s, { type: 'LEAVE', playerId: 'h', at: T0 })
    expect(() => submit(left, 'g', 'Osaka', { kind: 'proud', targetId: 'h' })).toThrow('INVALID_TARGET')
  })

  it('chase vise le seul meneur, devant l’auteur ; sniff, un joueur dont un bluff est en lice', () => {
    expect(() => submit(s, 'g', 'Osaka', { kind: 'chase', targetId: 'h' })).toThrow('INVALID_TARGET')
    const scored: BluffState = { ...s, players: s.players.map((p) => (p.id === 'h' ? { ...p, score: 500 } : p)) }
    expect(submit(scored, 'g', 'Osaka', { kind: 'chase', targetId: 'h' }).speech).toHaveLength(1)
    expect(() => submit(scored, 'g', 'Osaka', { kind: 'chase', targetId: 'r' })).toThrow('INVALID_TARGET')

    const voting = toVote(s, ['h'])
    expect(voting.phase).toBe('submit')
    const all = submit(voting, 'h')
    expect(all.phase).toBe('vote')
    expect(vote(all, 'g', true, { kind: 'sniff', targetId: 'h' }).speech).toHaveLength(1)
    const noFake: BluffState = { ...all, pendingFakes: { g: 'Osaka', r: 'Kyoto' } }
    expect(() => vote(noFake, 'g', true, { kind: 'sniff', targetId: 'h' })).toThrow('INVALID_TARGET')
  })

  it('deux paroles par bot et par manche, au plus ; celles d’une autre manche ne comptent pas', () => {
    const voting = toVote(s)
    const capped: BluffState = {
      ...voting,
      speech: [
        { playerId: 'g', kind: 'proud', targetId: 'h', round: 0 },
        { playerId: 'g', kind: 'chase', targetId: 'h', round: 0 },
      ],
    }
    expect(BLUFF_SPEECH_CAP).toBe(2)
    expect(() => vote(capped, 'g', true, { kind: 'sure', targetId: 'h' })).toThrow('ALREADY_SPOKE')
    const older: BluffState = { ...capped, speech: capped.speech!.map((sp) => ({ ...sp, round: -1 })) }
    expect(vote(older, 'g', true, { kind: 'sure', targetId: 'h' }).speech).toHaveLength(3)
  })

  it('le fil traverse le vote et la révélation, puis se vide à la manche suivante', () => {
    let st = submit(s, 'g', 'Osaka', { kind: 'proud', targetId: 'h' })
    st = submit(submit(st, 'r'), 'h')
    st = vote(st, 'g', false, { kind: 'unsure', targetId: 'h' })
    st = vote(vote(st, 'r'), 'h')
    expect(st.phase).toBe('reveal')
    expect(st.speech?.map((sp) => sp.kind)).toEqual(['proud', 'unsure'])
    const next = reduceBluff(st, { type: 'CONTINUE', playerId: 'h', now: T0 + BLUFF_REVEAL_MIN_MS })
    expect(next.promptIdx).toBe(1)
    expect(next.speech).toEqual([])
  })

  it('public : chaque téléphone et la TV reçoivent le même fil', () => {
    const st = submit(s, 'g', 'Osaka', { kind: 'proud', targetId: 'h' })
    for (const p of st.players) expect(toBluffClientView(st, p.id).speech).toEqual(st.speech)
    expect(toBluffSpectatorView(st).speech).toEqual(st.speech)
  })

  it('un état sérialisé avant les paroles se relit sans fil', () => {
    const { speech, ...old } = s
    void speech
    expect(parseBluffState(JSON.stringify(old))?.speech).toEqual([])
  })
})

describe('bluffBotSay : qui parle, et quand', () => {
  const seats = [human('h', 'Riqui'), bot('g', 'Gépéto'), bot('k', 'Kéké'), bot('b', 'Bernadette')]

  it('rien hors bluff et vote, pour un humain, un converti, un bot parti, ni sans humain à table', () => {
    const s = table(seats)
    expect(say(s, 'h', ZERO)).toBeNull()
    const converted: BluffState = { ...s, players: s.players.map((p) => (p.id === 'g' ? { ...p, name: 'Riqui2' } : p)) }
    expect(say(converted, 'g', ZERO)).toBeNull()
    const gone = reduceBluff(s, { type: 'LEAVE', playerId: 'h', at: T0 })
    expect(say(gone, 'g', ZERO)).toBeNull()
    const bots = table([bot('g', 'Gépéto'), bot('k', 'Kéké'), bot('b', 'Bernadette')])
    expect(say(bots, 'g', ZERO)).toBeNull()
    expect(say({ ...s, phase: 'reveal' }, 'g', ZERO)).toBeNull()
  })

  it('au bluff : proud, à un humain qui écrit encore', () => {
    const s = table([human('h1', 'Riqui'), human('h2', 'Léa'), bot('g', 'Gépéto'), bot('k', 'Kéké')])
    const done = submit(s, 'h1')
    expect(say(done, 'g', ZERO)).toEqual({ playerId: 'g', kind: 'proud', targetId: 'h2' })
  })

  it('chase : contre un humain seul en tête et devant le bot, avec une probabilité égale à l’audace', () => {
    const s = table(seats)
    const lead: BluffState = { ...s, players: s.players.map((p) => (p.id === 'h' ? { ...p, score: 1000 } : p)) }
    // Kéké (audace 0,8) : le second tirage décide.
    expect(say(lead, 'k', seq(0, 0.79))?.kind).toBe('chase')
    expect(say(lead, 'k', seq(0, 0.81, 0))?.kind).toBe('proud')
    // Le bot en tête, ou à égalité : pas de pique.
    const botLead: BluffState = { ...s, players: s.players.map((p) => (p.id === 'k' ? { ...p, score: 1000 } : p)) }
    expect(say(botLead, 'g', ZERO)?.kind).toBe('proud')
    const tie: BluffState = { ...s, players: s.players.map((p) => (p.id !== 'b' ? { ...p, score: 500 } : p)) }
    expect(say(tie, 'b', ZERO)?.kind).toBe('proud')
  })

  it('au vote, le ton suit le trait : l’agressif crâne, la prudente et le suiveur doutent, le farceur au gré de son audace', () => {
    const s = toVote(table([human('h', 'Riqui'), bot('k', 'Kéké'), bot('b', 'Bernadette'), bot('n', 'Norbert'), bot('g', 'Gépéto')]), ['h'])
    const voting = submit(s, 'h')
    // sniff écarté (tirage au-dessus d'audace/2), pas de tirage farceur pour les autres.
    expect(say(voting, 'k', seq(0, 0.99, 0))?.kind).toBe('sure')
    expect(say(voting, 'n', seq(0, 0.99, 0))?.kind).toBe('unsure')
    // Bernadette (bavardage 1) parle sous 1/6.
    expect(say(voting, 'b', seq(0.1, 0.99, 0))?.kind).toBe('unsure')
    expect(say(voting, 'g', seq(0, 0.99, 0.79, 0))?.kind).toBe('sure')
    expect(say(voting, 'g', seq(0, 0.99, 0.81, 0))?.kind).toBe('unsure')
    // sniff : sous audace/2, vers l'humain dont le bluff est en lice.
    expect(say(voting, 'k', seq(0, 0.39, 0))).toEqual({ playerId: 'k', kind: 'sniff', targetId: 'h' })
  })

  it('la chance de parler croît avec le bavardage : un sixième par point', () => {
    const s = table([human('h', 'Riqui'), bot('ge', 'Germaine'), bot('su', 'Suzette'), bot('gp', 'Gépéto')])
    const at = (r: number) => () => r
    expect(say(s, 'ge', at(0.16))).not.toBeNull()
    expect(say(s, 'ge', at(0.17))).toBeNull()
    expect(say(s, 'su', at(0.33))).not.toBeNull()
    expect(say(s, 'su', at(0.34))).toBeNull()
    expect(say(s, 'gp', at(0.49))).not.toBeNull()
    expect(say(s, 'gp', at(0.51))).toBeNull()
    expect(say(s, 'gp', NEVER)).toBeNull()
  })

  it('sobriété : une bulle de bot par phase et par manche, min(2, bavardage) par bot', () => {
    expect(BLUFF_PHASE_TALK_MAX).toBe(1)
    const s = table([human('h', 'Riqui'), bot('g', 'Gépéto'), bot('j', 'Josiane'), bot('ge', 'Germaine')])
    const spoke = submit(s, 'g', 'Osaka', { kind: 'proud', targetId: 'h' })
    expect(say(spoke, 'j', ZERO)).toBeNull()
    const voting = toVote(spoke)
    expect(say(voting, 'j', ZERO)?.kind).toBeDefined()
    // Germaine (bavardage 1) a déjà parlé au bluff : muette au vote.
    const germaine = submit(s, 'ge', 'Osaka', { kind: 'proud', targetId: 'h' })
    expect(say(toVote(germaine), 'ge', ZERO)).toBeNull()
  })
})

describe('le moteur accepte toute parole que le planificateur propose', () => {
  it('500 états tirés au hasard, bluff et vote, chaque bot', () => {
    const rng = createRng('fuzz-bluff')
    let checked = 0
    for (let n = 0; n < 500; n += 1) {
      const personas = rng.shuffle(BOT_PERSONAS).slice(0, 2 + rng.int(0, 4))
      const humans = Array.from({ length: 1 + rng.int(0, 2) }, (_, i) => human(`h${i}`, `H${i}`))
      let s = table([...humans, ...personas.map((p, i) => bot(`b${i}`, p.name))], `fuzz-${n}`)
      s = { ...s, players: s.players.map((p) => ({ ...p, score: rng.int(0, 3) * 500 })) }
      if (rng.chance(0.5)) {
        // Phase vote : tout le monde a bluffé, quelques-uns ont déjà voté.
        s = toVote(s)
        for (const p of s.players) if (rng.chance(0.3) && s.phase === 'vote') s = vote(s, p.id, rng.chance(0.5))
        if (s.phase !== 'vote') continue
      } else {
        for (const p of s.players) if (rng.chance(0.3) && s.phase === 'submit') s = submit(s, p.id)
        if (s.phase !== 'submit') continue
      }
      for (const p of s.players.filter((x) => x.isBot)) {
        const done = s.phase === 'submit' ? s.pendingFakes[p.id] : s.pendingVotes[p.id]
        if (done) continue
        const move = say(s, p.id, rng.next)
        if (!move) continue
        expect(move.playerId).toBe(p.id)
        const kinds: readonly BluffSpeechKind[] = BLUFF_SAY_KINDS_OF[s.phase === 'submit' ? 'SUBMIT_FAKE' : 'VOTE']
        expect(kinds).toContain(move.kind)
        expect(s.players.find((x) => x.id === move.targetId)?.isBot).toBe(false)
        const sayIt = { kind: move.kind, targetId: move.targetId! }
        expect(() => (s.phase === 'submit' ? submit(s, p.id, 'Osaka', sayIt) : vote(s, p.id, true, sayIt))).not.toThrow()
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(150)
  })
})

describe('anti-fuite : ce qui est caché ne fait jamais varier une parole', () => {
  /**
   * Deux tables identiques à un secret près — la vraie réponse, l'auteur de
   * chaque proposition, le texte des bluffs et les votes des autres — jouées
   * avec les mêmes tirages : les mêmes paroles, bulle pour bulle.
   */
  const seats = [human('h1', 'Riqui'), human('h2', 'Léa'), bot('g', 'Gépéto'), bot('k', 'Kéké'), bot('j', 'Josiane')]

  const sayStream = (seed: string) => createRng(seed).next

  it('au bluff : la vraie réponse et les bluffs des autres n’y changent rien', () => {
    let spoke = 0
    for (let n = 0; n < 60; n += 1) {
      const a = submit(table(seats, `leak-${n}`), 'h1', 'Lyon')
      const b: BluffState = {
        ...a,
        roundPrompts: a.roundPrompts.map((p, i) => (i === a.promptIdx ? { ...p, answer: 'Paris', decoys: ['Lille', 'Nice', 'Metz', 'Pau'] } : p)),
        pendingFakes: { h1: 'Grenoble' },
      }
      const ra = applyBluffBotAction(a, createRng(`r${n}`).next, T0, sayStream(`s${n}`))
      const rb = applyBluffBotAction(b, createRng(`r${n}`).next, T0, sayStream(`s${n}`))
      if (!ra.ok || !rb.ok) throw new Error('tick refusé')
      expect(rb.state.speech).toEqual(ra.state.speech)
      spoke += ra.state.speech?.length ?? 0
    }
    expect(spoke).toBeGreaterThan(10)
  })

  it('au vote : ni la vraie réponse, ni les auteurs, ni les votes des autres', () => {
    let spoke = 0
    for (let n = 0; n < 60; n += 1) {
      let a = toVote(table(seats, `leak-v-${n}`))
      a = vote(a, 'h1', n % 2 === 0)
      // Mêmes propositions, secrets permutés : la vraie réponse change de carte,
      // les auteurs tournent, et Riqui a voté ailleurs.
      const real = a.candidates.findIndex((c) => c.isReal)
      const other = (real + 1) % a.candidates.length
      const swapped = a.candidates.map((c, i) => {
        if (i === real) return { ...c, isReal: false, authorId: a.candidates[other].authorId }
        if (i === other) return { ...c, isReal: true, authorId: null }
        return c
      })
      const b: BluffState = { ...a, candidates: swapped, pendingVotes: { h1: a.candidates[(real + 2) % a.candidates.length].candidateId } }
      const ra = applyBluffBotAction(a, () => 0, T0, sayStream(`v${n}`))
      const rb = applyBluffBotAction(b, () => 0, T0, sayStream(`v${n}`))
      if (!ra.ok || !rb.ok) throw new Error('tick refusé')
      expect(rb.state.speech).toEqual(ra.state.speech)
      spoke += ra.state.speech?.length ?? 0
    }
    expect(spoke).toBeGreaterThan(10)
  })
})

describe('simulation : des parties entières, sobres', () => {
  /** Joue une partie : les humains bluffent et votent au hasard, les bots par l'adaptateur. */
  function play(seats: Seat[], seed: string) {
    const rng = createRng(seed)
    let s = table(seats, seed, 3)
    const bubbles: { round: number; kinds: BluffSpeechKind[]; reactions: number; perBot: Map<string, number> }[] = []
    let guard = 0
    while (s.phase !== 'finished' && guard < 200) {
      guard += 1
      if (s.phase === 'submit' || s.phase === 'vote') {
        const r = applyBluffBotAction(s, rng.next, T0, rng.next)
        if (r.ok) s = r.state
        for (const p of bluffActive(s).filter((x) => !x.isBot)) {
          if (s.phase === 'submit' && !s.pendingFakes[p.id]) s = submit(s, p.id, `fake-${p.id}-${s.promptIdx}`)
          else if (s.phase === 'vote' && !s.pendingVotes[p.id]) s = vote(s, p.id, rng.chance(0.5))
        }
        continue
      }
      if (s.phase === 'reveal') {
        const reactions = bluffRevealReactions(toBluffSpectatorView(s))
        const all = [...(s.speech ?? []), ...reactions]
        const perBot = new Map<string, number>()
        for (const sp of all) perBot.set(sp.playerId, (perBot.get(sp.playerId) ?? 0) + 1)
        bubbles.push({ round: s.promptIdx, kinds: (s.speech ?? []).map((sp) => sp.kind), reactions: reactions.length, perBot })
        s = reduceBluff(s, { type: 'CONTINUE', playerId: s.players[0].id, now: T0 + BLUFF_REVEAL_MIN_MS })
      }
    }
    return { s, bubbles }
  }

  it('par manche : une bulle par phase, deux réactions, min(2, bavardage) par bot', () => {
    let total = 0
    for (let n = 0; n < 40; n += 1) {
      const personas = createRng(`p${n}`).shuffle(BOT_PERSONAS).slice(0, 4)
      const { s, bubbles } = play([human('h', 'Riqui'), ...personas.map((p, i) => bot(`b${i}`, p.name))], `sim-${n}`)
      expect(s.phase).toBe('finished')
      for (const round of bubbles) {
        const submitTalk = round.kinds.filter((k) => (BLUFF_SAY_KINDS_OF.SUBMIT_FAKE as readonly string[]).includes(k))
        const voteTalk = round.kinds.filter((k) => (BLUFF_SAY_KINDS_OF.VOTE as readonly string[]).includes(k))
        expect(submitTalk.length).toBeLessThanOrEqual(BLUFF_PHASE_TALK_MAX)
        expect(voteTalk.length).toBeLessThanOrEqual(BLUFF_PHASE_TALK_MAX)
        expect(round.reactions).toBeLessThanOrEqual(BLUFF_REVEAL_REACTIONS_MAX)
        for (const [id, count] of round.perBot) {
          const p = s.players.find((x) => x.id === id)!
          expect(count, p.name).toBeLessThanOrEqual(Math.min(BLUFF_SPEECH_CAP, botTraitsFor(p.name).bavardage))
        }
        total += round.kinds.length + round.reactions
      }
    }
    // Des bots qui parlent, mais pas à chaque coup : 40 parties × 3 manches.
    expect(total).toBeGreaterThan(60)
    expect(total).toBeLessThan(40 * 3 * 4)
  })

  it('une table de bots seuls ne dit rien', () => {
    for (let n = 0; n < 20; n += 1) {
      const personas = createRng(`q${n}`).shuffle(BOT_PERSONAS).slice(0, 4)
      const { bubbles } = play(personas.map((p, i) => bot(`b${i}`, p.name)), `bots-${n}`)
      for (const round of bubbles) {
        expect(round.kinds).toEqual([])
        expect(round.reactions).toBe(0)
      }
    }
  })
})
