import { describe, expect, expectTypeOf, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, DEFAULT_BOT_TRAITS, botTraitsFor, type BotTrait, type BotTraits } from '@/lib/online/bot-personas'
import {
  createImposteurState,
  imposteurAlive,
  reduceImposteur,
  toImposteurClientView,
  IMPOSTEUR_BOT_VOTE_MARGIN_MS,
  IMPOSTEUR_COUNTDOWN_MS,
  IMPOSTEUR_EMPTY_CLUE,
  type ImposteurClientView,
  type ImposteurReveal,
  type ImposteurState,
  type ImposteurWordPair,
} from './engine'
import {
  botInsight,
  botSelfBelief,
  imposteurBotClue,
  imposteurBotVote,
  imposteurBotVoteNow,
  imposteurSuspicion,
  IMPOSTEUR_PAST_ROUND_WEIGHT,
  IMPOSTEUR_SUSPICION,
  IMPOSTEUR_TALLY_WEIGHT,
  type ImposteurClueBook,
} from './bot-brain'
import { applyImposteurBotAction, imposteurClueBookFor, type ImposteurBotDeps } from './server-adapter'

/**
 * Cerveau des bots : soupçon, croyance sur son camp, vote et bluff — sur la
 * VUE CLIENT du bot et la liste de SON mot, rien d'autre.
 */

const T0 = 1_000_000
const PAIR: ImposteurWordPair = { a: 'plage', b: 'piscine' }
const LISTS: Record<string, string[]> = {
  plage: ['été', 'serviette', 'sable', 'vagues', 'parasol', 'marée', 'crabe'],
  piscine: ['été', 'serviette', 'chlore', 'maître-nageur', 'plongeoir', 'bonnet de bain', 'pédiluve'],
}
const deps: ImposteurBotDeps = {
  clueListFor: (_lang, pair, word) =>
    (pair.a === PAIR.a && pair.b === PAIR.b) || (pair.a === PAIR.b && pair.b === PAIR.a)
      ? [...(LISTS[word] ?? [])]
      : null,
}

const traitsOf = (trait: BotTrait, audace = 0): BotTraits => ({ ...DEFAULT_BOT_TRAITS, trait, audace })
const SAGE = traitsOf('prudent')
const zero = () => 0

type TableSpec = {
  /** id → mot, dans l'ordre de table ; « me » est le bot observé. */
  words: Record<string, string>
  /** Mot des imposteurs (défaut : piscine). */
  imposteurWord?: string
  eliminated?: string[]
  /** [auteur, texte, manche] dans l'ordre de parole. */
  clues?: [string, string, number][]
  round?: number
  previousReveal?: ImposteurReveal | null
}

/** État de vote fabriqué à la main : camps déduits des mots, aucun vote encore. */
function table(spec: TableSpec): ImposteurState {
  const ids = Object.keys(spec.words)
  const imposteurWord = spec.imposteurWord ?? 'piscine'
  const base = createImposteurState(
    ids.map((id) => ({ id, name: id, isBot: true })),
    [PAIR],
    'seed',
    T0
  )
  const players = ids.map((id) => ({
    ...base.players.find((p) => p.id === id)!,
    word: spec.words[id],
    team: spec.words[id] === imposteurWord ? ('imposteur' as const) : ('civil' as const),
    eliminated: (spec.eliminated ?? []).includes(id),
  }))
  return {
    ...base,
    phase: 'vote',
    players,
    imposteurCount: players.filter((p) => p.team === 'imposteur').length,
    clueOrder: players.filter((p) => !p.eliminated).map((p) => p.id),
    clueTurnIdx: players.filter((p) => !p.eliminated).length,
    clues: (spec.clues ?? []).map(([playerId, text, round]) => ({ playerId, text, round })),
    round: spec.round ?? 1,
    previousReveal: spec.previousReveal ?? null,
  }
}

const viewOf = (s: ImposteurState, id = 'me') => toImposteurClientView(s, id)
const listOf = (s: ImposteurState, id = 'me') => LISTS[s.players.find((p) => p.id === id)!.word]

