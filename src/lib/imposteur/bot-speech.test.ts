import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { BOT_PERSONAS, botTraitsFor } from '@/lib/online/bot-personas'
import { ASK_MAX_PER_ROUND, ASK_MIN_REMAINING_MS } from '@/lib/online/bot-speech'
import {
  createImposteurState,
  reduceImposteur,
  toImposteurClientView,
  IMPOSTEUR_INTENTS_MAX,
  IMPOSTEUR_SPEECH_CAP,
  type ImposteurAction,
  type ImposteurReveal,
  type ImposteurSpeech,
  type ImposteurSpeechKind,
  type ImposteurState,
  type ImposteurWordPair,
} from './engine'
import { imposteurBotVote } from './bot-brain'
import { CLUE_ALLY_SHARE_MIN, CLUE_ALLY_SHARE_SPAN, imposteurBotSpeechMove } from './bot-speech'
import { applyImposteurBotAction, applyImposteurRoomAction, type ImposteurBotDeps } from './server-adapter'

/**
 * Paroles des bots de l'Imposteur : un coup par tick, signal fort seulement,
 * annonces de vote, interpellations bornées — sur la vue client de chaque bot
 * et la liste de SON mot (catalogue factice), rand seedé ou fixé.
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
const always = (x: number) => () => x

type Seat = [id: string, name: string, isBot: boolean, word: string]

/** 1 humain + 4 bots, un par trait. Tempo : Raoul, Gépéto, Suzette, Barnabé. */
const SOLO: Seat[] = [
  ['h1', 'Léa', false, 'plage'],
  ['bot-1', 'Barnabé', true, 'plage'], // prudent, audace 0,25
  ['bot-2', 'Raoul', true, 'plage'], // agressif, audace 0,85, rancune 0,9
  ['bot-3', 'Suzette', true, 'plage'], // suiveur, loyauté 0,85
  ['bot-4', 'Gépéto', true, 'piscine'], // farceur, audace 0,8
]

type Spec = {
  seats?: Seat[]
  phase?: 'clue' | 'vote'
  round?: number
  /** Ordre de parole ; défaut : les vivants, ordre de table. */
  clueOrder?: string[]
  clueTurnIdx?: number
  clues?: [string, string, number?][]
  speech?: ImposteurSpeech[]
  eliminated?: string[]
  votes?: Record<string, string>
  previousReveal?: ImposteurReveal | null
  phaseEndsAt?: number
}

/** État fabriqué à la main : camps déduits des mots (piscine = imposteur). */
function table(spec: Spec = {}): ImposteurState {
  const seats = spec.seats ?? SOLO
  const base = createImposteurState(
    seats.map(([id, name, isBot]) => ({ id, name, isBot })),
    [PAIR],
    'seed',
    T0
  )
  const eliminated = spec.eliminated ?? []
  const round = spec.round ?? 1
  const phase = spec.phase ?? 'vote'
  const order = spec.clueOrder ?? seats.map(([id]) => id).filter((id) => !eliminated.includes(id))
  return {
    ...base,
    players: seats.map(([id, name, isBot, word]) => ({
      id,
      name,
      isBot,
      leftAt: null,
      word,
      team: word === 'piscine' ? ('imposteur' as const) : ('civil' as const),
      eliminated: eliminated.includes(id),
    })),
    phase,
    phaseSeq: 3,
    phaseEndsAt: spec.phaseEndsAt ?? T0 + 60_000,
    round,
    clueOrder: order,
    clueTurnIdx: spec.clueTurnIdx ?? (phase === 'vote' ? order.length : 0),
    clues: (spec.clues ?? []).map(([playerId, text, r]) => ({ playerId, text, round: r ?? round })),
    speech: spec.speech ?? [],
    pendingVotes: spec.votes ?? {},
    previousReveal: spec.previousReveal ?? null,
  }
}

const sp = (playerId: string, kind: ImposteurSpeechKind, targetId: string, round = 1): ImposteurSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})
const say = (playerId: string, kind: ImposteurSpeechKind, targetId: string): ImposteurAction => ({
  type: 'SPEAK',
  playerId,
  kind,
  targetId,
})

