import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { phaseKey } from '@/lib/online/phase-clock'
import { DEFAULT_BOT_TRAITS, type BotTrait, type BotTraits } from '@/lib/online/bot-personas'
import { createEspionState, reduceEspion, toEspionClientView, type EspionSpeech, type EspionState } from './engine'
import { ESPION_BOT_DEPS } from './server-adapter'
import { ESPION_LOCATION_IDS, espionLocationName, getEspionLocations, type EspionLocationId } from './data'
import { espionAttrsOf } from './data/attributes'
import {
  ESPION_ANY,
  ESPION_QUESTION_IDS,
  espionQuestionValues,
  type EspionAnswer,
  type EspionAttributes,
  type EspionQuestionId,
} from './data/questions'
import {
  espionAccuseThreshold,
  espionAllyShare,
  espionAnswerVerdict,
  espionBotAccusation,
  espionCrewAnswer,
  espionDesperateGuess,
  espionEvidence,
  espionFirstSuspect,
  espionFollowUp,
  espionLocationScores,
  espionPickQuestion,
  espionPickTarget,
  espionSpeechSuspicion,
  espionSpyAnswer,
  espionSupports,
  espionSuspicion,
  espionTopSuspects,
  espionVoluntaryGuess,
  espionWouldGiveAway,
  ESPION_CREW_ANY,
  ESPION_LAST_CALL_SUPPORT,
  ESPION_SPEECH_WEIGHT,
  ESPION_SPY_FIRST_ANY,
  ESPION_SUPPORT_THRESHOLD,
  ESPION_SUSPICION_CLASH,
  ESPION_SUSPICION_COPY,
  ESPION_SUSPICION_FALSE_ACCUSER,
  ESPION_SUSPICION_MATCH,
  ESPION_SUSPICION_VAGUE,
  type EspionBotDeps,
  type EspionMind,
} from './bot-brain'

/**
 * Cerveau des bots de l'Espion : chaque décision sur la VUE CLIENT d'un bot,
 * ses traits et le carnet prêté, rien d'autre.
 */

const MIN = 60_000
const DISCUSSION_MS = 3 * MIN
const TRAITS: BotTrait[] = ['prudent', 'farceur', 'suiveur', 'agressif']
const traitsOf = (trait: BotTrait, audace = 0.5): BotTraits => ({ ...DEFAULT_BOT_TRAITS, trait, audace })
const zero = () => 0
const almostOne = () => 0.999

type Entry = Omit<EspionSpeech, 'round'>

type TableSpec = {
  ids?: string[]
  /** Les humains de la table (les autres sont des bots). */
  humans?: string[]
  location: EspionLocationId
  spy: string
  speech?: Entry[]
}

/** Table en discussion fabriquée à la main : lieu et espion choisis, fil donné. */
function table({ ids = ['me', 'b', 'c', 'd', 'e'], humans = [], location, spy, speech = [] }: TableSpec) {
  let s = createEspionState(
    ids.map((id) => ({ id, name: id, isBot: !humans.includes(id) })),
    getEspionLocations('fr'),
    'fixture',
    0,
    DISCUSSION_MS
  )
  s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
  const start = s.phaseEndsAt! - DISCUSSION_MS
  const state: EspionState = {
    ...s,
    location: espionLocationName(location, 'fr'),
    players: s.players.map((p) => ({ ...p, role: p.id === spy ? 'spy' : 'crew' })),
    speech: speech.map((sp) => ({ ...sp, round: s.round })),
  }
  return { state, start }
}

function mind(state: EspionState, botId: string, traits: BotTraits, now: number): EspionMind {
  return { view: toEspionClientView(state, botId), botId, traits, now }
}

let clock = 0
const q = (asker: string, target: string, questionId: EspionQuestionId): Entry => ({
  playerId: asker,
  kind: 'question',
  targetId: target,
  questionId,
  at: (clock += 1_000),
})
const a = (player: string, asker: string, questionId: EspionQuestionId, value: string): Entry => ({
  playerId: player,
  kind: 'answer',
  targetId: asker,
  questionId,
  value: value as EspionSpeech['value'],
  at: (clock += 1_000),
})
/** Une question et sa réponse. */
const qa = (asker: string, target: string, questionId: EspionQuestionId, value: string): Entry[] => [
  q(asker, target, questionId),
  a(target, asker, questionId, value),
]

const attrs = (id: EspionLocationId) => espionAttrsOf(id)!
const PRECISE = (id: EspionLocationId) => ESPION_QUESTION_IDS.filter((qid) => attrs(id)[qid] !== ESPION_ANY)
/** Une valeur que le lieu n'admet pas à cette question. */
const wrongFor = (id: EspionLocationId, qid: EspionQuestionId): string =>
  espionQuestionValues(qid).find((v) => v !== attrs(id)[qid])!

