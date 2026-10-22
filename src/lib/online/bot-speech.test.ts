import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { BOT_PERSONAS, botTraitsFor, type BotTrait } from './bot-personas'
import {
  ASK_MIN_REMAINING_MS,
  askOf,
  botsByTempo,
  lastHumanSpeech,
  mostSuspect,
  pick,
  reactionBudget,
  reactionDare,
  readSpeechTable,
  remarkOf,
  seededReactions,
  speechSuspicion,
  standsBy,
  type BotSpeech,
  type ReactionCandidate,
  type SpeechPlayer,
} from './bot-speech'
import { createLGState, lgSuspicion, type LGDebateSpeech, type LGState } from '@/lib/loup-garou/engine'

/**
 * Socle de parole des jeux à débat, éprouvé sur des kinds FACTICES : rien ici
 * ne dépend d'un jeu, sauf l'égalité finale avec le score du Loup-Garou (le
 * socle en est extrait, il doit en rester la partie publique à l'identique).
 */

type Kind = 'suspect' | 'defend' | 'ally' | 'rally' | 'doubt' | 'ask' | 'oops' | 'cheer'
const isRemark = (k: Kind) => k === 'oops'
const isAsk = (k: Kind) => k === 'ask'

const T0 = 1_000_000

/** Identifiant commençant par `b` = bot ; le nom porte le persona. */
const P = (id: string, name: string, alive = true): SpeechPlayer => ({ id, name, isBot: id.startsWith('b'), alive })
const H = P('h', 'Moi')
const H2 = P('h2', 'Toi')
const DEDE = P('b1', 'Dédé') // agressif 0,9 — tempo 800 — 2 paroles, loyauté 0,1
const HUGUETTE = P('b2', 'Huguette') // prudent 0,1 — tempo 3200 — 1 parole, loyauté 0,75
const KEKE = P('b3', 'Kéké') // agressif 0,8 — tempo 900 — 3 paroles, loyauté 0,65
const NORBERT = P('b4', 'Norbert') // suiveur 0,35 — tempo 2000 — 3 paroles, loyauté 0,5
const CONVERTI = P('b5', 'Riqui') // sans persona : suiveur 0,5 — tempo 2000 — 2 paroles
const MAURICETTE = P('b6', 'Mauricette') // suiveur 0,5 — tempo 1900 — 3 paroles, loyauté 0,9

const say = (playerId: string, kind: Kind, targetId: string | null, round = 1): BotSpeech<Kind> => ({
  playerId,
  kind,
  targetId,
  round,
})

function table(players: SpeechPlayer[], speech: BotSpeech<Kind>[] = [], engineCap = 3) {
  return readSpeechTable({ players, speech, round: 1, engineCap, isRemark, isAsk })
}

/** Un rand qui compte ses tirages. */
function counted(values: number[]) {
  let calls = 0
  return {
    rand: () => values[Math.min(values.length - 1, calls++)],
    get calls() {
      return calls
    },
  }
}