const speechDeps = (s: ImposteurState) => ({
  ownCluesOf: (id: string) => LISTS[s.players.find((p) => p.id === id)!.word] ?? [],
})
const move = (s: ImposteurState, rand: () => number = always(0.5), now = T0) =>
  imposteurBotSpeechMove(s, now, rand, speechDeps(s))
const tick = (s: ImposteurState, rand: () => number, now = T0) => applyImposteurBotAction(s, rand, now, deps)

/** Toutes les clues de SOLO, la dernière par un bot (aucune réaction (b) au vote). */
const SOLO_CLUES: [string, string][] = [
  ['h1', 'sable'],
  ['bot-1', 'vagues'],
  ['bot-2', '…'],
  ['bot-3', 'parasol'],
  ['bot-4', 'chlore'],
]

/** Enchaîne les ticks bot jusqu'au refus ; rend chaque état intermédiaire. */
function runTicks(s0: ImposteurState, rand: () => number, now = T0, max = 40): ImposteurState[] {
  const states = [s0]
  let s = s0
  for (let i = 0; i < max; i += 1) {
    const r = tick(s, rand, now)
    if (!r.ok) {
      expect(r.error).toBe('NOT_BOT_TURN')
      break
    }
    s = r.state
    states.push(s)
  }
  return states
}

/** Une seule chose change d'un état à l'autre : une parole, un indice, le vote groupé ou la révélation. */
function expectOneMovePerTick(states: ImposteurState[]) {
  for (let i = 1; i < states.length; i += 1) {
    const [a, b] = [states[i - 1], states[i]]
    const spoke = (b.speech ?? []).length - (a.speech ?? []).length
    const clued = b.clues.length - a.clues.length
    const voted = Object.keys(b.pendingVotes).length > Object.keys(a.pendingVotes).length || b.phase === 'reveal'
    expect([spoke === 1, clued === 1, voted && spoke === 0 && clued === 0].filter(Boolean)).toHaveLength(1)
  }
}