describe('contrat anti-triche', () => {
  it('chaque fonction prend la VUE client, qui ne porte ni l’autre mot ni un camp de vivant', () => {
    expectTypeOf(botSelfBelief).parameter(0).toEqualTypeOf<ImposteurClientView>()
    expectTypeOf(imposteurSuspicion).parameter(0).toEqualTypeOf<ImposteurClientView>()
    expectTypeOf(imposteurBotVote).parameter(0).toEqualTypeOf<ImposteurClientView>()
    expectTypeOf(imposteurBotClue).parameter(0).toEqualTypeOf<ImposteurClientView>()
    for (const myWord of ['plage', 'piscine']) {
      const s = table({ words: { me: myWord, a: 'plage', b: 'plage', c: 'piscine', d: 'plage' } })
      const json = JSON.stringify(viewOf(s))
      expect(json).toContain(myWord)
      expect(json).not.toContain(myWord === 'plage' ? 'piscine' : 'plage')
      expect(json).not.toContain('imposteur"')
    }
  })

  it('INVARIANCE PAR BROUILLAGE : 100 graines, camps et mots des autres vivants permutés → même indice, même soupçon, même vote', () => {
    let clueChecks = 0
    for (let seed = 0; seed < 100; seed += 1) {
      const players = Array.from({ length: 6 }, (_, i) => ({
        id: `bot-${i + 1}`,
        name: BOT_PERSONAS[(i + seed) % BOT_PERSONAS.length].name,
        isBot: true,
      }))
      const raw = createImposteurState(players, [PAIR], seed, T0 - IMPOSTEUR_COUNTDOWN_MS)
      let s = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
      const rand = createRng(`play-${seed}`).next
      // Avance d'un nombre d'indices variable selon la graine (parfois jusqu'au vote).
      for (let k = seed % 7; k > 0 && s.phase === 'clue'; k -= 1) {
        const r = applyImposteurBotAction(s, rand, T0, deps)
        if (!r.ok) throw new Error(r.error)
        s = r.state
      }
      const shaker = createRng(`shake-${seed}`)
      const subjectId = s.phase === 'clue' ? s.clueOrder[s.clueTurnIdx] : imposteurAlive(s)[seed % 6].id
      const subject = s.players.find((p) => p.id === subjectId)!
      const others = s.players.filter((p) => !p.eliminated && p.id !== subjectId)
      const shuffledWords = shaker.shuffle(others.map((p) => p.word))
      const scrambled: ImposteurState = {
        ...s,
        players: s.players.map((p) => {
          if (p.eliminated) return p
          const team = shaker.chance(0.5) ? ('civil' as const) : ('imposteur' as const)
          if (p.id === subjectId) return { ...p, team }
          return { ...p, team, word: shuffledWords[others.findIndex((o) => o.id === p.id)] }
        }),
      }
      const traits = botTraitsFor(subject.name)
      const own = LISTS[subject.word]
      const v1 = viewOf(s, subjectId)
      const v2 = viewOf(scrambled, subjectId)
      expect(JSON.stringify(v2)).toBe(JSON.stringify(v1))
      expect([...imposteurSuspicion(v2, subjectId, own, traits)]).toEqual([
        ...imposteurSuspicion(v1, subjectId, own, traits),
      ])
      expect(imposteurBotVote(v2, subjectId, own, traits, createRng(`v-${seed}`).next)).toBe(
        imposteurBotVote(v1, subjectId, own, traits, createRng(`v-${seed}`).next)
      )
      if (s.phase === 'clue') {
        // Bout en bout par l'adaptateur : la paire est déduite de l'état brouillé.
        const a = applyImposteurBotAction(s, createRng(`c-${seed}`).next, T0, deps)
        const b = applyImposteurBotAction(scrambled, createRng(`c-${seed}`).next, T0, deps)
        expect(a.ok && b.ok).toBe(true)
        if (a.ok && b.ok) expect(b.state.clues.at(-1)).toEqual(a.state.clues.at(-1))
        clueChecks += 1
      }
    }
    expect(clueChecks).toBeGreaterThan(50)
  })
})

describe('botSelfBelief', () => {
  const words = { me: 'plage', a: 'plage', b: 'piscine', c: 'plage', d: 'plage' }

  it('rien de public → « unsure », même si tous mes voisins disent des inconnus', () => {
    const s = table({ words, clues: [['a', 'chlore', 1], ['b', 'plongeoir', 1], ['c', 'pédiluve', 1]] })
    expect(botSelfBelief(viewOf(s), 'me')).toBe('unsure')
  })

  it('un éliminé révélé : son mot = le mien → son camp ; l’autre mot → le camp inverse', () => {
    // Civil éliminé, mot ≠ le mien → je suis l'imposteur.
    const civilOut = table({ words: { me: 'piscine', a: 'plage', b: 'plage', c: 'plage', d: 'plage' }, eliminated: ['a'] })
    expect(botSelfBelief(viewOf(civilOut), 'me')).toBe('imposteur')
    // Imposteur éliminé au mot = le mien → je suis imposteur aussi (table à 2).
    const mateOut = table({
      words: { me: 'piscine', a: 'piscine', b: 'plage', c: 'plage', d: 'plage', e: 'plage', f: 'plage' },
      eliminated: ['a'],
    })
    expect(botSelfBelief(viewOf(mateOut), 'me')).toBe('imposteur')
    // Civil éliminé au mot = le mien → civil.
    const sameOut = table({ words, eliminated: ['a'] })
    expect(botSelfBelief(viewOf(sameOut), 'me')).toBe('civil')
    // Imposteur éliminé, mot ≠ le mien → civil.
    const impOut = table({ words, eliminated: ['b'] })
    expect(botSelfBelief(viewOf(impOut), 'me')).toBe('civil')
  })

  it('assez de joueurs ont dit MON mot pour être les civils → « imposteur »', () => {
    const w = { me: 'piscine', a: 'plage', b: 'plage', c: 'plage', d: 'plage' }
    const one = table({ words: w, clues: [['a', 'pas une piscine', 1]] })
    expect(botSelfBelief(viewOf(one), 'me')).toBe('unsure')
    const two = table({ words: w, clues: [['a', 'pas une piscine', 1], ['b', 'Piscines', 1]] })
    expect(botSelfBelief(viewOf(two), 'me')).toBe('imposteur')
    // Table à 2 imposteurs : deux porteurs de l'autre mot peuvent être les imposteurs.
    const seven = table({
      words: { me: 'piscine', a: 'plage', b: 'plage', c: 'piscine', d: 'piscine', e: 'piscine', f: 'piscine' },
      imposteurWord: 'plage',
      clues: [['a', 'pas une piscine', 1], ['b', 'Piscines', 1]],
    })
    expect(botSelfBelief(viewOf(seven), 'me')).toBe('unsure')
  })
})