describe('readSpeechTable : compteurs de la manche', () => {
  it('ne lit que la manche demandée, sépare bots, humains et morts', () => {
    const dead = P('b9', 'Gaston', false)
    const t = table([H, DEDE, KEKE, dead], [say('b1', 'suspect', 'h', 0), say('b3', 'ally', 'b1')])
    expect(t.speech).toEqual([say('b3', 'ally', 'b1')])
    expect(t.alive.map((p) => p.id)).toEqual(['h', 'b1', 'b3'])
    expect(t.bots.map((p) => p.id)).toEqual(['b1', 'b3'])
    expect(t.humans.map((p) => p.id)).toEqual(['h'])
    expect(t.byId.get('b9')).toBe(dead)
  })

  it('count, opened (remarque exclue), reacted (deux paroles hors remarque et interpellation), spokeAfter, alliedTo', () => {
    const t = table(
      [H, DEDE, KEKE],
      [
        say('b1', 'oops', 'h'),
        say('b3', 'ask', 'h'),
        say('h', 'suspect', 'b3'),
        say('b3', 'defend', 'h'),
        say('b3', 'ally', 'b1'),
      ]
    )
    expect(t.count('b1')).toBe(1)
    expect(t.opened('b1')).toBe(false)
    expect(t.opened('b3')).toBe(true)
    expect(t.count('b3')).toBe(3)
    expect(t.reacted('b3')).toBe(true)
    expect(t.reacted('b1')).toBe(false)
    expect(t.spokeAfter('b3', 2)).toBe(true)
    expect(t.spokeAfter('b1', 0)).toBe(false)
    expect(t.alliedTo('b3', 'b1')).toBe(true)
    expect(t.alliedTo('b1', 'b3')).toBe(false)
  })

  it('cap = min(plafond moteur, bavardage du persona) ; un converti parle deux fois ; un inconnu prend le plafond', () => {
    const t = table([H, DEDE, HUGUETTE, KEKE, CONVERTI], [], 3)
    expect(t.cap('b2')).toBe(1)
    expect(t.cap('b1')).toBe(2)
    expect(t.cap('b3')).toBe(3)
    expect(t.cap('b5')).toBe(2)
    expect(t.cap('inconnu')).toBe(3)
    const tight = table([H, KEKE], [say('b3', 'suspect', 'h'), say('b3', 'ally', 'h')], 2)
    expect(tight.cap('b3')).toBe(2)
    expect(tight.underCap('b3')).toBe(false)
  })

  it('les traits sont lus une fois par bot (cache) et suivent le persona', () => {
    const t = table([H, DEDE])
    expect(t.traits(DEDE)).toBe(t.traits(DEDE))
    expect(t.traits(DEDE)).toEqual(botTraitsFor('Dédé'))
  })
})

describe('botsByTempo, pick, standsBy', () => {
  it('tempo croissant, puis ordre de table à tempo égal', () => {
    const t = table([H, HUGUETTE, CONVERTI, NORBERT, DEDE, KEKE])
    expect(botsByTempo(t).map((b) => b.name)).toEqual(['Dédé', 'Kéké', 'Riqui', 'Norbert', 'Huguette'])
  })

  it('pick borne l’index, même pour rand → 1', () => {
    expect(pick(['a', 'b', 'c'], () => 0)).toBe('a')
    expect(pick(['a', 'b', 'c'], () => 0.999999)).toBe('c')
    expect(pick(['a', 'b', 'c'], () => 1)).toBe('c')
  })

  it('un fidèle (loyauté > seuil) tient l’allié qu’il s’est choisi ce round, pas un autre ; un traître jamais', () => {
    const t = table([H, DEDE, MAURICETTE], [say('b6', 'ally', 'h'), say('b1', 'ally', 'h')])
    expect(standsBy(t, MAURICETTE, 'h')).toBe(true)
    expect(standsBy(t, MAURICETTE, 'b1')).toBe(false)
    expect(standsBy(t, DEDE, 'h')).toBe(false)
    expect(standsBy(t, MAURICETTE, 'h', 0.95)).toBe(false)
  })
})