const deps = ESPION_BOT_DEPS
const L: EspionLocationId = 'plage'

describe('réponse d’un équipier', () => {
  it('jamais une valeur incompatible : 75 lieux × 12 questions × 4 traits × t ∈ {0 ; 0,2 ; 0,5 ; 0,9}, fil vide ou déjà nourri', () => {
    let checked = 0
    for (const location of ESPION_LOCATION_IDS) {
      const precise = PRECISE(location)
      const fed = [...qa('b', 'c', precise[0], attrs(location)[precise[0]]), ...qa('c', 'd', precise[1], attrs(location)[precise[1]])]
      for (const speech of [[], fed]) {
        const { state, start } = table({ location, spy: 'e', speech })
        for (const t of [0, 0.2, 0.5, 0.9]) {
          for (const trait of TRAITS) {
            const m = mind(state, 'me', traitsOf(trait), start + t * DISCUSSION_MS)
            for (const qid of ESPION_QUESTION_IDS) {
              for (const rand of [zero, almostOne]) {
                const answer = espionCrewAnswer(m, qid, rand, deps)
                expect([attrs(location)[qid], ESPION_ANY], `${location}.${qid} ${trait} t=${t}`).toContain(answer)
                checked += 1
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(75 * 12 * 4 * 4 * 2 * 2)
  }, 60_000)

  it('« ça dépend » par tempérament : prudent 25 %, farceur 15 %, suiveur et agressif jamais', () => {
    const { state, start } = table({ location: L, spy: 'e' })
    const precise = PRECISE(L)
    for (const trait of TRAITS) {
      const rng = createRng(`any-${trait}`)
      let any = 0
      const n = 4_000
      for (let i = 0; i < n; i += 1) {
        const qid = precise[i % precise.length]
        if (espionCrewAnswer(mind(state, 'me', traitsOf(trait), start), qid, rng.next, deps) === ESPION_ANY) any += 1
      }
      expect(any / n, trait).toBeCloseTo(ESPION_CREW_ANY[trait], 1)
    }
    expect(ESPION_CREW_ANY).toEqual({ prudent: 0.25, farceur: 0.15, suiveur: 0, agressif: 0 })
  })

  it('protection du lieu : la réponse qui le vendrait est tue (sauf par l’agressif), et ses coéquipiers l’excusent', () => {
    // On nourrit le fil de réponses justes jusqu'à ce qu'une seule de plus vende le lieu.
    const precise = PRECISE(L)
    const fil: Entry[] = []
    let revealing: EspionQuestionId | null = null
    for (;;) {
      const rest = precise.filter((x) => !fil.some((e) => e.questionId === x))
      revealing = rest.find((x) => espionWouldGiveAway(fil as EspionSpeech[], x, attrs(L)[x], deps)) ?? null
      if (revealing || rest.length === 0) break
      fil.push(...qa('c', 'd', rest[0], attrs(L)[rest[0]]))
    }
    expect(revealing).not.toBeNull()
    const { state, start } = table({ location: L, spy: 'e', speech: fil })
    for (const trait of TRAITS) {
      const answer = espionCrewAnswer(mind(state, 'me', traitsOf(trait), start), revealing!, almostOne, deps)
      expect(answer, trait).toBe(trait === 'agressif' ? attrs(L)[revealing!] : ESPION_ANY)
    }
    // Le « ça dépend » protecteur de b ne lui coûte rien ; le même sur une réponse anodine, si.
    const excused = table({ location: L, spy: 'e', speech: [...fil, ...qa('me', 'b', revealing!, ESPION_ANY)] })
    expect(espionSuspicion(mind(excused.state, 'c', traitsOf('suiveur'), excused.start), deps).get('b')).toBe(0)
    const vague = table({ location: L, spy: 'e', speech: qa('me', 'b', precise[0], ESPION_ANY) })
    expect(espionSuspicion(mind(vague.state, 'c', traitsOf('suiveur'), vague.start), deps).get('b')).toBe(ESPION_SUSPICION_VAGUE)
  })
})

/** Carnet factice de 3 lieux sur des ids réels : les scores se lisent à la main. */
const FAKE: Partial<Record<EspionLocationId, EspionAttributes>> = {
  plage: { ...attrs('plage'), where: 'outside', when: 'day', price: 'free', noise: 'loud' },
  hopital: { ...attrs('plage'), where: 'inside', when: 'any', price: 'free', noise: 'quiet' },
  ecole: { ...attrs('plage'), where: 'inside', when: 'day', price: 'cheap', noise: 'loud' },
}
const fakeDeps: EspionBotDeps = { attrsOf: (id) => FAKE[id] ?? null }

describe('le carnet vu par l’espion', () => {
  it('scores : compatible +1, incompatible −2, « ça dépend » (réponse ou case) 0 ; ses propres réponses ne comptent pas', () => {
    const speech = [
      ...qa('b', 'c', 'where', 'inside'),
      ...qa('c', 'd', 'when', 'day'),
      ...qa('d', 'b', 'price', ESPION_ANY),
      ...qa('b', 'me', 'noise', 'quiet'),
    ]
    const { state, start } = table({ location: 'hopital', spy: 'me', speech })
    const scores = espionLocationScores(mind(state, 'me', traitsOf('suiveur'), start), fakeDeps)
    expect(Object.fromEntries(scores)).toEqual({ plage: -2 + 1, hopital: 1 + 0, ecole: 1 + 1 })
  })

  it('1re réponse : « ça dépend » avec une chance de 0,5 × (1 − audace), jamais ensuite', () => {
    const { state, start } = table({ location: 'hopital', spy: 'me', speech: qa('b', 'c', 'where', 'inside') })
    const shy = traitsOf('prudent', 0.2)
    expect(espionSpyAnswer(mind(state, 'me', shy, start), 'noise', zero, fakeDeps)).toBe(ESPION_ANY)
    const edge = ESPION_SPY_FIRST_ANY * (1 - 0.2)
    expect(espionSpyAnswer(mind(state, 'me', shy, start), 'noise', () => edge + 0.01, fakeDeps)).not.toBe(ESPION_ANY)
    const after = table({ location: 'hopital', spy: 'me', speech: [...qa('b', 'me', 'when', 'day'), ...qa('c', 'd', 'where', 'inside')] })
    expect(espionSpyAnswer(mind(after.state, 'me', shy, after.start), 'noise', zero, fakeDeps)).not.toBe(ESPION_ANY)
  })

  it('perroquet : il répète la valeur majoritaire entendue à la question, avec une chance de 0,6 + 0,3 × (1 − audace)', () => {
    // « Calme » entendu une fois, mais le reste du fil ne laisse qu'ecole (bruyant) en tête :
    // le perroquet et le choix par candidats divergent, le seuil se lit donc à la réponse.
    const speech = [
      ...qa('b', 'c', 'noise', 'quiet'),
      ...qa('c', 'd', 'where', 'inside'),
      ...qa('d', 'b', 'when', 'day'),
      ...qa('b', 'c', 'price', 'cheap'),
      ...qa('c', 'e', 'when', 'day'),
    ]
    const { state, start } = table({ location: 'hopital', spy: 'me', speech })
    const m = (audace: number) => mind(state, 'me', traitsOf('agressif', audace), start)
    expect(espionSpyAnswer(m(1), 'noise', () => 0.59, fakeDeps)).toBe('quiet')
    expect(espionSpyAnswer(m(1), 'noise', () => 0.61, fakeDeps)).toBe('loud')
    expect(espionSpyAnswer(m(0), 'noise', () => 0.89, fakeDeps)).toBe('quiet')
    expect(espionSpyAnswer(m(0), 'noise', () => 0.91, fakeDeps)).toBe('loud')
  })

  it('par candidats : la valeur la plus plausible pour les lieux à 1 point du meilleur', () => {
    // where = inside : hopital et ecole en tête, plage décroche.
    const speech = [...qa('b', 'me', 'when', 'day'), ...qa('c', 'd', 'where', 'inside')]
    const { state, start } = table({ location: 'hopital', spy: 'me', speech })
    const bold = traitsOf('agressif', 1)
    expect(espionSpyAnswer(mind(state, 'me', bold, start), 'where', almostOne, fakeDeps)).toBe('inside')
    // hopital (quiet) contre ecole (loud) : à égalité, la première valeur.
    expect(espionSpyAnswer(mind(state, 'me', bold, start), 'noise', almostOne, fakeDeps)).toBe('quiet')
  })
})

describe('devinettes de l’espion', () => {
  /** Assez de réponses justes au vrai carnet pour que plage soit seule en tête, de loin. */
  const certain = () => {
    const precise = PRECISE(L)
    const others = ['b', 'c', 'd', 'e']
    return precise.flatMap((qid, i) => qa(others[i % 4], others[(i + 1) % 4], qid, attrs(L)[qid]))
  }

  it('volontaire : seulement sûr de lui, jamais dans les 20 dernières secondes, jamais pour un équipier', () => {
    const { state, start } = table({ location: L, spy: 'me', speech: certain() })
    const m = (now: number, id = 'me') => mind(state, id, traitsOf('suiveur'), now)
    expect(espionVoluntaryGuess(m(start + MIN), deps)).toBe(L)
    expect(espionVoluntaryGuess(m(start + DISCUSSION_MS - 19_000), deps)).toBeNull()
    const crew = table({ location: L, spy: 'b', speech: certain() })
    expect(espionVoluntaryGuess(mind(crew.state, 'me', traitsOf('suiveur'), crew.start + MIN), deps)).toBeNull()
    // Deux réponses entendues ne suffisent pas.
    const thin = table({ location: L, spy: 'me', speech: certain().slice(0, 4) })
    expect(espionVoluntaryGuess(mind(thin.state, 'me', traitsOf('agressif', 1), thin.start + MIN), deps)).toBeNull()
  })

  it('désespérée : accusé et à une voix de tomber (soutiens ≥ majorité − 1), il tente son meilleur candidat', () => {
    const { state, start } = table({ location: L, spy: 'me', speech: certain() })
    const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'b', targetId: 'me', now: start + MIN })
    // 5 joueurs : majorité 3 ; l'accusateur seul ne suffit pas.
    expect(espionDesperateGuess(mind(accused, 'me', traitsOf('suiveur'), start + MIN), deps, zero)).toBeNull()
    const brink = reduceEspion(accused, { type: 'SUPPORT', playerId: 'c', now: start + MIN + 1 })
    expect(espionDesperateGuess(mind(brink, 'me', traitsOf('suiveur'), start + MIN), deps, zero)).toBe(L)
    // Un équipier accusé ne devine pas, et l'espion qui n'est pas visé non plus.
    const other = reduceEspion(reduceEspion(state, { type: 'ACCUSE', playerId: 'b', targetId: 'c', now: start + MIN }), {
      type: 'SUPPORT',
      playerId: 'd',
      now: start + MIN + 1,
    })
    expect(espionDesperateGuess(mind(other, 'me', traitsOf('suiveur'), start + MIN), deps, zero)).toBeNull()
  })
})

describe('soupçon d’un équipier', () => {
  const precise = PRECISE(L)
  const [q1, q2] = precise

  it('barème : incompatible selon le trait, « ça dépend » +0,5, copie +0,5, juste −1, silence 0', () => {
    const speech = [
      ...qa('me', 'b', q1, wrongFor(L, q1)),
      ...qa('b', 'c', q1, attrs(L)[q1]),
      ...qa('c', 'd', q1, attrs(L)[q1]),
      ...qa('d', 'e', q2, ESPION_ANY),
    ]
    const { state, start } = table({ ids: ['me', 'b', 'c', 'd', 'e', 'f'], location: L, spy: 'f', speech })
    for (const trait of TRAITS) {
      const score = espionSuspicion(mind(state, 'me', traitsOf(trait), start), deps)
      expect(score.get('b'), trait).toBe(ESPION_SUSPICION_CLASH[trait])
      expect(score.get('c'), trait).toBe(ESPION_SUSPICION_MATCH)
      expect(score.get('d'), trait).toBe(ESPION_SUSPICION_MATCH + ESPION_SUSPICION_COPY)
      expect(score.get('e'), trait).toBe(ESPION_SUSPICION_VAGUE)
      expect(score.get('f'), trait).toBe(0)
    }
    expect(ESPION_SUSPICION_CLASH).toEqual({ prudent: 2, farceur: 3, suiveur: 3, agressif: 4 })
  })

  it('une accusation close sans verdict contre un joueur blanchi charge son auteur et ses soutiens ; refusée, son auteur', () => {
    const base = [...qa('me', 'b', q1, attrs(L)[q1])]
    const { state, start } = table({ location: L, spy: 'e', speech: base })
    let s = reduceEspion(state, { type: 'ACCUSE', playerId: 'c', targetId: 'b', now: start + 10_000 })
    s = reduceEspion(s, { type: 'SUPPORT', playerId: 'd', now: start + 11_000 })
    s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.activeAccusation!.endsAt })
    const score = espionSuspicion(mind(s, 'me', traitsOf('suiveur'), start + 30_000), deps)
    expect(score.get('c')).toBe(ESPION_SUSPICION_FALSE_ACCUSER)
    expect(score.get('d')).toBe(ESPION_SUSPICION_FALSE_ACCUSER)
    // Contre un joueur pas encore blanchi, seule ma voix contre compte, et seulement contre l'accusateur.
    let t = reduceEspion(state, { type: 'ACCUSE', playerId: 'c', targetId: 'e', now: start + 10_000 })
    t = reduceEspion(t, { type: 'DECLINE', playerId: 'me', now: start + 11_000 })
    t = reduceEspion(t, { type: 'ADVANCE', claimedKey: phaseKey(t), now: t.activeAccusation!.endsAt })
    const after = espionSuspicion(mind(t, 'me', traitsOf('suiveur'), start + 30_000), deps)
    expect(after.get('c')).toBe(ESPION_SUSPICION_FALSE_ACCUSER)
    // e n'a rien prouvé ; seule la parole publique pèse : l'accusation (+2) et mon refus (−1), à mi-poids.
    expect(espionEvidence(mind(t, 'me', traitsOf('suiveur'), start + 30_000), deps).get('e')).toBe(0)
    expect(after.get('e')).toBe(ESPION_SPEECH_WEIGHT * (2 - 1))
  })

  it('seuls les joueurs jugés (interrogés, ou chargés) sont accusés ou soutenus contre ; tous peuvent être sondés', () => {
    const speech = qa('me', 'b', q1, attrs(L)[q1])
    const { state, start } = table({ location: L, spy: 'e', speech })
    const m = mind(state, 'me', traitsOf('suiveur'), start)
    // b a répondu juste (−1), c, d et e n'ont rien dit (0) : aucun d'eux n'est encore jugé.
    expect(espionTopSuspects(m, deps)).toEqual(['b'])
    expect(espionTopSuspects(m, deps, { judgedOnly: false })).toEqual(['c', 'd', 'e'])
    expect(espionFirstSuspect(m, deps)).toBe('b')
  })
})

describe('accusations et soutiens', () => {
  const precise = PRECISE(L)
  const [q1, q2] = precise

  it('seuil d’accusation : 3 − t, jamais sous 2, prudent +1, agressif −1', () => {
    expect(espionAccuseThreshold('suiveur', 0)).toBe(3)
    expect(espionAccuseThreshold('suiveur', 0.5)).toBe(2.5)
    expect(espionAccuseThreshold('suiveur', 1)).toBe(2)
    expect(espionAccuseThreshold('prudent', 0)).toBe(4)
    expect(espionAccuseThreshold('agressif', 1)).toBe(1)
  })

  it('un équipier accuse sur preuve : la réponse incompatible, unique et en tête ; pas sur un simple « ça dépend »', () => {
    const clash = table({ location: L, spy: 'e', speech: qa('b', 'e', q1, wrongFor(L, q1)) })
    expect(espionBotAccusation(mind(clash.state, 'me', traitsOf('suiveur'), clash.start), deps)).toBe('e')
    const vague = table({ location: L, spy: 'e', speech: qa('b', 'e', q1, ESPION_ANY) })
    expect(espionBotAccusation(mind(vague.state, 'me', traitsOf('agressif'), vague.start), deps)).toBeNull()
    // Deux incompatibles à égalité : pas de premier suspect unique, pas d'accusation.
    const tie = table({ location: L, spy: 'e', speech: [...qa('b', 'e', q1, wrongFor(L, q1)), ...qa('e', 'd', q2, wrongFor(L, q2))] })
    expect(espionBotAccusation(mind(tie.state, 'me', traitsOf('suiveur'), tie.start), deps)).toBeNull()
  })

  it('soutien d’un équipier : son premier suspect au-dessus de seuil(trait) × (1 − t), qui baisse avec t', () => {
    // e a dit deux fois « ça dépend » (+1), c a répondu juste (−1) : e est le premier suspect jugé.
    const speech = [...qa('b', 'e', q1, ESPION_ANY), ...qa('e', 'c', q2, attrs(L)[q2]), ...qa('c', 'e', precise[2], ESPION_ANY)]
    const { state, start } = table({ location: L, spy: 'e', speech })
    const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'b', targetId: 'e', now: start + 5_000 })
    const supports = (trait: BotTrait, t: number) =>
      espionSupports(mind(accused, 'me', traitsOf(trait), start + t * DISCUSSION_MS), deps, zero)
    expect(espionSuspicion(mind(accused, 'me', traitsOf('prudent'), start), deps).get('e')).toBe(2 * ESPION_SUSPICION_VAGUE)
    expect(ESPION_SUPPORT_THRESHOLD).toEqual({ prudent: 2, farceur: 1, agressif: 1, suiveur: 1 })
    // Prudent : 2 × (1 − t) ≤ 1 dès t = 0,5.
    expect(supports('prudent', 0.3)).toBe(false)
    expect(supports('prudent', 0.6)).toBe(true)
    for (const trait of ['farceur', 'agressif', 'suiveur'] as const) expect(supports(trait, 0), trait).toBe(true)
    // Contre c, blanchi, personne ne suit.
    const wrong = reduceEspion(state, { type: 'ACCUSE', playerId: 'b', targetId: 'c', now: start + 5_000 })
    for (const trait of TRAITS) expect(espionSupports(mind(wrong, 'me', traitsOf(trait), start + 0.6 * DISCUSSION_MS), deps, zero), trait).toBe(false)
  })

  it('au dernier appel le seuil tombe à −0,5 : soutien d’un « ça dépend », pas d’un joueur qui a répondu juste deux fois', () => {
    const late = (speech: Entry[], target: string) => {
      const { state, start } = table({ location: L, spy: 'e', speech })
      const at = start + DISCUSSION_MS - 35_000
      const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'b', targetId: target, now: at })
      return espionSupports(mind(accused, 'me', traitsOf('prudent'), at), deps, zero)
    }
    expect(ESPION_LAST_CALL_SUPPORT).toBe(-0.5)
    expect(late(qa('b', 'e', q1, ESPION_ANY), 'e')).toBe(true)
    expect(late([...qa('b', 'e', q1, attrs(L)[q1]), ...qa('c', 'e', q2, attrs(L)[q2])], 'e')).toBe(false)
  })

  it('le bot espion soutient avec une chance de 0,5 + 0,5 × audace ; prudent, seulement derrière un autre soutien', () => {
    const { state, start } = table({ location: L, spy: 'me' })
    const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'b', targetId: 'c', now: start + 5_000 })
    const m = (trait: BotTrait, audace: number) => mind(accused, 'me', traitsOf(trait, audace), start + 5_000)
    expect(espionSupports(m('suiveur', 0.2), deps, () => 0.59)).toBe(true)
    expect(espionSupports(m('suiveur', 0.2), deps, () => 0.61)).toBe(false)
    expect(espionSupports(m('prudent', 1), deps, zero)).toBe(false)
    const backed = reduceEspion(accused, { type: 'SUPPORT', playerId: 'd', now: start + 6_000 })
    expect(espionSupports(mind(backed, 'me', traitsOf('prudent', 1), start + 6_000), deps, zero)).toBe(true)
  })
})