describe('(b) réaction à l’indice d’un humain : signal fort seulement', () => {
  const clueTurn = (humanClue: string, extra: [string, string][] = []) =>
    table({
      phase: 'clue',
      clueOrder: ['h1', ...extra.map(([id]) => id), 'bot-1', 'bot-2', 'bot-3', 'bot-4'].filter(
        (id, i, all) => all.indexOf(id) === i
      ),
      clueTurnIdx: 1 + extra.length,
      clues: [['h1', humanClue]],
    })

  it('« … » : le plus rapide accuse (Raoul), une seule fois — puis le bot au tour donne son indice', () => {
    const s = clueTurn('…')
    expect(move(s)).toEqual(say('bot-2', 'suspect', 'h1'))
    const after = reduceImposteur(s, move(s)!)
    expect(move(after)).toBeNull()
    const r = tick(after, always(0.5))
    expect(r.ok && r.state.clues).toHaveLength(2)
  })

  it('un indice qui contient MON mot : seul un bot qui porte ce mot réagit, le plus rapide d’entre eux', () => {
    // Gépéto (piscine) est le seul à lire « piscines » comme son mot ; les autres n'y voient qu'un inconnu.
    expect(move(clueTurn('piscines olympiques'))).toEqual(say('bot-4', 'suspect', 'h1'))
  })

  it('perroquet : la redite d’un indice déjà donné par un autre', () => {
    const s = table({
      phase: 'clue',
      clueOrder: ['bot-1', 'h1', 'bot-2', 'bot-3', 'bot-4'],
      clueTurnIdx: 2,
      clues: [
        ['bot-1', 'été'],
        ['h1', 'été'],
      ],
    })
    expect(move(s)).toEqual(say('bot-2', 'suspect', 'h1'))
  })

  it('un indice simplement inconnu ne fait JAMAIS parler, quel que soit le dé', () => {
    for (const r of [0, 0.5, 0.99]) expect(move(clueTurn('zorglub'), always(r))).toBeNull()
  })

  it('l’indice d’un bot ne fait jamais réagir, même « … »', () => {
    const s = table({ phase: 'clue', clueOrder: ['bot-1', 'h1', 'bot-2', 'bot-3', 'bot-4'], clueTurnIdx: 1, clues: [['bot-1', '…']] })
    expect(move(s, always(0))).toBeNull()
  })

  it(`concordant : alliance du plus rapide qui le trouve concordant, à ${CLUE_ALLY_SHARE_MIN} + ${CLUE_ALLY_SHARE_SPAN} × loyauté`, () => {
    const raoulShare = CLUE_ALLY_SHARE_MIN + CLUE_ALLY_SHARE_SPAN * botTraitsFor('Raoul').loyaute
    expect(move(clueTurn('sable'), always(raoulShare - 0.01))).toEqual(say('bot-2', 'ally', 'h1'))
    expect(move(clueTurn('sable'), always(raoulShare + 0.01))).toBeNull()
    // Raoul et Gépéto portent l'autre mot : Suzette, fidèle (0,85), est la plus rapide à trouver « sable » concordant.
    const seats: Seat[] = SOLO.map(([id, name, isBot, word]) => [id, name, isBot, id === 'bot-2' ? 'piscine' : word])
    const s = table({ seats, phase: 'clue', clueOrder: ['h1', 'bot-1', 'bot-2', 'bot-3', 'bot-4'], clueTurnIdx: 1, clues: [['h1', 'sable']] })
    const suzetteShare = CLUE_ALLY_SHARE_MIN + CLUE_ALLY_SHARE_SPAN * botTraitsFor('Suzette').loyaute
    expect(move(s, always(suzetteShare - 0.01))).toEqual(say('bot-3', 'ally', 'h1'))
    expect(move(s, always(raoulShare + 0.01))).toEqual(say('bot-3', 'ally', 'h1'))
  })

  it('une partie entière d’indices : exactement une réaction par indice humain à signal fort', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const rand = createRng(`b-${seed}`).next
      let s = table({ phase: 'clue', clueOrder: ['bot-1', 'h1', 'bot-2', 'bot-3', 'bot-4'], clueTurnIdx: 0 })
      while (s.phase === 'clue') {
        if (s.clueOrder[s.clueTurnIdx] === 'h1') {
          s = reduceImposteur(s, { type: 'CLUE', playerId: 'h1', text: seed % 2 ? 'zorglub' : 'chlorée', now: T0 })
          continue
        }
        const r = tick(s, rand)
        if (!r.ok) throw new Error(r.error)
        s = r.state
      }
      const atHuman = (s.speech ?? []).filter((x) => x.targetId === 'h1' && x.kind === 'suspect')
      // « chlorée » contient le mot de personne mais un fragment de « chlore » : inconnu partout ; « zorglub » aussi.
      expect(atHuman).toHaveLength(0)
    }
    for (let seed = 0; seed < 30; seed += 1) {
      const rand = createRng(`m-${seed}`).next
      let s = table({ phase: 'clue', clueOrder: ['bot-1', 'h1', 'bot-2', 'bot-3', 'bot-4'], clueTurnIdx: 0 })
      while (s.phase === 'clue') {
        if (s.clueOrder[s.clueTurnIdx] === 'h1') {
          s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: `clue#${s.phaseSeq}`, now: s.phaseEndsAt! })
          continue
        }
        const r = tick(s, rand)
        if (!r.ok) throw new Error(r.error)
        s = r.state
      }
      expect((s.speech ?? []).filter((x) => x.targetId === 'h1' && x.kind === 'suspect')).toHaveLength(1)
    }
  })
})