describe('réactions à une parole humaine : budget et dé', () => {
  it('lastHumanSpeech : la dernière parole humaine de la manche, sinon null', () => {
    const t = table([H, H2, DEDE], [say('h', 'suspect', 'b1'), say('b1', 'defend', 'h'), say('h2', 'ally', 'b1')])
    expect(lastHumanSpeech(t)).toEqual({ index: 2, speech: say('h2', 'ally', 'b1'), author: H2 })
    expect(lastHumanSpeech(table([H, DEDE], [say('b1', 'suspect', 'h')]))).toBeNull()
  })

  it('au plus deux réponses de bots par parole humaine ; une remarque ne compte pas', () => {
    const t = table(
      [H, DEDE, KEKE, NORBERT],
      [say('h', 'suspect', 'b1'), say('b1', 'defend', 'h'), say('b4', 'oops', 'h'), say('b3', 'rally', 'b1')]
    )
    const budget = reactionBudget(t, 0)
    expect(budget.answers.map((sp) => sp.playerId)).toEqual(['b1', 'b3'])
    expect(budget.left).toBe(0)
    expect(reactionBudget(t, 0, 3).left).toBe(1)
  })

  it('un bot qui n’a pas répondu répond sans dé ; un engagé timide se tait sans dé ; un engagé audacieux tire UN dé', () => {
    const speech = [
      say('b3', 'suspect', 'h'),
      say('b4', 'suspect', 'h'),
      say('h', 'suspect', 'b3'),
      say('b3', 'defend', 'h'),
      say('h', 'suspect', 'b3'),
    ]
    const t = table([H, KEKE, NORBERT, DEDE], speech)
    const { answers } = reactionBudget(t, 4)
    const dice = counted([0.5, 0.9])
    const dares = reactionDare(t, { answers, accusedId: 'b3', rand: dice.rand })
    expect(dares(DEDE)).toBe(true)
    expect(dice.calls).toBe(0)
    // Norbert n'a qu'une parole hors remarque : pas encore engagé.
    expect(dares(NORBERT)).toBe(true)
    // Kéké (0,8) a ouvert puis répondu : il revient à la charge au dé 0,5 < 0,8.
    expect(dares(KEKE)).toBe(true)
    expect(dice.calls).toBe(1)
    expect(dares(KEKE)).toBe(false)
    expect(dice.calls).toBe(2)
  })

  it('sous l’audace minimale, jamais de seconde réaction, sans même tirer', () => {
    const t = table(
      [H, NORBERT],
      [say('b4', 'suspect', 'h'), say('h', 'suspect', 'b4'), say('b4', 'defend', 'h'), say('h', 'suspect', 'b4')]
    )
    const dice = counted([0])
    const dares = reactionDare(t, { answers: [], accusedId: 'b4', rand: dice.rand })
    expect(dares(NORBERT)).toBe(false)
    expect(dice.calls).toBe(0)
    expect(reactionDare(t, { answers: [], accusedId: 'b4', rand: dice.rand, minAudace: 0.3 })(NORBERT)).toBe(true)
  })

  it('un seul dé par parole : les engagés consultés avant le premier répondant se sont tus, ils ne relancent pas', () => {
    // Ordre de consultation : l'accusé Dédé, puis par tempo Kéké (900), Norbert (2000), Roger (2200).
    const ROGER = P('b7', 'Roger') // suiveur 0,4 — tempo 2200
    const engaged = [
      say('b1', 'suspect', 'h'),
      say('b1', 'ally', 'b3'),
      say('b3', 'suspect', 'b1'),
      say('b3', 'ally', 'h'),
      say('b4', 'suspect', 'b1'),
      say('b7', 'suspect', 'b3'),
      say('b7', 'ally', 'h'),
      say('h', 'suspect', 'b1'),
    ]
    const players = [H, DEDE, KEKE, NORBERT, ROGER]
    const t = table(players, [...engaged, say('b4', 'rally', 'b1')])
    const dice = counted([0])
    const dares = reactionDare(t, { answers: reactionBudget(t, 7).answers, accusedId: 'b1', rand: dice.rand })
    expect(dares(DEDE)).toBe(false)
    expect(dares(KEKE)).toBe(false)
    expect(dice.calls).toBe(0)
    // Roger vient après Norbert, premier répondant : il n'a pas encore été consulté, il tire son dé.
    expect(dares(ROGER)).toBe(true)
    expect(dice.calls).toBe(1)

    // L'accusé a répondu le premier : personne d'autre n'a encore été consulté, Kéké tire.
    const first = table(players, [...engaged, say('b1', 'defend', 'h')])
    const dice2 = counted([0])
    const dares2 = reactionDare(first, { answers: reactionBudget(first, 7).answers, accusedId: 'b1', rand: dice2.rand })
    expect(dares2(KEKE)).toBe(true)
    expect(dice2.calls).toBe(1)
  })
})