describe('questions', () => {
  it('parmi les moins posées ; sonder un suspect, ou l’agressif : la plus discriminante ; le prudent face à un blanchi : la plus large', () => {
    const precise = PRECISE(L)
    const { state, start } = table({ location: L, spy: 'e', speech: qa('b', 'c', precise[0], attrs(L)[precise[0]]) })
    const share = (qid: EspionQuestionId) => {
      const cell = attrs(L)[qid]
      if (cell === ESPION_ANY) return 1
      return ESPION_LOCATION_IDS.filter((id) => attrs(id)[qid] === cell).length / ESPION_LOCATION_IDS.length
    }
    const fresh = ESPION_QUESTION_IDS.filter((qid) => qid !== precise[0])
    const sharpest = fresh.reduce((best, qid) => (share(qid) < share(best) ? qid : best), fresh[0])
    const broadest = fresh.reduce((best, qid) => (share(qid) > share(best) ? qid : best), fresh[0])
    const pickFor = (trait: BotTrait, target: string) =>
      espionPickQuestion(mind(state, 'me', traitsOf(trait), start), deps, zero, target)
    // d n'a rien dit : il fait partie des premiers suspects, on le sonde.
    for (const trait of TRAITS) expect(pickFor(trait, 'd'), trait).toBe(sharpest)
    // c a répondu juste : blanchi, il reçoit la question de son trait.
    expect(pickFor('agressif', 'c')).toBe(sharpest)
    expect(pickFor('prudent', 'c')).toBe(broadest)
    expect(pickFor('suiveur', 'c')).not.toBe(precise[0])
  })

  it('en solo, une question sur deux à l’humain reprend une question déjà répondue', () => {
    const precise = PRECISE(L)
    const { state, start } = table({ location: L, spy: 'e', humans: ['h'], ids: ['me', 'b', 'c', 'h', 'e'], speech: qa('b', 'c', precise[0], attrs(L)[precise[0]]) })
    const m = mind(state, 'me', traitsOf('suiveur'), start)
    expect(espionPickQuestion(m, deps, () => 0.49, 'h')).toBe(precise[0])
    expect(espionPickQuestion(m, deps, () => 0.51, 'h')).not.toBe(precise[0])
    // À plusieurs humains, jamais de reprise.
    const mixed = table({ location: L, spy: 'e', humans: ['h', 'c'], ids: ['me', 'b', 'c', 'h', 'e'], speech: qa('b', 'c', precise[0], attrs(L)[precise[0]]) })
    expect(espionPickQuestion(mind(mixed.state, 'me', traitsOf('suiveur'), mixed.start), deps, zero, 'h')).not.toBe(precise[0])
  })

  it('cible : un équipier sonde son premier suspect avec une chance égale à son audace, sinon le moins interrogé', () => {
    const precise = PRECISE(L)
    const speech = [...qa('b', 'c', precise[0], ESPION_ANY), ...qa('c', 'd', precise[1], attrs(L)[precise[1]])]
    const { state, start } = table({ location: L, spy: 'e', speech })
    const m = mind(state, 'me', traitsOf('suiveur', 0.6), start)
    // c a dit « ça dépend » : premier suspect ; tiré sous l'audace, on le sonde.
    expect(espionPickTarget(m, ['b', 'c', 'd', 'e'], deps, () => 0.5)).toBe('c')
    // Au-dessus : les moins interrogés (b et e, jamais visés).
    expect(['b', 'e']).toContain(espionPickTarget(m, ['b', 'c', 'd', 'e'], deps, () => 0.7))
  })
})