describe('(a) réponse à une accusation humaine', () => {
  const accused = (botId: string, extra: ImposteurSpeech[] = []) =>
    table({ clues: SOLO_CLUES, speech: [...extra, sp('h1', 'suspect', botId)] })

  it('agressif : contre-accuse son plus suspect — l’accusateur (rancune) ou un indice plus net', () => {
    const withGepeto = (clue: string) =>
      table({
        clues: [...SOLO_CLUES.slice(0, 4), ['bot-4', clue]],
        speech: [sp('h1', 'suspect', 'bot-2')],
      })
    // Raoul : h1 « sable » concordant −2 + rancune round(3 × 0,9) = +3 → 1 ; Barnabé et Suzette −2 ;
    // Gépéto « serviette » concordant −2 : l'accusateur est le plus suspect.
    expect(move(withGepeto('serviette'))).toEqual(say('bot-2', 'suspect', 'h1'))
    // Gépéto « … » (+3) passe devant l'accusateur (1).
    expect(move(withGepeto('…'))).toEqual(say('bot-2', 'suspect', 'bot-4'))
  })

  it('prudent et suiveur se défendent face à l’accusateur ; farceur contre-accuse s’il ose (rand < audace), sinon se défend', () => {
    expect(move(accused('bot-1'))).toEqual(say('bot-1', 'defend', 'h1'))
    expect(move(accused('bot-3'))).toEqual(say('bot-3', 'defend', 'h1'))
    const gepeto = botTraitsFor('Gépéto').audace
    expect(move(accused('bot-4'), always(gepeto + 0.01))).toEqual(say('bot-4', 'defend', 'h1'))
    const dared = move(accused('bot-4'), always(gepeto - 0.01))
    expect(dared?.type === 'SPEAK' && dared.kind).toBe('suspect')
  })

  it('accusé par l’allié qu’il s’est choisi, un fidèle se défend sans contre-attaquer', () => {
    const s = accused('bot-3', [sp('bot-3', 'ally', 'h1')])
    expect(move(s, always(0))).toEqual(say('bot-3', 'defend', 'h1'))
  })

  it('l’accusé répond hors bavardage, sous le seul plafond moteur', () => {
    // Gaston (prudent, bavardage 1) a déjà parlé : il répond quand même.
    const seats: Seat[] = SOLO.map((seat) => (seat[0] === 'bot-1' ? ['bot-1', 'Gaston', true, 'plage'] : seat))
    const s = table({ seats, clues: SOLO_CLUES, speech: [sp('bot-1', 'doubt', 'bot-2'), sp('h1', 'suspect', 'bot-1')] })
    expect(move(s)).toEqual(say('bot-1', 'defend', 'h1'))
    // Trois paroles déjà : plus rien (plafond moteur), un autre bot prend la suite.
    const full = table({
      seats,
      clues: SOLO_CLUES,
      speech: [sp('bot-1', 'intent', 'bot-2'), sp('bot-1', 'doubt', 'bot-2'), sp('bot-1', 'ask', 'h1'), sp('h1', 'suspect', 'bot-1')],
    })
    const m = move(full, always(0.99))
    expect(m?.type === 'SPEAK' && m.playerId).not.toBe('bot-1')
  })

  it('second bot : le suiveur abonde (son soupçon, accusation humaine ×2, est positif) ; le farceur qui n’ose pas laisse la place', () => {
    const after = reduceImposteur(accused('bot-2'), say('bot-2', 'defend', 'h1'))
    // Gépéto (plus rapide) n'ose pas (0,9 ≥ 0,8) : Suzette abonde contre Raoul (« … » +3, accusation +4).
    expect(move(after, always(0.9))).toEqual(say('bot-3', 'rally', 'bot-2'))
    // Gépéto ose : il abonde lui aussi (son soupçon de Raoul est positif).
    expect(move(after, always(0.1))).toEqual(say('bot-4', 'rally', 'bot-2'))
  })

  it('second bot : le prudent doute quand les indices de l’accusé ne l’inquiètent pas, se tait sinon', () => {
    // Seul Barnabé peut suivre (les autres ont déjà tout dit) ; l'accusé, Suzette, a répondu.
    const busy = (id: string) => [sp(id, 'intent', 'h1'), sp(id, 'doubt', 'h1'), sp(id, 'ask', 'h1')]
    const base = [...busy('bot-2'), ...busy('bot-4')]
    const calm = table({
      clues: SOLO_CLUES,
      speech: [...base, sp('h1', 'suspect', 'bot-3'), sp('bot-3', 'defend', 'h1')],
    })
    expect(move(calm)).toEqual(say('bot-1', 'doubt', 'bot-3'))
    // Raoul a dit « … » : seul Barnabé peut le suivre, et il se tait — ni doute, ni appui ;
    // le tick passe aux annonces de vote (Raoul, le plus rapide, n'a pas encore annoncé).
    const loud = table({
      clues: SOLO_CLUES,
      speech: [...busy('bot-3'), ...busy('bot-4'), sp('h1', 'suspect', 'bot-2'), sp('bot-2', 'defend', 'h1')],
    })
    expect(move(loud)).toEqual(expect.objectContaining({ playerId: 'bot-2', kind: 'intent' }))
  })

  it('budget : deux réponses de bots par accusation humaine, quels que soient les ticks', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const s0 = table({
        clues: SOLO_CLUES,
        // Tous les bots ont déjà annoncé leur vote : il ne reste que la réaction.
        speech: [...['bot-1', 'bot-2', 'bot-3', 'bot-4'].map((id) => sp(id, 'intent', 'h1')), sp('h1', 'suspect', 'bot-2')],
        votes: { h1: 'bot-2' },
      })
      const states = runTicks(s0, createRng(`budget-${seed}`).next)
      const last = states.at(-1)!
      const answers = (last.speech ?? []).slice(5).filter((x) => x.kind !== 'intent')
      expect(answers.length).toBeLessThanOrEqual(2)
      expect(answers.length).toBeGreaterThanOrEqual(1)
      expectOneMovePerTick(states)
    }
  })

  it('une défense humaine ne fait réagir personne', () => {
    const s = table({
      clues: SOLO_CLUES,
      speech: [...['bot-1', 'bot-2', 'bot-3', 'bot-4'].map((id) => sp(id, 'intent', 'h1')), sp('bot-2', 'suspect', 'h1'), sp('h1', 'defend', 'bot-2')],
      votes: { h1: 'bot-2' },
    })
    expect(move(s)).toBeNull()
  })
})