describe('remarkOf : un mot sur la manche passée', () => {
  const remarkFor = (bot: SpeechPlayer) => ({ kind: 'oops' as const, targetId: `cible-${bot.id}` })

  it('dans l’ordre de table, un par appel, au plus deux par manche', () => {
    const players = [H, KEKE, NORBERT, MAURICETTE]
    expect(remarkOf(table(players), remarkFor)).toEqual({ playerId: 'b3', kind: 'oops', targetId: 'cible-b3' })
    expect(remarkOf(table(players, [say('b3', 'oops', 'x')]), remarkFor)?.playerId).toBe('b4')
    expect(remarkOf(table(players, [say('b3', 'oops', 'x'), say('b4', 'oops', 'x')]), remarkFor)).toBeNull()
    expect(remarkOf(table(players, [say('b3', 'oops', 'x')]), remarkFor, { maxPerRound: 1 })).toBeNull()
  })

  it('garde une parole pour ouvrir : un taiseux (une parole) s’en passe ; un bot qui a ouvert ne revient pas dessus', () => {
    expect(remarkOf(table([H, HUGUETTE]), remarkFor)).toBeNull()
    expect(remarkOf(table([H, KEKE, NORBERT], [say('b3', 'suspect', 'h')]), remarkFor)?.playerId).toBe('b4')
  })

  it('rien à dire pour ce bot : le suivant', () => {
    const only = (bot: SpeechPlayer) => (bot.id === 'b6' ? { kind: 'oops' as const, targetId: 'x' } : null)
    expect(remarkOf(table([H, KEKE, NORBERT, MAURICETTE]), only)?.playerId).toBe('b6')
    expect(remarkOf(table([H, KEKE]), () => null)).toBeNull()
  })
})

describe('askOf : « et toi, tu votes qui ? »', () => {
  const ENDS = T0 + 60_000
  const silent = (t: ReturnType<typeof table>) => (h: SpeechPlayer) => t.count(h.id) === 0
  const ask = (t: ReturnType<typeof table>, now = T0, ends: number | null = ENDS) =>
    askOf(t, now, ends, { isSilent: silent(t) })

  it('le plus audacieux à qui il reste une parole interpelle le premier humain silencieux', () => {
    const t = table([H, H2, NORBERT, KEKE, DEDE], [say('b4', 'ally', 'b3'), say('b3', 'ally', 'b4'), say('b1', 'ally', 'b3')])
    expect(ask(t)).toEqual({ playerId: 'b1', targetId: 'h' })
  })

  it('pas sous 20 s restantes (strict), ni sans échéance, ni sans humain', () => {
    const t = table([H, KEKE])
    expect(ask(t, ENDS - ASK_MIN_REMAINING_MS)).toBeNull()
    expect(ask(t, ENDS - ASK_MIN_REMAINING_MS - 1)).toEqual({ playerId: 'b3', targetId: 'h' })
    expect(ask(t, T0, null)).toBeNull()
    expect(ask(table([KEKE, NORBERT]))).toBeNull()
  })

  it('jamais deux fois le même bot ni le même humain ; au plus deux par manche', () => {
    const players = [H, H2, P('h3', 'Lui'), KEKE, NORBERT, MAURICETTE]
    const once = table(players, [say('b3', 'ask', 'h')])
    expect(ask(once)).toEqual({ playerId: 'b6', targetId: 'h2' })
    const twice = table(players, [say('b3', 'ask', 'h'), say('b6', 'ask', 'h2')])
    expect(ask(twice)).toBeNull()
    expect(askOf(twice, T0, ENDS, { isSilent: silent(twice), maxPerRound: 3 })).toEqual({ playerId: 'b4', targetId: 'h3' })
  })

  it('le silence est la règle du jeu (isSilent) ; un bot au plafond n’interpelle pas', () => {
    const t = table([H, DEDE, KEKE], [say('b1', 'suspect', 'b3'), say('b1', 'ally', 'b3')])
    expect(askOf(t, T0, ENDS, { isSilent: () => false })).toBeNull()
    expect(ask(t)).toEqual({ playerId: 'b3', targetId: 'h' })
  })
})