describe('anti-triche : un bot ne lit que ce que sa place lui montre', () => {
  const precise = PRECISE(L)
  const speech = [
    ...qa('b', 'c', precise[0], attrs(L)[precise[0]]),
    ...qa('c', 'me', precise[1], attrs(L)[precise[1]]),
    ...qa('me', 'd', precise[2], ESPION_ANY),
  ]

  /** Toutes les sorties d'un bot, pour une même graine. */
  const outputs = (state: EspionState, botId: string, at: number) => {
    const run = (seed: string) => {
      const rng = createRng(seed)
      const m = mind(state, botId, traitsOf('suiveur', 0.7), at)
      return {
        answer: ESPION_QUESTION_IDS.map((qid) => (m.view.isSpy ? espionSpyAnswer(m, qid, rng.next, deps) : espionCrewAnswer(m, qid, rng.next, deps))),
        voluntary: espionVoluntaryGuess(m, deps),
        accusation: espionBotAccusation(m, deps),
        first: espionFirstSuspect(m, deps),
        question: espionPickQuestion(m, deps, rng.next, 'd'),
        target: espionPickTarget(m, ['b', 'c', 'd', 'e'], deps, rng.next),
        verdict: ESPION_QUESTION_IDS.map((qid) => espionAnswerVerdict(m, { questionId: qid, value: espionQuestionValues(qid)[0] }, deps)),
        followUp: ['b', 'c', 'd', 'e'].map((id) => espionFollowUp(m, id, deps)),
        speech: [...espionSpeechSuspicion(m).entries()],
      }
    }
    return [run('x'), run('y')]
  }

  it('l’espion décide pareil, quel que soit le lieu tiré (75 lieux, même fil)', () => {
    const reference = outputs(table({ location: L, spy: 'me', speech }).state, 'me', MIN)
    for (const location of ESPION_LOCATION_IDS) {
      expect(outputs(table({ location, spy: 'me', speech }).state, 'me', MIN), location).toEqual(reference)
    }
  })

  it('un équipier décide pareil, quel que soit l’espion parmi les autres', () => {
    const reference = outputs(table({ location: L, spy: 'b', speech }).state, 'me', MIN)
    for (const spy of ['c', 'd', 'e']) {
      expect(outputs(table({ location: L, spy, speech }).state, 'me', MIN), spy).toEqual(reference)
    }
  })

  it('même tirage ⇒ même décision', () => {
    const { state } = table({ location: L, spy: 'e', speech })
    expect(outputs(state, 'me', MIN)).toEqual(outputs(state, 'me', MIN))
  })
})