describe('(c) remarques d’ouverture sur l’éliminé de la manche d’avant', () => {
  const reveal = (eliminatedId: string, team: 'civil' | 'imposteur'): ImposteurReveal => ({
    round: 1,
    tally: { [eliminatedId]: 4 },
    eliminatedId,
    tie: false,
    word: team === 'imposteur' ? 'piscine' : 'plage',
    team,
    sips: 0,
  })

  it('« je l’avais dit » pour qui avait accusé ou annoncé voter l’imposteur sorti, dans l’ordre de table, au plus deux', () => {
    let s = table({
      phase: 'clue',
      round: 2,
      eliminated: ['bot-4'],
      clueOrder: ['h1', 'bot-1', 'bot-2', 'bot-3'],
      speech: [sp('bot-2', 'suspect', 'bot-4'), sp('bot-3', 'intent', 'bot-4'), sp('bot-1', 'intent', 'bot-4')],
      previousReveal: reveal('bot-4', 'imposteur'),
    })
    const said: ImposteurAction[] = []
    for (let m = move(s); m; m = move(s)) {
      said.push(m)
      s = reduceImposteur(s, m)
    }
    // Barnabé (bavardage 2) garde sa parole : il n'en a qu'une après la remarque… il en a encore une ; mais deux max.
    expect(said).toHaveLength(2)
    expect(said).toEqual([say('bot-1', 'toldYou', 'bot-4'), say('bot-2', 'toldYou', 'bot-4')])
  })

  it('« je me suis planté » quand l’éliminé était un civil ; rien pour qui ne l’avait pas visé', () => {
    const s = table({
      phase: 'clue',
      round: 2,
      eliminated: ['bot-1'],
      clueOrder: ['h1', 'bot-2', 'bot-3', 'bot-4'],
      speech: [sp('bot-3', 'rally', 'bot-1'), sp('bot-2', 'suspect', 'h1')],
      previousReveal: reveal('bot-1', 'civil'),
    })
    expect(move(s)).toEqual(say('bot-3', 'wrong', 'bot-1'))
  })

  it('un taiseux (bavardage 1) garde sa seule parole : pas de remarque', () => {
    const seats: Seat[] = SOLO.map((seat) => (seat[0] === 'bot-2' ? ['bot-2', 'Gaston', true, 'plage'] : seat))
    const s = table({
      seats,
      phase: 'clue',
      round: 2,
      eliminated: ['bot-4'],
      clueOrder: ['h1', 'bot-1', 'bot-2', 'bot-3'],
      speech: [sp('bot-2', 'suspect', 'bot-4')],
      previousReveal: reveal('bot-4', 'imposteur'),
    })
    expect(move(s)).toBeNull()
  })
})