describe('imposteurSuspicion et imposteurBotVote', () => {
  const words = { me: 'plage', a: 'plage', b: 'piscine', c: 'plage', d: 'plage' }

  it('poids des signaux : muet, mon mot, inconnu, concordant, perroquet (concordant + perroquet = inconnu)', () => {
    const s = table({
      words,
      clues: [
        ['a', IMPOSTEUR_EMPTY_CLUE, 1],
        ['b', 'chlore', 1],
        ['c', 'Sable', 1],
        ['d', 'sable', 1],
      ],
    })
    const scores = imposteurSuspicion(viewOf(s), 'me', listOf(s), SAGE)
    expect(scores.get('a')).toBe(IMPOSTEUR_SUSPICION.mute)
    expect(scores.get('b')).toBe(IMPOSTEUR_SUSPICION.unknown)
    expect(scores.get('c')).toBe(IMPOSTEUR_SUSPICION.concordant)
    expect(scores.get('d')).toBe(IMPOSTEUR_SUSPICION.concordant + IMPOSTEUR_SUSPICION.parrot)
    // Redire l'indice d'un autre ne prouve pas qu'on porte mon mot : autant qu'un inconnu.
    expect(scores.get('d')).toBe(IMPOSTEUR_SUSPICION.unknown)
    expect(scores.has('me')).toBe(false)
    const mine = table({ words: { ...words, me: 'piscine', b: 'plage' }, clues: [['b', 'pas une piscine', 1]] })
    expect(imposteurSuspicion(viewOf(mine), 'me', listOf(mine), SAGE).get('b')).toBe(IMPOSTEUR_SUSPICION.saysMyWord)
  })

  it('le muet est voté avant l’inconnu ; « mon mot » prime sur tout', () => {
    const muteVsUnknown = table({
      words,
      clues: [['a', IMPOSTEUR_EMPTY_CLUE, 1], ['b', 'chlore', 1], ['c', 'sable', 1], ['d', 'vagues', 1]],
    })
    expect(imposteurBotVote(viewOf(muteVsUnknown), 'me', listOf(muteVsUnknown), SAGE, zero)).toBe('a')
    const myWord = table({
      words: { me: 'piscine', a: 'piscine', b: 'plage', c: 'piscine', d: 'piscine' },
      imposteurWord: 'plage',
      clues: [['a', IMPOSTEUR_EMPTY_CLUE, 1], ['b', 'pas une piscine', 1], ['c', 'marée', 1], ['d', 'chlore', 1]],
    })
    expect(imposteurBotVote(viewOf(myWord), 'me', listOf(myWord), SAGE, zero)).toBe('b')
  })

  it('un concordant n’est jamais voté tant qu’existe un inconnu (200 tables tirées)', () => {
    const rng = createRng('concordant')
    const unknowns = LISTS.piscine.slice(2)
    const concordants = LISTS.plage.slice(2)
    for (let i = 0; i < 200; i += 1) {
      const others = ['a', 'b', 'c', 'd', 'e']
      const unknownSet = new Set(others.filter(() => rng.chance(0.4)))
      if (unknownSet.size === 0) unknownSet.add('e')
      const s = table({
        words: { me: 'plage', a: 'plage', b: 'plage', c: 'plage', d: 'plage', e: 'plage' },
        imposteurWord: 'none',
        clues: others.map((id, k) => [id, (unknownSet.has(id) ? unknowns : concordants)[k], 1]),
      })
      const trait = (['prudent', 'suiveur', 'agressif'] as const)[i % 3]
      const target = imposteurBotVote(viewOf(s), 'me', listOf(s), traitsOf(trait, rng.next()), rng.next)
      expect(unknownSet.has(target!)).toBe(true)
    }
  })

  it('les manches passées comptent moitié', () => {
    const s = table({
      words,
      round: 2,
      clues: [
        ['a', IMPOSTEUR_EMPTY_CLUE, 1],
        ['b', 'chlore', 1],
        ['a', 'sable', 2],
        ['b', 'parasol', 2],
      ],
    })
    const scores = imposteurSuspicion(viewOf(s), 'me', listOf(s), SAGE)
    const w = IMPOSTEUR_PAST_ROUND_WEIGHT
    expect(scores.get('a')).toBe(w * IMPOSTEUR_SUSPICION.mute + IMPOSTEUR_SUSPICION.concordant)
    expect(scores.get('b')).toBe(w * IMPOSTEUR_SUSPICION.unknown + IMPOSTEUR_SUSPICION.concordant)
  })

  it('mémoire du vote d’avant : un suiveur la suit en entier, les autres à moitié', () => {
    const reveal: ImposteurReveal = {
      round: 1,
      tally: { a: 3, x: 1 },
      eliminatedId: null,
      tie: false,
      word: null,
      team: null,
      sips: 0,
    }
    const s = table({
      words: { me: 'plage', a: 'plage', b: 'piscine', c: 'plage', x: 'plage' },
      round: 2,
      previousReveal: reveal,
      clues: [['a', 'sable', 2], ['b', 'serviette', 2], ['c', 'vagues', 2], ['x', 'crabe', 2]],
    })
    const follower = imposteurSuspicion(viewOf(s), 'me', listOf(s), traitsOf('suiveur'))
    const careful = imposteurSuspicion(viewOf(s), 'me', listOf(s), SAGE)
    const share = (IMPOSTEUR_TALLY_WEIGHT * 3) / 4
    expect(follower.get('a')).toBe(IMPOSTEUR_SUSPICION.concordant + share)
    expect(careful.get('a')).toBe(IMPOSTEUR_SUSPICION.concordant + share / 2)
    expect(imposteurBotVote(viewOf(s), 'me', listOf(s), traitsOf('suiveur'), zero)).toBe('a')
  })

  it('farceur : dévie vers le deuxième quand rand() < audace', () => {
    const s = table({
      words,
      clues: [['a', IMPOSTEUR_EMPTY_CLUE, 1], ['b', 'chlore', 1], ['c', 'sable', 1], ['d', 'vagues', 1]],
    })
    expect(imposteurBotVote(viewOf(s), 'me', listOf(s), traitsOf('farceur', 1), zero)).toBe('b')
    expect(imposteurBotVote(viewOf(s), 'me', listOf(s), traitsOf('farceur', 0), zero)).toBe('a')
    expect(imposteurBotVote(viewOf(s), 'me', listOf(s), traitsOf('suiveur', 1), zero)).toBe('a')
  })

  it('après une égalité, une chance sur deux de changer d’avis (la partie ne se fige pas)', () => {
    const tied: ImposteurReveal = {
      round: 1,
      tally: { a: 2, b: 2 },
      eliminatedId: null,
      tie: true,
      word: null,
      team: null,
      sips: 0,
    }
    const s = table({
      words,
      round: 2,
      previousReveal: tied,
      clues: [['a', IMPOSTEUR_EMPTY_CLUE, 2], ['b', 'chlore', 2], ['c', 'sable', 2], ['d', 'vagues', 2]],
    })
    const rng = createRng('shake')
    const picks = new Set(
      Array.from({ length: 50 }, () => imposteurBotVote(viewOf(s), 'me', listOf(s), SAGE, rng.next))
    )
    expect([...picks].sort()).toEqual(['a', 'b'])
  })

  it('jamais soi ni un éliminé ; null sans cible ; sans catalogue, le muet reste voté', () => {
    const rng = createRng('targets')
    for (let i = 0; i < 100; i += 1) {
      const s = table({
        words,
        eliminated: ['c'],
        clues: [['a', 'sable', 1], ['b', rng.chance(0.5) ? 'chlore' : 'été', 1], ['d', 'vagues', 1]],
      })
      const t = imposteurBotVote(viewOf(s), 'me', listOf(s), traitsOf('farceur', rng.next()), rng.next)
      expect(['a', 'b', 'd']).toContain(t)
    }
    const alone = table({ words: { me: 'plage', a: 'plage', b: 'piscine' }, eliminated: ['a', 'b'] })
    expect(imposteurBotVote(viewOf(alone), 'me', [], SAGE, zero)).toBeNull()
    const noList = table({ words, clues: [['a', 'sable', 1], ['b', IMPOSTEUR_EMPTY_CLUE, 1], ['c', 'chlore', 1]] })
    expect(imposteurBotVote(viewOf(noList), 'me', [], SAGE, zero)).toBe('b')
  })
})