describe('la parole publique dans le soupçon (lot 5)', () => {
  const precise = PRECISE(L)
  const [q1] = precise
  const suspect = (playerId: string, targetId: string): Entry => ({ playerId, kind: 'suspect', targetId, at: (clock += 1_000) })

  it('une accusation compte comme un « je trouve ça louche », à mi-poids ; les soutiens et refus muets n’y entrent pas', () => {
    // Six joueurs : majorité à 4, l'accusation reste ouverte malgré deux soutiens.
    const { state, start } = table({ ids: ['me', 'b', 'c', 'd', 'e', 'f'], location: L, spy: 'e', speech: qa('me', 'b', q1, attrs(L)[q1]) })
    let s = reduceEspion(state, { type: 'ACCUSE', playerId: 'c', targetId: 'e', now: start + 10_000 })
    s = reduceEspion(s, { type: 'SUPPORT', playerId: 'd', now: start + 11_000 })
    s = reduceEspion(s, { type: 'SUPPORT', playerId: 'b', now: start + 12_000 })
    s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.activeAccusation!.endsAt })
    const m = mind(s, 'me', traitsOf('farceur'), start + 30_000)
    // accuse (+2) et le premier soutien (+2) ; le second, muet, ne compte pas.
    expect(espionSpeechSuspicion(m).get('e')).toBe(4)
    expect(espionSuspicion(m, deps).get('e')).toBe(espionEvidence(m, deps).get('e')! + ESPION_SPEECH_WEIGHT * 4)
    expect(ESPION_SPEECH_WEIGHT).toBe(0.5)
  })

  it('une accusation en cours ne se prouve pas elle-même : ni elle ni ses soutiens ne comptent avant sa clôture', () => {
    const { state, start } = table({ location: L, spy: 'e' })
    let s = reduceEspion(state, { type: 'ACCUSE', playerId: 'c', targetId: 'e', now: start + 10_000 })
    s = reduceEspion(s, { type: 'SUPPORT', playerId: 'd', now: start + 11_000 })
    expect(espionSpeechSuspicion(mind(s, 'me', traitsOf('farceur'), start + 12_000)).get('e')).toBe(0)
    const closed = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.activeAccusation!.endsAt })
    expect(espionSpeechSuspicion(mind(closed, 'me', traitsOf('farceur'), start + 30_000)).get('e')).toBe(4)
  })

  it('une rumeur seule ne juge personne : sans réponse ni preuve, la cible d’un « louche » n’est ni accusée ni suivie', () => {
    const { state, start } = table({ location: L, spy: 'e', humans: ['b'], speech: [suspect('b', 'e')] })
    const m = mind(state, 'me', traitsOf('suiveur'), start + 20_000)
    // Un suiveur compte double la parole humaine : +4, à mi-poids.
    expect(espionSuspicion(m, deps).get('e')).toBe(2)
    expect(espionTopSuspects(m, deps)).toEqual([])
    expect(espionTopSuspects(m, deps, { judgedOnly: false })).toEqual(['e'])
    const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'b', targetId: 'e', now: start + 20_000 })
    expect(espionSupports(mind(accused, 'me', traitsOf('suiveur'), start + 20_000), deps, zero)).toBe(false)
  })
})