describe('(d) annonces de vote, (e) interpellations, (f) rien', () => {
  it('un intent par bot, par tempo, vers ce qu’il voterait à l’instant', () => {
    const s = table({ clues: SOLO_CLUES })
    const m = move(s, createRng('intent').next)
    const raoul = imposteurBotVote(toImposteurClientView(s, 'bot-2'), 'bot-2', LISTS.plage, botTraitsFor('Raoul'), createRng('intent').next)
    expect(m).toEqual(say('bot-2', 'intent', raoul!))
    const order: string[] = []
    let cur = s
    for (let i = 0; i < 4; i += 1) {
      const next = move(cur, createRng(`i-${i}`).next)!
      expect(next.type === 'SPEAK' && next.kind).toBe('intent')
      if (next.type === 'SPEAK') order.push(next.playerId)
      cur = reduceImposteur(cur, next)
    }
    expect(order).toEqual(['bot-2', 'bot-4', 'bot-3', 'bot-1'])
  })

  it(`au plus ${IMPOSTEUR_INTENTS_MAX} annonces par manche ; un taiseux (bavardage 1) annonce quand même`, () => {
    const seats: Seat[] = [
      ['h1', 'Léa', false, 'plage'],
      ['bot-1', 'Gaston', true, 'plage'], // bavardage 1, tempo 3000
      ['bot-2', 'Raoul', true, 'plage'],
      ['bot-3', 'Suzette', true, 'plage'],
      ['bot-4', 'Gépéto', true, 'piscine'],
      ['bot-5', 'Dédé', true, 'plage'], // tempo 800
    ]
    let s = table({
      seats,
      clues: [...SOLO_CLUES, ['bot-5', 'crabe']],
      // Gaston a déjà dit sa parole de la manche.
      speech: [sp('bot-1', 'doubt', 'bot-4')],
    })
    const intents: string[] = []
    for (let m = move(s); m && m.type === 'SPEAK' && m.kind === 'intent'; m = move(s)) {
      intents.push(m.playerId)
      s = reduceImposteur(s, m)
    }
    expect(intents).toEqual(['bot-5', 'bot-2', 'bot-4', 'bot-3'])
    const gastonFirst = table({ seats: seats.slice(0, 2).concat(seats.slice(3, 4)), clues: SOLO_CLUES.slice(0, 2), speech: [sp('bot-1', 'doubt', 'h1')] })
    const m = move(gastonFirst)
    expect(m?.type === 'SPEAK' && m.kind).toBe('intent')
  })

  it(`interpellation : l’humain qui n’a pas voté, par le plus audacieux, plus de ${ASK_MIN_REMAINING_MS / 1000} s avant l’échéance, jamais deux fois`, () => {
    const announced = [...['bot-1', 'bot-2', 'bot-3', 'bot-4'].map((id) => sp(id, 'intent', 'h1'))]
    const s = table({ clues: SOLO_CLUES, speech: announced })
    // Raoul (0,85) est le plus audacieux.
    expect(move(s)).toEqual(say('bot-2', 'ask', 'h1'))
    expect(move(s, always(0.5), T0 + 60_000 - ASK_MIN_REMAINING_MS)).toBeNull()
    const asked = reduceImposteur(s, say('bot-2', 'ask', 'h1'))
    expect(move(asked)).toBeNull()
    // L'humain a voté : plus d'interpellation… ni d'annonce (plus personne à éclairer).
    expect(move(table({ clues: SOLO_CLUES, speech: announced, votes: { h1: 'bot-2' } }))).toBeNull()
    expect(move(table({ clues: SOLO_CLUES, votes: { h1: 'bot-2' } }))).toBeNull()
  })

  it('(f) tout est dit : null, et le tick fait voter les bots', () => {
    const s = table({
      clues: SOLO_CLUES,
      speech: [...['bot-1', 'bot-2', 'bot-3', 'bot-4'].map((id) => sp(id, 'intent', 'h1')), sp('bot-2', 'ask', 'h1')],
    })
    expect(move(s)).toBeNull()
    const r = tick(s, createRng('f').next)
    expect(r.ok).toBe(true)
    if (r.ok) expect(['bot-1', 'bot-2', 'bot-3', 'bot-4'].every((id) => r.state.pendingVotes[id])).toBe(true)
  })
})