describe('bluff : le bot qui se sait imposteur se fond', () => {
  // Un civil (plage) est sorti : « me » (piscine) se sait imposteur.
  const words = { me: 'piscine', out: 'plage', a: 'plage', b: 'plage', c: 'plage', d: 'plage' }

  it('indice : perroquet de la manche courante (valide pour mon mot) ou le plus vague', () => {
    const s = table({
      words,
      eliminated: ['out'],
      round: 2,
      clues: [
        ['out', 'sable', 1],
        ['a', 'vagues', 1],
        ['a', 'parasol', 2],
        ['b', 'pas une piscine', 2],
      ],
    })
    expect(botSelfBelief(viewOf(s), 'me')).toBe('imposteur')
    // rand < ½ : perroquet — jamais « pas une piscine », que le moteur me refuserait.
    expect(imposteurBotClue(viewOf(s), 'me', listOf(s), traitsOf('agressif', 1), zero)).toBe('parasol')
    // rand ≥ ½ : le plus vague de ma liste, quels que soient trait et manche.
    expect(imposteurBotClue(viewOf(s), 'me', listOf(s), traitsOf('agressif', 1), () => 0.99)).toBe('été')
    const rng = createRng('bluff')
    for (let i = 0; i < 100; i += 1) {
      const clue = imposteurBotClue(viewOf(s), 'me', listOf(s), traitsOf('agressif', 1), rng.next)
      expect(['parasol', 'été']).toContain(clue)
    }
  })

  it('le même bot, sans révélation : prudent en manche 1, au ton de son persona ensuite', () => {
    const first = table({ words, round: 1, clues: [['a', 'sable', 1]] })
    expect(botSelfBelief(viewOf(first), 'me')).toBe('unsure')
    expect(imposteurBotClue(viewOf(first), 'me', listOf(first), traitsOf('agressif'), zero)).toBe('été')
    const second = table({ words, round: 2, clues: [['a', 'sable', 1], ['me', 'été', 1]] })
    // Agressif, manche 2 : dernier tiers (rang 4) + 1 → « bonnet de bain ».
    expect(imposteurBotClue(viewOf(second), 'me', listOf(second), traitsOf('agressif'), zero)).toBe('bonnet de bain')
  })

  it('vote : vise le plus voté de la manche d’avant parmi les non-concordants', () => {
    const reveal: ImposteurReveal = {
      round: 1,
      tally: { out: 3, b: 2, c: 1 },
      eliminatedId: 'out',
      tie: false,
      word: 'plage',
      team: 'civil',
      sips: 3,
    }
    const s = table({
      words,
      eliminated: ['out'],
      round: 2,
      previousReveal: reveal,
      clues: [['a', 'crabe', 2], ['b', 'marée', 2], ['c', 'sable', 2], ['d', 'vagues', 2]],
    })
    expect(imposteurBotVote(viewOf(s), 'me', listOf(s), SAGE, zero)).toBe('b')
    // Sans mémoire de vote : le plus « inconnu ».
    const fresh = table({
      words,
      eliminated: ['out'],
      round: 2,
      clues: [['a', 'serviette', 2], ['b', 'marée', 2], ['c', IMPOSTEUR_EMPTY_CLUE, 2], ['d', 'été', 2]],
    })
    expect(imposteurBotVote(viewOf(fresh), 'me', listOf(fresh), SAGE, zero)).toBe('c')
  })

  it('table à 2 imposteurs : il épargne son complice même s’il était le plus voté', () => {
    const reveal: ImposteurReveal = {
      round: 1,
      tally: { out: 3, mate: 2, b: 1 },
      eliminatedId: 'out',
      tie: false,
      word: 'plage',
      team: 'civil',
      sips: 3,
    }
    const s = table({
      words: { me: 'piscine', mate: 'piscine', out: 'plage', a: 'plage', b: 'plage', c: 'plage', d: 'plage' },
      eliminated: ['out'],
      round: 2,
      previousReveal: reveal,
      clues: [['mate', 'chlore', 2], ['a', 'crabe', 2], ['b', 'marée', 2], ['c', 'sable', 2], ['d', 'vagues', 2]],
    })
    const rng = createRng('mate')
    for (let i = 0; i < 50; i += 1) {
      expect(imposteurBotVote(viewOf(s), 'me', listOf(s), SAGE, rng.next)).not.toBe('mate')
    }
    expect(imposteurBotVote(viewOf(s), 'me', listOf(s), SAGE, zero)).toBe('b')
  })
})