describe('mostSuspect', () => {
  it('les mieux classés dans l’ordre des candidats (égalité stable), les absents ignorés', () => {
    const score = new Map([
      ['a', 1],
      ['b', 3],
      ['c', 3],
      ['d', -2],
    ])
    expect(mostSuspect(score, ['c', 'a', 'b', 'z'])).toEqual(['c', 'b'])
    expect(mostSuspect(score, ['b', 'c'])).toEqual(['b', 'c'])
    expect(mostSuspect(score, ['d', 'z'])).toEqual(['d'])
    expect(mostSuspect(score, ['z'])).toEqual([])
  })
})

describe('speechSuspicion : la part publique du score de soupçon', () => {
  const base = { candidates: ['a', 'b', 'c'], round: 2, botId: 'me', isHuman: (id: string) => id.startsWith('h') }
  const calm = { rancune: 0, loyaute: 0 }

  it('poids fixés : +2 suspect/rally, −1 doubt, −2 ally, +1 à l’accusateur visé par un defend ; les autres manches et kinds ignorés', () => {
    const score = speechSuspicion<Kind>({
      ...base,
      trait: 'prudent',
      mood: calm,
      speech: [
        say('x', 'suspect', 'a', 2),
        say('x', 'rally', 'a', 2),
        say('x', 'doubt', 'b', 2),
        say('x', 'ally', 'c', 2),
        say('x', 'defend', 'b', 2),
        say('x', 'cheer', 'c', 2),
        say('x', 'suspect', 'c', 1),
        say('x', 'suspect', 'c', 3),
      ],
    })
    expect([...score.entries()]).toEqual([
      ['a', 4],
      ['b', 0],
      ['c', -2],
    ])
  })

  it('un suiveur compte double les paroles humaines, et lui seul', () => {
    const speech = [say('h1', 'suspect', 'a', 2), say('x', 'suspect', 'b', 2)]
    expect(speechSuspicion<Kind>({ ...base, trait: 'suiveur', mood: calm, speech }).get('a')).toBe(4)
    expect(speechSuspicion<Kind>({ ...base, trait: 'suiveur', mood: calm, speech }).get('b')).toBe(2)
    expect(speechSuspicion<Kind>({ ...base, trait: 'agressif', mood: calm, speech }).get('a')).toBe(2)
  })

  it('rancune : +round(3r) à qui m’accuse, +round(2r) à qui abonde contre moi ou m’accusait la manche passée', () => {
    const speech = [say('a', 'suspect', 'me', 2), say('b', 'rally', 'me', 2), say('c', 'suspect', 'me', 1)]
    const full = speechSuspicion<Kind>({ ...base, trait: 'prudent', mood: { rancune: 1, loyaute: 0 }, speech })
    expect([...full.values()]).toEqual([3, 2, 2])
    const half = speechSuspicion<Kind>({ ...base, trait: 'prudent', mood: { rancune: 0.5, loyaute: 0 }, speech })
    expect([...half.values()]).toEqual([2, 1, 1])
  })

  it('loyauté : −round(2l) à qui je me suis allié ce round (ma parole, pas celle qu’on m’offre)', () => {
    const speech = [say('me', 'ally', 'a', 2), say('b', 'ally', 'me', 2)]
    const score = speechSuspicion<Kind>({ ...base, trait: 'prudent', mood: { rancune: 0, loyaute: 0.9 }, speech })
    expect(score.get('a')).toBe(-2 - 2)
    expect(score.get('b')).toBe(0)
  })

  it('hors candidats (soi, mort, écarté par le jeu) : jamais compté', () => {
    const score = speechSuspicion<Kind>({
      ...base,
      trait: 'agressif',
      mood: { rancune: 1, loyaute: 1 },
      speech: [say('a', 'suspect', 'me', 2), say('mort', 'suspect', 'me', 2), say('x', 'suspect', 'mort', 2)],
    })
    expect([...score.keys()]).toEqual(['a', 'b', 'c'])
    expect(score.get('a')).toBe(3)
  })

  it('ÉGALITÉ avec lgSuspicion sur un Loup-Garou sans rôle spécial, sans mort, sans corbeau, maire ni égalité', () => {
    const LG_KINDS: LGDebateSpeech['kind'][] = ['suspect', 'defend', 'ally', 'rally', 'doubt', 'ask', 'toldYou', 'wrong']
    const traits: BotTrait[] = ['prudent', 'farceur', 'suiveur', 'agressif']
    let checked = 0
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = createRng(`egalite-${seed}`)
      const count = 4 + Math.floor(rng.next() * 9)
      const players = Array.from({ length: count }, (_, i) => ({
        id: i < 2 ? `h${i}` : `b${i}`,
        name: i < 2 ? `Humain ${i}` : BOT_PERSONAS[(seed + i) % BOT_PERSONAS.length].name,
        isBot: i >= 2,
      }))
      const created = createLGState(players, `egalite-${seed}`, 60_000, 0)
      const round = 1 + Math.floor(rng.next() * 4)
      const ids = players.map((p) => p.id)
      const at = () => ids[Math.floor(rng.next() * ids.length)]
      const debateSpeech: LGDebateSpeech[] = Array.from({ length: Math.floor(rng.next() * 25) }, () => ({
        playerId: at(),
        kind: LG_KINDS[Math.floor(rng.next() * LG_KINDS.length)],
        targetId: rng.next() < 0.1 ? null : at(),
        round: round - Math.floor(rng.next() * 3),
      }))
      const state: LGState = {
        ...created,
        phase: 'day-debate',
        round,
        players: created.players.map((p) => ({ ...p, role: 'villageois' })),
        debateSpeech,
      }
      for (const botId of ids) {
        const trait = traits[Math.floor(rng.next() * traits.length)]
        const mood = { rancune: rng.next(), loyaute: rng.next() }
        const lg = lgSuspicion(state, botId, trait, mood)
        const shared = speechSuspicion({
          candidates: ids.filter((id) => id !== botId),
          speech: debateSpeech,
          round,
          botId,
          trait,
          mood,
          isHuman: (id) => id.startsWith('h'),
        })
        expect([...shared.entries()], `${seed}/${botId}`).toEqual([...lg.entries()])
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })
})

describe('seededReactions : les réactions dérivées d’une révélation', () => {
  const players = [
    { id: 'h', name: 'Riqui', isBot: false },
    { id: 'g', name: 'Gépéto', isBot: true }, // bavardage 3 : réagit à coup sûr
    { id: 'm', name: 'Marcel', isBot: true }, // bavardage 3
    { id: 'b', name: 'Bernadette', isBot: true }, // bavardage 1
    { id: 'c', name: 'Kevin_du_93', isBot: true }, // converti, sans persona
  ]
  const cand = (playerId: string, targetId: string, aimsHuman: boolean, kind = 'k'): ReactionCandidate<string> => ({
    speech: { playerId, kind, targetId, round: 3 },
    aimsHuman,
  })
  const run = (candidates: ReactionCandidate<string>[], speech: BotSpeech<string>[] = [], seed = 's', max = 2) =>
    seededReactions({ candidates, players, speech, round: 3, engineCap: 2, max, seed })

  it('les candidates qui visent un humain passent devant, un tirage par auteur, au plus `max`', () => {
    for (const seed of ['s', 't', 'u', 'v']) {
      const out = run([cand('g', 'm', false, 'a'), cand('m', 'g', false), cand('g', 'h', true, 'b'), cand('m', 'h', true)], [], seed, 1)
      expect(out).toHaveLength(1)
      expect(out[0].targetId).toBe('h')
      const two = run([cand('g', 'm', false, 'a'), cand('g', 'h', true, 'b'), cand('m', 'h', true)], [], seed)
      expect(two.map((sp) => sp.playerId).sort()).toEqual(['g', 'm'])
      expect(two.find((sp) => sp.playerId === 'g')?.kind).toBe('b')
    }
  })

  it('l’ordre des auteurs est tiré de la graine : le premier bavard à table ne monopolise pas la parole', () => {
    let first = 0
    for (let n = 0; n < 400; n += 1) {
      const [out] = run([cand('g', 'h', true), cand('m', 'h', true)], [], `tour-${n}`, 1)
      if (out.playerId === 'g') first += 1
    }
    expect(first / 400).toBeGreaterThan(0.35)
    expect(first / 400).toBeLessThan(0.65)
  })

  it('jamais un humain, un converti, une parole à soi, ni un bot au bout de son plafond (manche en cours seulement)', () => {
    expect(run([cand('h', 'g', false), cand('c', 'h', true), cand('g', 'g', false)])).toEqual([])
    const full = [1, 2].map(() => ({ playerId: 'g', kind: 'x', targetId: 'h', round: 3 }))
    expect(run([cand('g', 'h', true), cand('m', 'h', true)], full).map((sp) => sp.playerId)).toEqual(['m'])
    expect(run([cand('g', 'h', true)], full.map((sp) => ({ ...sp, round: 2 })))).toHaveLength(1)
  })

  it('déterministe à graine égale, et la chance suit le bavardage (Bernadette : un tiers)', () => {
    expect(run([cand('b', 'h', true)], [], 'x')).toEqual(run([cand('b', 'h', true)], [], 'x'))
    let spoke = 0
    for (let n = 0; n < 900; n += 1) spoke += run([cand('b', 'h', true)], [], `graine-${n}`).length
    expect(spoke / 900).toBeGreaterThan(0.28)
    expect(spoke / 900).toBeLessThan(0.39)
  })
})

describe('le socle ne dépend d’aucun jeu', () => {
  it('ni bot-speech.ts ni le fil client n’importent un jeu (Loup-Garou, Imposteur, Menteur, Espion, Bluff, Sans Filtre, Dilemmes)', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const files = [
      'lib/online/bot-speech.ts',
      'components/online/bot-speech/bot-speech-feed.ts',
      'components/online/bot-speech/BotSpeechFeed.tsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(src, file), 'utf8')
      const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
      expect(imports.length, file).toBeGreaterThan(0)
      expect(imports.filter((spec) => /loup-garou|imposteur|menteur|espion|bluff|sans-filtre|dilemmes/.test(spec)), file).toEqual([])
    }
  })

  it('la fabrique catalogue-spec (vitest + les 4 catalogues entiers) n’est importée que par des tests, jamais par l’application', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const offenders: string[] = []
    let testImporters = 0
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
          const source = readFileSync(full, 'utf8')
          if (!/(?:\bfrom\s+|\bimport\(\s*)['"][^'"]*catalogue-spec['"]/.test(source)) continue
          if (entry.name.endsWith('.test.ts')) testImporters += 1
          else offenders.push(relative(src, full))
        }
      }
    }
    walk(src)
    expect(offenders).toEqual([])
    // Le relevé a bien vu au moins le test du Loup-Garou.
    expect(testImporters).toBeGreaterThan(0)
  })
})