describe('anti-triche : la parole ne lit ni les camps ni le mot des autres', () => {
  it('INVARIANCE PAR BROUILLAGE : camps des vivants et mots des humains permutés → même parole', () => {
    let checks = 0
    for (let seed = 0; seed < 60; seed += 1) {
      const shaker = createRng(`shake-${seed}`)
      const humanClue = ['…', 'zorglub', 'sable', 'chlore', 'piscines'][seed % 5]
      const variants: ImposteurState[] = [
        table({ phase: 'clue', clueOrder: ['bot-1', 'h1', 'bot-2', 'bot-3', 'bot-4'], clueTurnIdx: 2, clues: [['bot-1', 'été'], ['h1', humanClue]] }),
        table({ clues: SOLO_CLUES, speech: seed % 2 ? [sp('h1', 'suspect', `bot-${1 + (seed % 4)}`)] : [] }),
        table({
          clues: SOLO_CLUES,
          speech: [sp('bot-2', 'intent', 'bot-4'), sp('h1', 'suspect', 'bot-3'), sp('bot-3', 'defend', 'h1')],
        }),
      ]
      for (const s of variants) {
        const scrambled: ImposteurState = {
          ...s,
          players: s.players.map((p) => {
            if (p.eliminated) return p
            const team = shaker.chance(0.5) ? ('civil' as const) : ('imposteur' as const)
            return p.isBot ? { ...p, team } : { ...p, team, word: p.word === 'plage' ? 'piscine' : 'plage' }
          }),
        }
        const a = imposteurBotSpeechMove(s, T0, createRng(`r-${seed}`).next, speechDeps(s))
        const b = imposteurBotSpeechMove(scrambled, T0, createRng(`r-${seed}`).next, speechDeps(s))
        expect(b).toEqual(a)
        checks += a ? 1 : 0
      }
    }
    expect(checks).toBeGreaterThan(60)
  })
})