/** Mots publics de la vue d'un joueur : le sien et ceux des éliminés. */
const publicWords = (s: ImposteurState, id: string) =>
  new Set(viewOf(s, id).players.map((p) => p.word).filter((w) => w !== ''))

/**
 * Brouillage pour `subjectId` : camps de TOUS les vivants tirés au hasard, mots
 * des autres vivants permutés entre eux — la paire et tout ce qui est public
 * (mots et camps des éliminés, indices, votes passés) restent tels quels.
 */
function scrambleFor(s: ImposteurState, subjectId: string, shaker: ReturnType<typeof createRng>): ImposteurState {
  const others = s.players.filter((p) => !p.eliminated && p.id !== subjectId)
  const shuffledWords = shaker.shuffle(others.map((p) => p.word))
  return {
    ...s,
    players: s.players.map((p) => {
      if (p.eliminated) return p
      const team = shaker.chance(0.5) ? ('civil' as const) : ('imposteur' as const)
      if (p.id === subjectId) return { ...p, team }
      return { ...p, team, word: shuffledWords[others.findIndex((o) => o.id === p.id)] }
    }),
  }
}

describe('contrat anti-triche du bluff informé', () => {
  it('INVARIANCE PAR BROUILLAGE, parties avancées (éliminés, bluff informé) : camps secrets brouillés → même indice, même vote ; le carnet ne s’ouvre que sur un mot public', () => {
    let checks = 0
    let informed = 0
    for (let seed = 0; seed < 60; seed += 1) {
      const players = Array.from({ length: 7 }, (_, i) => ({
        id: `bot-${i + 1}`,
        name: BOT_PERSONAS[(i + seed) % BOT_PERSONAS.length].name,
        isBot: true,
      }))
      const raw = createImposteurState(players, [PAIR], seed, T0 - IMPOSTEUR_COUNTDOWN_MS)
      let s = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
      const rand = createRng(`deep-${seed}`).next
      for (let step = 0; s.phase !== 'finished' && step < 600; step += 1) {
        const subjects =
          s.phase === 'clue'
            ? [s.clueOrder[s.clueTurnIdx]]
            : s.phase === 'vote'
              ? imposteurAlive(s).filter((p) => !s.pendingVotes[p.id]).map((p) => p.id)
              : []
        for (const id of subjects) {
          const shaken = scrambleFor(s, id, createRng(`shake-${seed}-${step}-${id}`))
          const v1 = viewOf(s, id)
          const v2 = viewOf(shaken, id)
          expect(JSON.stringify(v2)).toBe(JSON.stringify(v1))
          const subject = s.players.find((p) => p.id === id)!
          const traits = botTraitsFor(subject.name)
          const own = LISTS[subject.word]
          const asked: string[] = []
          const spy =
            (book: ImposteurClueBook): ImposteurClueBook =>
            (word) => {
              asked.push(word)
              return book(word)
            }
          const b1 = spy(imposteurClueBookFor(s, id, deps))
          const b2 = imposteurClueBookFor(shaken, id, deps)
          const decide = (v: ImposteurClientView, b: ImposteurClueBook, key: string) =>
            s.phase === 'clue'
              ? imposteurBotClue(v, id, own, traits, createRng(key).next, b)
              : imposteurBotVoteNow(v, id, own, traits, createRng(key).next, b)
          const key = `d-${seed}-${step}-${id}`
          expect(decide(v2, b2, key)).toBe(decide(v1, b1, key))
          const known = publicWords(s, id)
          for (const word of asked) expect(known.has(word)).toBe(true)
          const insight = botInsight(v1, id)
          if (insight.belief === 'imposteur' && insight.civilWord) informed += 1
          checks += 1
        }
        if (s.phase === 'clue' && subjects.length === 1) {
          // Bout en bout par l'adaptateur : paire et carnet déduits de l'état brouillé.
          const id = subjects[0]
          const shaken = scrambleFor(s, id, createRng(`shake-${seed}-${step}-${id}`))
          const a = applyImposteurBotAction(s, createRng(`e-${seed}-${step}`).next, T0, deps)
          const b = applyImposteurBotAction(shaken, createRng(`e-${seed}-${step}`).next, T0, deps)
          expect(a.ok && b.ok).toBe(true)
          if (a.ok && b.ok) expect(b.state.clues.at(-1)).toEqual(a.state.clues.at(-1))
        }
        const at = s.phaseEndsAt !== null ? s.phaseEndsAt - 1 : T0
        const r = applyImposteurBotAction(s, rand, at, deps)
        if (r.ok) s = r.state
        else if (s.phaseEndsAt !== null) {
          s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt })
        } else break
      }
    }
    expect(checks).toBeGreaterThan(1000)
    // Le bluff informé a bien été mis à l'épreuve, pas seulement le jeu ordinaire.
    expect(informed).toBeGreaterThan(30)
  })

  it('INVARIANCE BOUT EN BOUT : camps de TOUS les vivants brouillés → chaque tick de l’adaptateur (indice, paroles, vote groupé) identique', () => {
    // Le camp d'un vivant n'est dans aucune vue client, la sienne comprise :
    // le brouiller pour tous laisse intactes TOUTES les vues à la fois. Le
    // vote groupé, où chaque bot décide sur la sienne, est ainsi comparé de
    // bout en bout — un adaptateur qui lirait `bot.team` pour choisir une
    // liste ou une cible ferait diverger un tick.
    const decisionsOf = (st: ImposteurState) => ({
      clues: st.clues,
      speech: st.speech ?? [],
      votes: st.phase === 'vote' ? st.pendingVotes : null,
      reveal: st.lastReveal ? { tally: st.lastReveal.tally, out: st.lastReveal.eliminatedId } : null,
    })
    let voteTicks = 0
    let speechTicks = 0
    let informedVoters = 0
    for (let seed = 0; seed < 60; seed += 1) {
      // Un humain sur deux tables : les bots parlent alors avant de voter.
      const withHuman = seed % 2 === 1
      const seats = [
        ...(withHuman ? [{ id: 'h1', name: 'Léa', isBot: false }] : []),
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `bot-${i + 1}`,
          name: BOT_PERSONAS[(i + seed) % BOT_PERSONAS.length].name,
          isBot: true,
        })),
      ]
      const imposteurs = seed % 3 === 0 ? 2 : undefined
      const raw = createImposteurState(seats, [PAIR], seed, T0 - IMPOSTEUR_COUNTDOWN_MS, imposteurs)
      let s = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
      const human = createRng(`camps-h-${seed}`)
      for (let step = 0; s.phase !== 'finished' && step < 800; step += 1) {
        const at = s.phaseEndsAt === null ? T0 : s.phaseEndsAt - (withHuman ? IMPOSTEUR_BOT_VOTE_MARGIN_MS + 1 : 1)
        if (withHuman && s.phase === 'clue' && s.clueOrder[s.clueTurnIdx] === 'h1') {
          const word = s.players.find((p) => p.id === 'h1')!.word
          const text = imposteurBotClue(viewOf(s, 'h1'), 'h1', LISTS[word], DEFAULT_BOT_TRAITS, human.next)
          s = reduceImposteur(s, { type: 'CLUE', playerId: 'h1', text, now: at })
          continue
        }
        const shaker = createRng(`camps-${seed}-${step}`)
        const shaken: ImposteurState = {
          ...s,
          players: s.players.map((p) =>
            p.eliminated ? p : { ...p, team: shaker.chance(0.5) ? ('civil' as const) : ('imposteur' as const) }
          ),
        }
        for (const p of imposteurAlive(s)) {
          expect(JSON.stringify(viewOf(shaken, p.id))).toBe(JSON.stringify(viewOf(s, p.id)))
        }
        if (s.phase === 'vote') {
          for (const p of imposteurAlive(s)) {
            if (!p.isBot || s.pendingVotes[p.id]) continue
            const insight = botInsight(viewOf(s, p.id), p.id)
            if (insight.belief === 'imposteur' && insight.civilWord) informedVoters += 1
          }
        }
        const a = applyImposteurBotAction(s, createRng(`tick-${seed}-${step}`).next, at, deps)
        // À la révélation, le bot ne fait que « continuer » : c'est le moteur qui
        // lit les camps (fin de partie), pas une décision de bot.
        const b =
          s.phase === 'reveal' ? a : applyImposteurBotAction(shaken, createRng(`tick-${seed}-${step}`).next, at, deps)
        expect(b.ok).toBe(a.ok)
        if (a.ok && b.ok) {
          expect(decisionsOf(b.state)).toEqual(decisionsOf(a.state))
          if ((a.state.speech ?? []).length > (s.speech ?? []).length) speechTicks += 1
          else if (s.phase === 'vote') voteTicks += 1
          s = a.state
        } else if (s.phaseEndsAt !== null) {
          s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt })
        } else break
      }
    }
    // Tout a bien été exercé (mesure du 14/10/2026 : 246 votes groupés, 481
    // paroles, 406 bots votant en bluff informé) — bornes à la moitié.
    expect(voteTicks).toBeGreaterThan(120)
    expect(speechTicks).toBeGreaterThan(240)
    expect(informedVoters).toBeGreaterThan(200)
  })
})