describe('réactions à la table (lot 5)', () => {
  const precise = PRECISE(L)
  const [q1, q2] = precise

  it('verdict d’un équipier sur une réponse : elle jure, elle colle, ou elle ne se juge pas (« ça dépend », case qui dépend)', () => {
    const { state, start } = table({ location: L, spy: 'e' })
    const m = mind(state, 'me', traitsOf('suiveur'), start)
    expect(espionAnswerVerdict(m, { questionId: q1, value: wrongFor(L, q1) as EspionAnswer }, deps)).toBe('clash')
    expect(espionAnswerVerdict(m, { questionId: q1, value: attrs(L)[q1] }, deps)).toBe('match')
    expect(espionAnswerVerdict(m, { questionId: q1, value: ESPION_ANY }, deps)).toBeNull()
    const vague = ESPION_QUESTION_IDS.find((qid) => attrs(L)[qid] === ESPION_ANY)
    if (vague) expect(espionAnswerVerdict(m, { questionId: vague, value: espionQuestionValues(vague)[0] }, deps)).toBeNull()
  })

  it('verdict de l’espion : jamais « ça jure » (il ne sait pas où l’on est) ; « ça colle » quand ses lieux en tête l’admettent', () => {
    const speech = [...qa('b', 'c', q1, attrs(L)[q1]), ...qa('c', 'd', q2, attrs(L)[q2])]
    const { state, start } = table({ location: L, spy: 'me', speech })
    const m = mind(state, 'me', traitsOf('suiveur'), start)
    for (const qid of ESPION_QUESTION_IDS) {
      for (const value of espionQuestionValues(qid)) {
        expect(espionAnswerVerdict(m, { questionId: qid, value }, deps), `${qid}=${value}`).not.toBe('clash')
      }
    }
    expect(espionAnswerVerdict(m, { questionId: q1, value: attrs(L)[q1] }, deps)).toBe('match')
  })

  it('approbation : une chance de 0,15 + 0,3 × loyauté', () => {
    expect(espionAllyShare({ loyaute: 0 })).toBeCloseTo(0.15)
    expect(espionAllyShare({ loyaute: 1 })).toBeCloseTo(0.45)
  })

  it('suite d’un « louche » humain : couvrir qui a répondu juste deux fois, abonder sur son premier suspect, sinon se taire', () => {
    const speech = [
      ...qa('b', 'c', q1, attrs(L)[q1]),
      ...qa('d', 'c', q2, attrs(L)[q2]),
      ...qa('c', 'd', precise[2], wrongFor(L, precise[2])),
    ]
    const louche = (target: string): Entry => ({ playerId: 'b', kind: 'suspect', targetId: target, at: (clock += 1_000) })
    const at = (target: string) => {
      const { state, start } = table({ location: L, spy: 'e', humans: ['b'], speech: [...speech, louche(target)] })
      return espionFollowUp(mind(state, 'me', traitsOf('farceur'), start + 30_000), target, deps)
    }
    expect(at('c')).toBe('ally')
    expect(at('d')).toBe('suspect')
    expect(at('e')).toBeNull()
    // L'espion, sans lieu, abonde quand la rumeur publique charge déjà la cible.
    const { state, start } = table({ location: L, spy: 'me', humans: ['b'], speech: [...qa('c', 'd', q1, ESPION_ANY), louche('d')] })
    expect(espionFollowUp(mind(state, 'me', traitsOf('farceur'), start), 'd', deps)).toBe('suspect')
    expect(espionFollowUp(mind(state, 'me', traitsOf('farceur'), start), 'c', deps)).toBeNull()
  })
})