describe('scénarios de table', () => {
  it('solo (1 humain + 4 bots) : annonces puis interpellation AVANT le vote groupé, un coup par tick', () => {
    const s0 = table({ clues: SOLO_CLUES })
    const states = runTicks(s0, createRng('solo').next)
    expectOneMovePerTick(states)
    const last = states.at(-1)!
    expect((last.speech ?? []).map((x) => x.kind)).toEqual(['intent', 'intent', 'intent', 'intent', 'ask'])
    expect(['bot-1', 'bot-2', 'bot-3', 'bot-4'].every((id) => last.pendingVotes[id])).toBe(true)
    expect(last.pendingVotes.h1).toBeUndefined()
    expect(last.phase).toBe('vote')
  })

  it('parole tenue : sans rien de neuf, chaque bot vote ce qu’il a annoncé (le farceur peut monter d’un cran)', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const seats: Seat[] = SOLO.map(([id, , isBot, word], i) =>
        isBot ? [id, BOT_PERSONAS[(seed + i) % BOT_PERSONAS.length].name, true, word] : SOLO[i]
      )
      const last = runTicks(table({ seats, clues: SOLO_CLUES }), createRng(`keep-${seed}`).next).at(-1)!
      for (const intent of (last.speech ?? []).filter((x) => x.kind === 'intent')) {
        const name = last.players.find((p) => p.id === intent.playerId)!.name
        const vote = last.pendingVotes[intent.playerId]
        if (botTraitsFor(name).trait !== 'farceur') expect(vote, `${seed} ${name}`).toBe(intent.targetId)
        else expect(vote).toBeDefined()
      }
    }
  })

  it('solo : une accusation humaine APRÈS l’annonce retourne le vote du suiveur', () => {
    // Suzette (suiveuse) : Raoul « … » +3 en tête, Gépéto « chlore » +1.
    let s = table({ clues: SOLO_CLUES })
    const rand = createRng('flip').next
    while (!(s.speech ?? []).some((x) => x.playerId === 'bot-3' && x.kind === 'intent')) {
      const r = tick(s, rand)
      if (!r.ok) throw new Error(r.error)
      s = r.state
    }
    expect((s.speech ?? []).find((x) => x.playerId === 'bot-3' && x.kind === 'intent')?.targetId).toBe('bot-2')
    const accused = applyImposteurRoomAction(s, 'h1', { type: 'speak', kind: 'suspect', targetId: 'bot-4' })
    if (!accused.ok) throw new Error(accused.error)
    const states = runTicks(accused.state, rand)
    expectOneMovePerTick(states)
    const last = states.at(-1)!
    expect(last.pendingVotes['bot-3']).toBe('bot-4')
    // L'accusé a répondu, un second bot a suivi.
    const after = (last.speech ?? []).slice((s.speech ?? []).length + 1)
    expect(after[0].playerId).toBe('bot-4')
    expect(['defend', 'suspect']).toContain(after[0].kind)
  })

  it('tablée (4 humains + 2 bots) : au plus 8 bulles de bots par manche, au plus 2 humains interpellés', () => {
    const seats: Seat[] = [
      ['h1', 'Léa', false, 'plage'],
      ['h2', 'Tom', false, 'plage'],
      ['h3', 'Inès', false, 'piscine'],
      ['h4', 'Max', false, 'plage'],
      ['bot-1', BOT_PERSONAS[2].name, true, 'plage'],
      ['bot-2', BOT_PERSONAS[8].name, true, 'plage'],
    ]
    for (let seed = 0; seed < 20; seed += 1) {
      const rand = createRng(`table-${seed}`).next
      let s = table({ seats, phase: 'clue', clueTurnIdx: 0 })
      const humanClues: Record<string, string> = { h1: 'sable', h2: '…', h3: 'chlore', h4: seed % 2 ? 'été' : 'zorglub' }
      // Indices : les humains disent le leur, les bots jouent par tick.
      for (let guard = 0; s.phase === 'clue' && guard < 50; guard += 1) {
        const actor = s.clueOrder[s.clueTurnIdx]
        if (!actor.startsWith('bot-')) {
          const r = tick(s, rand)
          if (r.ok) s = r.state
          else s = reduceImposteur(s, { type: 'CLUE', playerId: actor, text: humanClues[actor], now: T0 })
          continue
        }
        const r = tick(s, rand)
        if (!r.ok) throw new Error(r.error)
        s = r.state
      }
      expect(s.phase).toBe('vote')
      // Deux humains accusent les bots, puis on laisse filer.
      for (const [author, target] of [['h1', 'bot-1'], ['h3', 'bot-2']] as const) {
        const r = applyImposteurRoomAction(s, author, { type: 'speak', kind: 'suspect', targetId: target })
        if (r.ok) s = r.state
        s = runTicks(s, rand).at(-1)!
      }
      const botSpeech = (s.speech ?? []).filter((x) => x.round === 1 && x.playerId.startsWith('bot-'))
      expect(botSpeech.length).toBeLessThanOrEqual(8)
      expect(botSpeech.length).toBeLessThanOrEqual(2 * IMPOSTEUR_SPEECH_CAP)
      const asked = new Set(botSpeech.filter((x) => x.kind === 'ask').map((x) => x.targetId))
      expect(asked.size).toBeLessThanOrEqual(ASK_MAX_PER_ROUND)
      expect(['bot-1', 'bot-2'].every((id) => s.pendingVotes[id])).toBe(true)
    }
  })
})