describe('bluff informé : le mot des civils, rendu public par un éliminé', () => {
  const bookOf = (s: ImposteurState, id = 'me') => imposteurClueBookFor(s, id, deps)

  it('botInsight : camp et mot des civils, tirés des seuls éliminés', () => {
    const base = { me: 'piscine', out: 'plage', mate: 'piscine', a: 'plage', b: 'plage', c: 'plage', d: 'plage' }
    const insight = (eliminated: string[], words: Record<string, string> = base) =>
      botInsight(viewOf(table({ words, eliminated })), 'me')
    expect(insight([])).toEqual({ belief: 'unsure', civilWord: null })
    // Civil sorti à l'autre mot : je suis l'imposteur, et je connais LEUR mot.
    expect(insight(['out'])).toEqual({ belief: 'imposteur', civilWord: 'plage' })
    // Imposteur sorti à mon mot : je suis imposteur, sans connaître le mot des civils.
    expect(insight(['mate'])).toEqual({ belief: 'imposteur', civilWord: null })
    expect(insight(['mate', 'out'])).toEqual({ belief: 'imposteur', civilWord: 'plage' })
    // Civil sorti à mon mot, ou imposteur sorti à l'autre : je suis civil.
    const civil = { me: 'plage', out: 'plage', mate: 'piscine', a: 'plage', b: 'plage', c: 'piscine', d: 'plage' }
    expect(insight(['out'], civil)).toEqual({ belief: 'civil', civilWord: 'plage' })
    expect(insight(['mate'], civil)).toEqual({ belief: 'civil', civilWord: 'plage' })
  })

  // Un civil (plage) est sorti : « me » (piscine) se sait imposteur et connaît « plage ».
  const words = { me: 'piscine', out: 'plage', a: 'plage', b: 'plage', c: 'plage', d: 'plage' }
  const round2 = (extra: [string, string, number][] = []) =>
    table({
      words,
      eliminated: ['out'],
      round: 2,
      clues: [
        ['out', 'sable', 1],
        ['a', 'vagues', 1],
        ['b', 'été', 1],
        ['c', 'parasol', 1],
        ['d', 'marée', 1],
        ['me', 'chlore', 1],
        ...extra,
      ],
    })

  it('indice : tiré de la liste des civils, au ton du persona — jamais une marque de son mot', () => {
    const s = round2()
    // Agressif, manche 2 : rang 4 + 1 → « marée », déjà dit → le plus proche libre, « crabe ».
    expect(imposteurBotClue(viewOf(s), 'me', listOf(s), traitsOf('agressif'), zero, bookOf(s))).toBe('crabe')
    // Prudent : rang 0 + 1 → « serviette ».
    expect(imposteurBotClue(viewOf(s), 'me', listOf(s), SAGE, zero, bookOf(s))).toBe('serviette')
    const rng = createRng('cover')
    for (let i = 0; i < 200; i += 1) {
      const trait = (['prudent', 'suiveur', 'farceur', 'agressif'] as const)[i % 4]
      const clue = imposteurBotClue(viewOf(s), 'me', listOf(s), traitsOf(trait, rng.next()), rng.next, bookOf(s))
      expect(LISTS.plage).toContain(clue)
    }
    // Sans carnet, il se fond avec SA liste, comme avant.
    expect(LISTS.piscine).toContain(imposteurBotClue(viewOf(s), 'me', listOf(s), SAGE, () => 0.99))
  })

  it('liste des civils épuisée : il redit un indice à lui qui y figure, sinon le moins entendu', () => {
    const allPlage: [string, string, number][] = LISTS.plage.map((c) => ['a', c, 2])
    const withMine = round2([['me', 'serviette', 2], ...allPlage])
    expect(imposteurBotClue(viewOf(withMine), 'me', listOf(withMine), SAGE, zero, bookOf(withMine))).toBe('serviette')
    // Rien à lui dans la liste des civils (« chlore ») : l'indice le moins entendu,
    // « crabe » et « serviette » (une fois chacun) — le plus proche du rang visé.
    const without = round2(allPlage)
    expect(imposteurBotClue(viewOf(without), 'me', listOf(without), SAGE, zero, bookOf(without))).toBe('serviette')
  })

  it('vote : il lit la table avec la liste des civils et épargne qui a dit une marque de son mot', () => {
    const s = table({
      words: { me: 'piscine', mate: 'piscine', out: 'plage', a: 'plage', b: 'plage', c: 'plage', d: 'plage' },
      eliminated: ['out'],
      round: 2,
      clues: [
        ['out', 'sable', 1],
        ['mate', 'chlore', 1],
        ['a', 'été', 1],
        ['b', 'vagues', 1],
        ['c', 'parasol', 1],
        ['d', 'serviette', 1],
        ['mate', 'pédiluve', 2],
        ['a', 'marée', 2],
        ['b', 'crabe', 2],
        ['c', 'été', 2],
        ['d', 'vagues', 2],
      ],
    })
    // Lu avec la liste des civils, le complice est le plus louche (deux indices hors liste)…
    const civilLens = imposteurSuspicion(viewOf(s), 'me', LISTS.plage, SAGE)
    expect(civilLens.get('mate')).toBe(Math.max(...civilLens.values()))
    // … mais il l'épargne et vote avec les civils : un des perroquets, c ou d.
    const rng = createRng('cover-vote')
    for (let i = 0; i < 50; i += 1) {
      expect(['c', 'd']).toContain(imposteurBotVote(viewOf(s), 'me', listOf(s), SAGE, rng.next, bookOf(s)))
    }
  })

  it('un carnet sans le mot des civils ne change rien : il se fond avec sa liste', () => {
    // L'imposteur « mate » (piscine, comme moi) est sorti : je me sais imposteur, sans leur mot.
    const s = table({
      words: { me: 'piscine', mate: 'piscine', a: 'plage', b: 'plage', c: 'plage', d: 'plage', e: 'plage' },
      eliminated: ['mate'],
      round: 2,
      clues: [['mate', 'chlore', 1], ['a', 'sable', 1], ['a', 'vagues', 2]],
    })
    const book = bookOf(s)
    expect(book('plage')).toBeNull()
    for (const rand of [zero, () => 0.99]) {
      expect(imposteurBotClue(viewOf(s), 'me', listOf(s), SAGE, rand, book)).toBe(
        imposteurBotClue(viewOf(s), 'me', listOf(s), SAGE, rand)
      )
    }
  })
})
