import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, type BotTraits, DEFAULT_BOT_TRAITS, botTraitsFor } from '@/lib/online/bot-personas'
import { getGameById, soloBotsCount } from '@/lib/games'
import { espionDiscussionMinutes } from './discussion'
import {
  createEspionState,
  espionActive,
  espionFreeSpeechLeft,
  espionQuestionCap,
  pendingEspionQuestion,
  reduceEspion,
  toEspionClientView,
  toEspionSpectatorView,
  EspionEngineError,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_QUESTION_TIMEOUT_MS,
  ESPION_REVEAL_MIN_MS,
  ESPION_SPEECH_CAP,
  type EspionAction,
  type EspionRoundOutcome,
  type EspionSpeech,
  type EspionState,
} from './engine'
import { applyEspionBotAction, serializeEspionState, ESPION_BOT_DEPS } from './server-adapter'
import {
  espionBotAccusation,
  espionEvidence,
  espionFirstSuspect,
  espionPickQuestion,
  espionPickTarget,
  espionSupports,
  type EspionBotDeps,
  type EspionMind,
} from './bot-brain'
import {
  espionAskTargets,
  espionBotTickDelayMs,
  espionHash01,
  ESPION_LAST_CALL_MS,
  ESPION_NO_QUESTION_END_MS,
  ESPION_SPEECH_END_MS,
} from './bot-tick'
import { ESPION_LOCATION_IDS, espionLocationIdOf, getEspionLocations, type EspionLocationId } from './data'
import {
  ESPION_ANY,
  ESPION_QUESTION_IDS,
  espionQuestionValues,
  type EspionAnswer,
  type EspionAttributes,
  type EspionQuestionId,
} from './data/questions'

/**
 * PARTIES COMPLÈTES DE L'ESPION, horloge simulée : le temps saute à la plus
 * proche des échéances — le tick bot (espionBotTickDelayMs, tirage seedé),
 * l'échéance d'accusation ou de chrono (advance), l'action d'un humain
 * scripté (4 à 12 s, hachée). Les seuils qui dépendent de t (accusation,
 * dernier appel, devinette, prudence) sont donc mesurés au vrai rythme.
 * Rejouable à l'identique : même graine, même journal.
 *
 * Carnet factice (12 lieux synthétiques) pour la mécanique, vrai carnet pour
 * l'équilibre : le carnet ne dépend d'aucune langue, l'équilibre mesuré vaut
 * pour les 4. Hors bornes, on règle les constantes du cerveau (bot-brain.ts),
 * jamais le carnet.
 */

const MINUTE = 60_000
/** Un humain referme la révélation au plancher de lecture : avant, le moteur refuse (READING_TIME). */
const REVEAL_READ_MS = ESPION_REVEAL_MIN_MS

type Seat = { id: string; name: string; isBot: boolean }

/** `count` bots à persona, la distribution des traits variant avec `offset`. */
function botSeats(count: number, offset = 0): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-${i + 1}`,
    name: BOT_PERSONAS[(i + offset) % BOT_PERSONAS.length].name,
    isBot: true,
  }))
}

const humanSeats = (count: number): Seat[] =>
  Array.from({ length: count }, (_, i) => ({ id: `h${i + 1}`, name: `Humain ${i + 1}`, isBot: false }))

// ─── Carnet factice : 12 lieux synthétiques sur des ids réels ───────────────

const FAKE_IDS = ESPION_LOCATION_IDS.slice(0, 12) as EspionLocationId[]
const FAKE_CARNET = new Map<EspionLocationId, EspionAttributes>(
  FAKE_IDS.map((id, i) => {
    const attrs = {} as Record<EspionQuestionId, string>
    ESPION_QUESTION_IDS.forEach((q, j) => {
      const values = espionQuestionValues(q)
      // Une case sur sept « ça dépend », le reste réparti de façon déterministe.
      attrs[q] = (i * 5 + j * 3) % 7 === 0 ? ESPION_ANY : values[(i + j * 2) % values.length]
    })
    return [id, attrs as EspionAttributes]
  })
)
const FAKE_DEPS: EspionBotDeps = { attrsOf: (id) => FAKE_CARNET.get(id) ?? null }
const FAKE_LOCATIONS = FAKE_IDS.map((id) => getEspionLocations('fr')[ESPION_LOCATION_IDS.indexOf(id)])

// ─── Humains scriptés ────────────────────────────────────────────────────────

type HumanPlan = { at: number; action: EspionAction } | null
type Script = (s: EspionState, humanId: string, now: number, deps: EspionBotDeps, rand: () => number) => HumanPlan

/** Délai de réaction d'un humain, 4 à 12 s, haché sur la situation qui le déclenche. */
const humanDelay = (key: string) => 4_000 + 8_000 * espionHash01(`humain-${key}`)

/** L'humain honnête raisonne comme un bot suiveur moyen. */
const HONEST: BotTraits = { ...DEFAULT_BOT_TRAITS, trait: 'suiveur', audace: 0.5 }

function humanMind(s: EspionState, humanId: string, now: number): EspionMind {
  return { view: toEspionClientView(s, humanId), botId: humanId, traits: HONEST, now }
}

const isSpy = (s: EspionState, id: string) => s.players.find((p) => p.id === id)?.role === 'spy'
const roundSpeech = (s: EspionState) => (s.speech ?? []).filter((sp) => sp.round === s.round)

/** Ce que les autres répondent le plus à cette question (hors « ça dépend »), sinon « ça dépend » : la réponse d'un perroquet. */
function parrotValue(s: EspionState, humanId: string, questionId: EspionQuestionId): EspionAnswer {
  const counts = new Map<string, number>()
  for (const sp of roundSpeech(s)) {
    if (sp.kind !== 'answer' || sp.playerId === humanId) continue
    if (sp.questionId !== questionId || !sp.value || sp.value === ESPION_ANY) continue
    counts.set(sp.value, (counts.get(sp.value) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [value, n] of counts) if (best === null || n > counts.get(best)!) best = value
  return (best ?? ESPION_ANY) as EspionAnswer
}

/** La réponse du carnet au vrai lieu : celle d'un équipier de bonne foi. */
function honestValue(s: EspionState, deps: EspionBotDeps, questionId: EspionQuestionId): EspionAnswer {
  const id = espionLocationIdOf(s.location)
  return (id && deps.attrsOf(id)?.[questionId]) || ESPION_ANY
}

/** Répondre à la question qui le vise, après son délai. */
function answerPlan(s: EspionState, humanId: string, now: number, value: (q: EspionQuestionId) => EspionAnswer): HumanPlan {
  const pending = pendingEspionQuestion(s, now)
  if (!pending || pending.targetId !== humanId) return null
  return {
    at: pending.askedAt + humanDelay(`${humanId}-a-${pending.askedAt}`),
    action: { type: 'ANSWER', playerId: humanId, value: value(pending.questionId), now: 0 },
  }
}

/** Continuer la révélation qu'il mène. */
function continuePlan(s: EspionState, humanId: string, now: number): HumanPlan {
  if (s.phase !== 'reveal' || espionActive(s)[0]?.id !== humanId) return null
  return { at: now + REVEAL_READ_MS, action: { type: 'CONTINUE', playerId: humanId, now: 0 } }
}

const lastAnswer = (s: EspionState) => [...roundSpeech(s)].reverse().find((sp) => sp.kind === 'answer')

/**
 * Équipier honnête : il répond la valeur du carnet de son lieu, soutient ou
 * refuse comme un bot suiveur, accuse son premier suspect sur preuves, et
 * pose une question quand il a la main (ou quand la table se tait). Espion
 * (tirage du moteur), il répète ce qu'il entend et soutient toute accusation
 * contre un autre, sans jamais deviner.
 */
const honest: Script = (s, me, now, deps, rand) => {
  if (s.phase === 'reveal') return continuePlan(s, me, now)
  if (s.phase !== 'discussion') return null
  const spy = isSpy(s, me)
  const answer = answerPlan(s, me, now, (q) => (spy ? parrotValue(s, me, q) : honestValue(s, deps, q)))
  if (answer) return answer
  const acc = s.activeAccusation
  if (acc) {
    if (acc.targetId === me || acc.supporters.includes(me) || (acc.declined ?? []).includes(me)) return null
    const openedAt = acc.endsAt - ESPION_ACCUSATION_WINDOW_MS
    const at = openedAt + humanDelay(`${me}-d-${openedAt}`) / 2
    const supports = spy || espionSupports(humanMind(s, me, Math.max(now, at)), deps, rand)
    return { at, action: { type: supports ? 'SUPPORT' : 'DECLINE', playerId: me, now: 0 } }
  }
  const heard = lastAnswer(s)
  if (!heard) return null
  const at = heard.at + humanDelay(`${me}-t-${heard.at}`)
  if (!spy) {
    const target = espionBotAccusation(humanMind(s, me, Math.max(now, at)), deps)
    if (target) return { at, action: { type: 'ACCUSE', playerId: me, targetId: target, now: 0 } }
  }
  if (pendingEspionQuestion(s, now)) return null
  // Il pose quand il a la main, sinon de lui-même quand la table se tait.
  const quietSince = roundSpeech(s).pop()!.at
  const askAt = heard.playerId === me ? at : quietSince + 2 * humanDelay(`${me}-q-${quietSince}`)
  const mind = humanMind(s, me, Math.max(now, askAt))
  const targets = espionAskTargets(toEspionClientView(s, me), me, Math.max(now, askAt)).filter(
    (id) => s.players.find((p) => p.id === id)?.isBot
  )
  const targetId = espionPickTarget(mind, targets, deps, rand)
  if (!targetId) return null
  return { at: askAt, action: { type: 'ASK', playerId: me, targetId, questionId: espionPickQuestion(mind, deps, rand, targetId), now: 0 } }
}

/**
 * Équipier bavard : l'honnête, qui se défend quand on le vise et dit tout
 * haut « je trouve ça louche » de son premier suspect avant de l'accuser.
 */
const talker: Script = (s, me, now, deps, rand) => {
  if (s.phase === 'discussion' && !pendingEspionQuestion(s, now) && espionFreeSpeechLeft(s, me) > 0) {
    const speech = roundSpeech(s)
    const present = (id: string) => espionActive(s).some((p) => p.id === id)
    const aimed = [...speech].reverse().find((sp) => (sp.kind === 'accuse' || sp.kind === 'suspect') && sp.targetId === me)
    const defended = aimed && speech.slice(speech.indexOf(aimed) + 1).some((sp) => sp.playerId === me && sp.kind === 'defend')
    if (aimed && present(aimed.playerId) && !defended) {
      return {
        at: aimed.at + humanDelay(`${me}-def-${aimed.at}`) / 2,
        action: { type: 'SPEAK', playerId: me, kind: 'defend', targetId: aimed.playerId, now: 0 },
      }
    }
    const heard = lastAnswer(s)
    const mind = humanMind(s, me, now)
    const target = heard && !s.activeAccusation ? espionFirstSuspect(mind, deps) : null
    // Il ne trouve « louche » que sur une preuve : une réponse qui jure, un « ça dépend » suspect.
    const grounded = target !== null && (espionEvidence(mind, deps).get(target) ?? 0) > 0
    if (heard && target && grounded && !speech.some((sp) => sp.playerId === me && sp.kind === 'suspect' && sp.targetId === target)) {
      return {
        at: heard.at + humanDelay(`${me}-louche-${heard.at}`) / 2,
        action: { type: 'SPEAK', playerId: me, kind: 'suspect', targetId: target, now: 0 },
      }
    }
  }
  return honest(s, me, now, deps, rand)
}

/** Silencieux : il ne touche à rien (sauf « continuer » la révélation qu'il mène). */
const silent: Script = (s, me, now) => (s.phase === 'reveal' ? continuePlan(s, me, now) : null)

/** Espion perroquet : il répète la valeur majoritaire, « ça dépend » sinon, et ne devine jamais. */
const parrot: Script = (s, me, now) => {
  if (s.phase === 'reveal') return continuePlan(s, me, now)
  if (s.phase !== 'discussion') return null
  return answerPlan(s, me, now, (q) => parrotValue(s, me, q))
}

/** Espion qui accuse un bot au hasard dès le début, puis à chaque fenêtre libre. */
const accuseBots: Script = (s, me, now) => {
  if (s.phase === 'reveal') return continuePlan(s, me, now)
  if (s.phase !== 'discussion') return null
  const answer = answerPlan(s, me, now, (q) => parrotValue(s, me, q))
  if (answer) return answer
  if (s.activeAccusation) return null
  const bots = espionActive(s).filter((p) => p.isBot)
  const lastEntry = roundSpeech(s).pop()
  const anchor = lastEntry?.at ?? s.phaseEndsAt! - s.discussionMs
  const target = bots[Math.floor(espionHash01(`${me}-x-${anchor}`) * bots.length)]
  return { at: anchor + 1_000, action: { type: 'ACCUSE', playerId: me, targetId: target.id, now: 0 } }
}

/**
 * Espion calomniateur : avant chaque accusation d'un bot au hasard, il le
 * dit « louche » tout haut — la parole publique ne doit pas suffire à faire
 * suivre la table (effet de troupeau).
 */
const smearBots: Script = (s, me, now, deps, rand) => {
  const plan = accuseBots(s, me, now, deps, rand)
  if (!plan || plan.action.type !== 'ACCUSE' || espionFreeSpeechLeft(s, me) <= 0) return plan
  const targetId = plan.action.targetId
  if (roundSpeech(s).some((sp) => sp.playerId === me && sp.kind === 'suspect' && sp.targetId === targetId)) return plan
  return { at: plan.at - 500, action: { type: 'SPEAK', playerId: me, kind: 'suspect', targetId, now: 0 } }
}

/** Réponses au hasard, soutiens et refus à pile ou face. */
const randomHuman: Script = (s, me, now) => {
  if (s.phase === 'reveal') return continuePlan(s, me, now)
  if (s.phase !== 'discussion') return null
  const answer = answerPlan(s, me, now, (q) => {
    const values = [...espionQuestionValues(q), ESPION_ANY]
    return values[Math.floor(espionHash01(`${me}-r-${q}-${now}`) * values.length)] as EspionAnswer
  })
  if (answer) return answer
  const acc = s.activeAccusation
  if (!acc || acc.targetId === me || acc.supporters.includes(me) || (acc.declined ?? []).includes(me)) return null
  const openedAt = acc.endsAt - ESPION_ACCUSATION_WINDOW_MS
  const supports = espionHash01(`${me}-s-${openedAt}`) < 0.5
  return {
    at: openedAt + humanDelay(`${me}-d-${openedAt}`) / 2,
    action: { type: supports ? 'SUPPORT' : 'DECLINE', playerId: me, now: 0 },
  }
}

// ─── La boucle ───────────────────────────────────────────────────────────────

type GuessKind = 'voluntary' | 'desperate'

type AccusationLog = {
  /** Lancée à l'heure du dernier appel (T − 40 s ou plus tard). */
  lastCall: boolean
  byBot: boolean
  spyAccuser: boolean
  spyTarget: boolean
  t: number
  /** Réponses précises que l'espion avait entendues à l'ouverture. */
  heard: number
}

type RoundLog = {
  round: number
  outcome: EspionRoundOutcome
  winner: 'spy' | 'crew'
  /** Part du chrono écoulée à la décision. */
  t: number
  spyId: string
  spyIsBot: boolean
  location: EspionLocationId | null
  questions: number
  /** Cible de chaque question de la manche, dans l'ordre. */
  questionTargets: string[]
  guess: { kind: GuessKind; right: boolean; heard: number } | null
  accusations: AccusationLog[]
  /** Questions à un bot restées sans réponse alors que la manche courait encore à leur échéance. */
  unansweredBotQuestions: number
  /** Questions de bots posées dans les 10 dernières secondes. */
  lateBotQuestions: number
  /** Fin du chrono de la manche. */
  endAt: number
  /** Soutiens de leur propre accusation par la cible. */
  selfSupports: number
  /** Questions à un humain qui n'était pas engagé (multi-humains). */
  unengagedAsks: number
  refusals: number
  speech: EspionSpeech[]
}

type Game = { state: EspionState; rounds: RoundLog[]; maxJsonBytes: number }

type Options = {
  bots: number
  humans?: number
  script?: Script
  minutes?: number
  deps?: EspionBotDeps
  locations?: string[]
  /** L'humain h1 est l'espion de chaque manche (true) ou jamais (false) ; absent, le tirage du moteur. */
  humanSpy?: boolean
}

/** Le tirage des rôles est réécrit pour mesurer un humain dans un seul rôle. */
function forceRoles(s: EspionState, humanSpy: boolean | undefined, rand: () => number): EspionState {
  if (humanSpy === undefined) return s
  const human = s.players.find((p) => !p.isBot)!
  const bots = s.players.filter((p) => p.isBot)
  const spyId = humanSpy ? human.id : bots[Math.floor(rand() * bots.length)].id
  return { ...s, players: s.players.map((p) => ({ ...p, role: p.id === spyId ? 'spy' : 'crew' })) }
}

/** Réponses précises des autres que l'espion, avant `at`, dans la manche : ce que l'espion a pu entendre. */
function heardBy(speech: readonly EspionSpeech[], spyId: string, at: number): number {
  return speech.filter((sp) => sp.kind === 'answer' && sp.playerId !== spyId && sp.value !== ESPION_ANY && sp.at <= at)
    .length
}

/** Un humain était-il engagé (question posée ou réponse donnée, cette manche ou la précédente) à `at` ? */
function engagedAt(all: readonly EspionSpeech[], round: number, id: string, at: number): boolean {
  return all.some(
    (sp) =>
      sp.playerId === id &&
      sp.at < at &&
      (sp.kind === 'question' || sp.kind === 'answer') &&
      (sp.round === round || sp.round === round - 1)
  )
}

function playGame(seed: string, opts: Options): Game {
  const deps = opts.deps ?? ESPION_BOT_DEPS
  const seats = [...humanSeats(opts.humans ?? 0), ...botSeats(opts.bots, Math.floor(createRng(seed).next() * 20))]
  const rand = createRng(`bots-${seed}`).next
  const humanRand = createRng(`humains-${seed}`).next
  const discussionMs = (opts.minutes ?? 3) * MINUTE
  const humans = seats.filter((p) => !p.isBot).map((p) => p.id)
  const multiHuman = humans.length > 1
  let s = createEspionState(seats, opts.locations ?? getEspionLocations('fr'), seed, 0, discussionMs, 3)
  s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
  s = forceRoles(s, opts.humanSpy, humanRand)
  let now = s.phaseEndsAt! - discussionMs
  let versionAt = now
  let botTried = false
  let roundStart = now
  let decidedAt = now
  let maxJsonBytes = 0
  let guess: RoundLog['guess'] = null
  let refusals = 0
  let selfSupports = 0
  /** Coups d'humains devenus invalides, à ne plus retenter sur cette version. */
  const passed = new Set<string>()
  const rounds: RoundLog[] = []

  const noteGuess = (before: EspionState, after: EspionState) => {
    // lastReveal reste celui de la manche d'avant pendant la discussion : seul un passage au reveal compte.
    const outcome = after.phase === 'reveal' ? after.lastReveal?.outcome : undefined
    const guessing = before.phase === 'discussion' || before.phase === 'lastChance'
    if (!guessing || (outcome !== 'spy-guessed-right' && outcome !== 'spy-guessed-wrong')) return
    const spy = before.players.find((p) => p.role === 'spy')!
    const desperate = before.activeAccusation?.targetId === spy.id
    guess = {
      kind: desperate ? 'desperate' : 'voluntary',
      right: outcome === 'spy-guessed-right',
      heard: heardBy((before.speech ?? []).filter((sp) => sp.round === before.round), spy.id, now),
    }
  }

  for (let steps = 0; s.phase !== 'finished'; steps += 1) {
    if (steps > 20_000) throw new Error(`partie sans fin : ${seed}, manche ${s.round}`)
    const candidates: { at: number; run: () => void }[] = []
    if (!botTried) {
      const delay = espionBotTickDelayMs(toEspionSpectatorView(s), versionAt, rand)
      if (delay !== null) {
        candidates.push({
          at: versionAt + delay,
          run: () => {
            const before = s
            const result = applyEspionBotAction(s, rand, now, deps)
            if (!result.ok) {
              if (result.error !== 'NOT_BOT_TURN') throw new Error(`refus inattendu : ${result.error} (${seed})`)
              botTried = true
              // Un refus en fin de manche (échéance au-delà du chrono) est terminal : il ne compte pas.
              if (s.phase === 'discussion' && s.phaseEndsAt !== null && now < s.phaseEndsAt) refusals += 1
              return
            }
            s = result.state
            noteGuess(before, s)
          },
        })
      }
    }
    // La dernière chance de l'espion humain démasqué a son échéance, comme la discussion.
    if ((s.phase === 'discussion' || s.phase === 'lastChance') && s.phaseEndsAt !== null) {
      const deadline = s.activeAccusation ? Math.min(s.activeAccusation.endsAt, s.phaseEndsAt) : s.phaseEndsAt
      candidates.push({
        at: Math.max(deadline, now),
        run: () => {
          s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now })
        },
      })
    }
    for (const id of humans) {
      if (passed.has(`${s.version}-${id}`)) continue
      const plan = opts.script?.(s, id, now, deps, humanRand)
      if (!plan) continue
      candidates.push({
        at: Math.max(plan.at, now),
        run: () => {
          try {
            const before = s
            s = reduceEspion(s, { ...plan.action, now } as EspionAction)
            noteGuess(before, s)
          } catch (e) {
            if (!(e instanceof EspionEngineError)) throw e
            // Le coup prévu n'est plus valable (fenêtre close, question expirée…) : l'humain passe.
            passed.add(`${s.version}-${id}`)
          }
        },
      })
    }
    if (candidates.length === 0) throw new Error(`table figée : ${seed}, manche ${s.round}, phase ${s.phase}`)
    candidates.sort((a, b) => a.at - b.at)
    const next = candidates[0]
    now = next.at
    const version = s.version
    const phaseBefore = s.phase
    const roundBefore = s.round
    const accBefore = s.activeAccusation
    next.run()
    // L'issue se décide en quittant la discussion ; la dernière chance ne fait qu'attendre la devinette.
    if (phaseBefore === 'discussion' && s.phase !== 'discussion') decidedAt = now
    if (s.version !== version) {
      versionAt = now
      botTried = false
      if (seats.length >= 16) maxJsonBytes = Math.max(maxJsonBytes, serializeEspionState(s).length)
      if (accBefore && s.activeAccusation?.supporters.includes(accBefore.targetId)) selfSupports += 1
    }
    if ((phaseBefore === 'discussion' || phaseBefore === 'lastChance') && s.phase === 'reveal' && s.lastReveal) {
      const all = s.speech ?? []
      const speech = all.filter((sp) => sp.round === roundBefore)
      const spyId = s.lastReveal.spyId
      const endAt = roundStart + discussionMs
      const isBot = (id: string) => Boolean(s.players.find((p) => p.id === id)?.isBot)
      const questions = speech.filter((sp) => sp.kind === 'question')
      rounds.push({
        round: roundBefore,
        outcome: s.lastReveal.outcome,
        winner: s.lastReveal.winner,
        t: (decidedAt - roundStart) / discussionMs,
        spyId,
        spyIsBot: isBot(spyId),
        location: espionLocationIdOf(s.lastReveal.location),
        questions: questions.length,
        questionTargets: questions.map((sp) => sp.targetId ?? ''),
        guess,
        accusations: speech
          .filter((sp) => sp.kind === 'accuse')
          .map((sp) => ({
            lastCall: sp.at >= endAt - ESPION_LAST_CALL_MS,
            byBot: isBot(sp.playerId),
            spyAccuser: sp.playerId === spyId,
            spyTarget: sp.targetId === spyId,
            t: (sp.at - roundStart) / discussionMs,
            heard: heardBy(speech, spyId, sp.at),
          })),
        unansweredBotQuestions: questions.filter((q) => {
          if (!isBot(q.targetId!)) return false
          const due = q.at + ESPION_QUESTION_TIMEOUT_MS
          if (due > now) return false
          return !speech.some((sp) => sp.kind === 'answer' && sp.playerId === q.targetId && sp.at > q.at && sp.at < due)
        }).length,
        lateBotQuestions: questions.filter((q) => isBot(q.playerId) && q.at > endAt - ESPION_NO_QUESTION_END_MS).length,
        endAt,
        selfSupports,
        unengagedAsks: multiHuman
          ? questions.filter((q) => isBot(q.playerId) && !isBot(q.targetId!) && !engagedAt(all, roundBefore, q.targetId!, q.at))
              .length
          : 0,
        refusals,
        speech,
      })
      guess = null
      refusals = 0
      selfSupports = 0
    }
    if (phaseBefore === 'reveal' && s.phase === 'discussion') {
      s = forceRoles(s, opts.humanSpy, humanRand)
      roundStart = now
    }
  }
  return { state: s, rounds, maxJsonBytes }
}

// ─── Mesures ─────────────────────────────────────────────────────────────────

type Stats = {
  rounds: number
  crew: number
  caught: number
  failed: number
  right: number
  wrong: number
  timeout: number
  medianT: number
  voluntary: number
  voluntaryRight: number
  /** Manches où le bot espion a lancé une accusation (diversion)… */
  diversions: number
  /** … et part de celles qu'elle a gagnées (accusation-failed sur sa diversion : la table l'a suivi). */
  diversionsWon: number
}

function stats(games: readonly Game[]): Stats {
  const rounds = games.flatMap((g) => g.rounds)
  const share = (pred: (r: RoundLog) => boolean) => rounds.filter(pred).length / rounds.length
  const ts = rounds.map((r) => r.t).sort((a, b) => a - b)
  const voluntary = rounds.filter((r) => r.guess?.kind === 'voluntary')
  const diverted = rounds.filter((r) => r.spyIsBot && r.accusations.some((a) => a.spyAccuser))
  return {
    rounds: rounds.length,
    crew: share((r) => r.winner === 'crew'),
    caught: share((r) => r.outcome === 'spy-caught'),
    failed: share((r) => r.outcome === 'accusation-failed'),
    right: share((r) => r.outcome === 'spy-guessed-right'),
    wrong: share((r) => r.outcome === 'spy-guessed-wrong'),
    timeout: share((r) => r.outcome === 'timeout'),
    medianT: ts[Math.floor(ts.length / 2)],
    voluntary: voluntary.length,
    voluntaryRight: voluntary.length === 0 ? 1 : voluntary.filter((r) => r.guess!.right).length / voluntary.length,
    diversions: diverted.length,
    diversionsWon: diverted.length === 0 ? 0 : diverted.filter(divertedWon).length / diverted.length,
  }
}

/** La manche s'est close sur l'accusation lancée par le bot espion : la table a suivi sa diversion. */
function divertedWon(r: RoundLog): boolean {
  const last = r.accusations[r.accusations.length - 1]
  return r.outcome === 'accusation-failed' && Boolean(last?.spyAccuser)
}

const label = (st: Stats) =>
  Object.entries(st)
    .map(([k, v]) => `${k}=${Number.isInteger(v) ? v : v.toFixed(2)}`)
    .join(' ')

/** Les parties d'une configuration, jouées une fois et partagées par ses `it`. */
function lazyGames(count: number, prefix: string, opts: Options): () => Game[] {
  let cached: Game[] | null = null
  return () => (cached ??= Array.from({ length: count }, (_, seed) => playGame(`${prefix}-${seed}`, opts)))
}

const FREE_SPEECH = ['suspect', 'defend', 'ally', 'toldYou', 'wrong']
const REMARKS = ['toldYou', 'wrong']

/** Les invariants mécaniques, valables dans toutes les configurations. */
function expectMechanics(games: readonly Game[], name: string) {
  for (const [g, game] of games.entries()) {
    expect(game.state.phase, `${name} #${g}`).toBe('finished')
    const isBot = (id: string) => Boolean(game.state.players.find((p) => p.id === id)?.isBot)
    for (const r of game.rounds) {
      const where = `${name} #${g} manche ${r.round}`
      // Seul refus admis : NOT_BOT_TURN (playGame jette sinon), au plus un par manche hors fin de manche.
      expect(r.refusals, where).toBeLessThanOrEqual(1)
      expect(r.selfSupports, where).toBe(0)
      expect(r.unansweredBotQuestions, where).toBe(0)
      expect(r.lateBotQuestions, where).toBe(0)
      expect(r.unengagedAsks, where).toBe(0)
      expect(r.questions, where).toBeLessThanOrEqual(espionQuestionCap(game.state.players.length))
      expectSpeechBudgets(r, isBot, (id) => game.state.players.find((p) => p.id === id)?.name, where)
    }
  }
}

/**
 * La parole libre des bots (lot 5), avec parcimonie : jamais dans les 10
 * dernières secondes ; min(ESPION_SPEECH_CAP, bavardage) par bot hors
 * défense, ESPION_SPEECH_CAP en tout ; deux remarques par manche ; une
 * approbation au plus par humain ; une seule réaction (soupçon ou
 * approbation) entre deux réponses d'un même humain.
 */
function expectSpeechBudgets(
  r: RoundLog,
  isBot: (id: string) => boolean,
  nameOf: (id: string) => string | undefined,
  where: string
) {
  const spoken = r.speech.filter((sp) => isBot(sp.playerId) && FREE_SPEECH.includes(sp.kind))
  expect(spoken.filter((sp) => sp.at >= r.endAt - ESPION_SPEECH_END_MS), where).toEqual([])
  for (const id of new Set(spoken.map((sp) => sp.playerId))) {
    const mine = spoken.filter((sp) => sp.playerId === id)
    expect(mine.length, `${where} ${id}`).toBeLessThanOrEqual(ESPION_SPEECH_CAP)
    const chatter = mine.filter((sp) => sp.kind !== 'defend').length
    expect(chatter, `${where} ${id}`).toBeLessThanOrEqual(Math.min(ESPION_SPEECH_CAP, botTraitsFor(nameOf(id)).bavardage))
  }
  expect(spoken.filter((sp) => REMARKS.includes(sp.kind)).length, where).toBeLessThanOrEqual(2)
  const humans = new Set(r.speech.filter((sp) => !isBot(sp.playerId)).map((sp) => sp.playerId))
  for (const h of humans) {
    expect(spoken.filter((sp) => sp.kind === 'ally' && sp.targetId === h).length, `${where} ${h}`).toBeLessThanOrEqual(1)
  }
  // Une seule réaction par réponse : en solo, où aucune autre pique humaine ne vise l'humain.
  if (humans.size !== 1) return
  const [h] = [...humans]
  let since = 0
  for (const sp of r.speech) {
    if (sp.kind === 'answer' && sp.playerId === h) since = 0
    else if (isBot(sp.playerId) && sp.targetId === h && (sp.kind === 'suspect' || sp.kind === 'ally')) {
      since += 1
      expect(since, `${where} : deux réactions à la même réponse de ${h}`).toBeLessThanOrEqual(1)
    }
  }
}

const A = {
  a5: lazyGames(60, 'a5', { bots: 5 }),
  a8: lazyGames(60, 'a8', { bots: 8 }),
  a16: lazyGames(60, 'a16', { bots: 16 }),
  a8long: lazyGames(60, 'a8m', { bots: 8, minutes: 5 }),
}
/**
 * La vraie table d'essai : les bots de « Essayer avec des bots » et le chrono
 * qu'un humain seul reçoit sans choisir. Un réglage qui la change refait
 * passer la mesure (B) au lieu de mesurer une table qui n'existe plus.
 */
const SOLO = {
  humans: 1,
  bots: soloBotsCount(getGameById('espion')!),
  minutes: espionDiscussionMinutes(undefined, 1),
}
const B = {
  honest: lazyGames(100, 'bh', { ...SOLO, script: honest, humanSpy: false }),
  parrot: lazyGames(100, 'bp', { ...SOLO, script: parrot, humanSpy: true }),
  silent: lazyGames(100, 'bs', { ...SOLO, script: silent, humanSpy: true }),
  accuse: lazyGames(100, 'ba', { ...SOLO, script: accuseBots, humanSpy: true }),
  random: lazyGames(100, 'br', { ...SOLO, script: randomHuman }),
  talker: lazyGames(60, 'bt', { ...SOLO, script: talker, humanSpy: false }),
  smear: lazyGames(60, 'bc', { ...SOLO, script: smearBots, humanSpy: true }),
}
const C = lazyGames(60, 'c', { bots: 2, humans: 1, script: honest, humanSpy: false })
const D = lazyGames(60, 'd', { bots: 2, humans: 3, script: honest })
const D_TALK = lazyGames(40, 'dt', { bots: 2, humans: 3, script: talker })
const FAKE = lazyGames(30, 'f', { bots: 6, deps: FAKE_DEPS, locations: FAKE_LOCATIONS })

const ALL: [string, () => Game[]][] = [
  ['A5', A.a5],
  ['A8', A.a8],
  ['A16', A.a16],
  ['A8-5min', A.a8long],
  ['B honnête', B.honest],
  ['B perroquet', B.parrot],
  ['B silencieux', B.silent],
  ['B accuse', B.accuse],
  ['B hasard', B.random],
  ['B bavard', B.talker],
  ['B calomnie', B.smear],
  ['C', C],
  ['D', D],
  ['D bavards', D_TALK],
]

/** Les parties d'une configuration se jouent dans son premier `it` : plusieurs secondes sous `npm test`. */
const SLOW = 120_000

describe('simulation (A) : bots seuls, 3 manches à gagner, vrai carnet', () => {
  const sizes: [string, () => Game[], number, number][] = [
    ['5 sièges', A.a5, 0.4, 0.35],
    ['8 sièges', A.a8, 0.4, 0.35],
    // Écart assumé : 14 questions au plus pour 15 autres joueurs, l'espion ne
    // répond qu'une fois par manche et rien ne le distingue de ses voisins ;
    // l'équipe plafonne vers 25 % et l'espion, jamais démasqué, devine le lieu
    // plus souvent (vers 38 %). Une table de 16 bots n'existe pas en vrai.
    ['16 sièges', A.a16, 0.2, 0.45],
    ['8 sièges en 5 min', A.a8long, 0.4, 0.35],
  ]
  for (const [name, games, crewMin, rightMax] of sizes) {
    it(`${name} : l’équipe gagne ${crewMin * 100} à 65 % des manches`, () => {
      const st = stats(games())
      expect(st.crew, label(st)).toBeGreaterThanOrEqual(crewMin)
      expect(st.crew, label(st)).toBeLessThanOrEqual(0.65)
    }, SLOW)
    it(`${name} : spy-guessed-right dans 10 à ${rightMax * 100} % des manches, timeout dans 25 % au plus`, () => {
      const st = stats(games())
      expect(st.right, label(st)).toBeGreaterThanOrEqual(0.1)
      expect(st.right, label(st)).toBeLessThanOrEqual(rightMax)
      expect(st.timeout, label(st)).toBeLessThanOrEqual(0.25)
    }, SLOW)
    it(`${name} : décision médiane avant 80 % du chrono, devinettes volontaires justes à 60 % au moins`, () => {
      const st = stats(games())
      expect(st.medianT, label(st)).toBeLessThan(0.8)
      expect(st.voluntaryRight, label(st)).toBeGreaterThanOrEqual(0.6)
    }, SLOW)
  }
})

describe('simulation (B) : solo, 1 humain scripté + 4 bots', () => {
  it('équipier honnête : l’équipe gagne 45 à 75 % des manches', () => {
    const st = stats(B.honest())
    expect(st.crew, label(st)).toBeGreaterThanOrEqual(0.45)
    expect(st.crew, label(st)).toBeLessThanOrEqual(0.75)
  }, SLOW)

  it('espion perroquet : l’espion gagne 30 à 60 % des manches (l’humain a sa chance)', () => {
    const st = stats(B.parrot())
    expect(1 - st.crew, label(st)).toBeGreaterThanOrEqual(0.3)
    expect(1 - st.crew, label(st)).toBeLessThanOrEqual(0.6)
  }, SLOW)

  it('espion silencieux : démasqué dans 50 % des manches au moins, gagnant dans 40 % au plus (exploit « attendre » fermé)', () => {
    const st = stats(B.silent())
    expect(st.caught, label(st)).toBeGreaterThanOrEqual(0.5)
    expect(1 - st.crew, label(st)).toBeLessThanOrEqual(0.4)
  }, SLOW)

  // Fermer l'exploit, c'est aussi ne pas le gagner au chrono : des accusations à la
  // chaîne gèlent les questions, et seul le dernier appel démasque alors l'espion.
  it('espion qui accuse un bot à chaque fenêtre : accusation-failed dans 10 % des manches au plus, gagnant dans 40 % au plus (exploit fermé)', () => {
    const st = stats(B.accuse())
    expect(st.failed, label(st)).toBeLessThanOrEqual(0.1)
    expect(1 - st.crew, label(st)).toBeLessThanOrEqual(0.4)
  }, SLOW)

  it('espion qui dit « louche » avant d’accuser un bot : accusation-failed dans 10 % des manches au plus, gagnant dans 40 % au plus (la parole seule ne fait pas suivre)', () => {
    const st = stats(B.smear())
    expect(st.failed, label(st)).toBeLessThanOrEqual(0.1)
    expect(1 - st.crew, label(st)).toBeLessThanOrEqual(0.4)
  }, SLOW)

  it('équipier bavard : l’équipe gagne 45 à 75 % des manches, comme l’honnête', () => {
    const st = stats(B.talker())
    expect(st.crew, label(st)).toBeGreaterThanOrEqual(0.45)
    expect(st.crew, label(st)).toBeLessThanOrEqual(0.75)
  }, SLOW)

  it('réponses au hasard : les parties finissent', () => {
    expect(B.random().every((g) => g.state.phase === 'finished')).toBe(true)
  }, SLOW)

  it('l’humain reçoit 1 à 3 questions par manche, jamais deux de suite', () => {
    for (const games of [B.honest(), B.parrot(), B.silent(), B.random()]) {
      for (const r of games.flatMap((g) => g.rounds)) {
        const trail = r.questionTargets.join(',')
        const mine = r.questionTargets.filter((id) => id === 'h1').length
        expect(mine, trail).toBeLessThanOrEqual(3)
        if (r.questions >= 3) expect(mine, trail).toBeGreaterThanOrEqual(1)
        r.questionTargets.forEach((id, i) => {
          if (i > 0 && id === 'h1') expect(r.questionTargets[i - 1], trail).not.toBe('h1')
        })
      }
    }
  }, SLOW)
})

describe('simulation (C) et (D) : l’ancienne table solo, la table mixte', () => {
  it('(C) 1 équipier honnête + 2 bots : l’équipe gagne 50 % des manches au moins', () => {
    const st = stats(C())
    expect(st.crew, label(st)).toBeGreaterThanOrEqual(0.5)
  }, SLOW)

  it('(D) 3 humains honnêtes + 2 bots : accusation-failed dans 15 % des manches au plus', () => {
    const st = stats(D())
    expect(st.failed, label(st)).toBeLessThanOrEqual(0.15)
  }, SLOW)
})

describe('simulation : invariants mécaniques', () => {
  it('toutes les configurations, carnet factice compris : parties finies, un refus au plus par manche, aucun auto-soutien, chaque question à un bot répondue, aucune question de bot dans les 10 dernières secondes, aucun humain non engagé interrogé, plafond de questions tenu', () => {
    for (const [name, games] of [...ALL, ['carnet factice', FAKE] as [string, () => Game[]]]) {
      expectMechanics(games(), name)
    }
  }, SLOW)

  it('une manche menée jusqu’au chrono ou au dernier appel a vu au moins 6 questions', () => {
    for (const games of [A.a5(), A.a8(), A.a16(), B.honest(), B.parrot(), B.silent(), C(), FAKE()]) {
      for (const r of games.flatMap((g) => g.rounds)) {
        if (r.outcome === 'timeout' || r.accusations.some((a) => a.lastCall)) {
          expect(r.questions, `${r.outcome} à ${r.t.toFixed(2)}`).toBeGreaterThanOrEqual(6)
        }
      }
    }
  }, SLOW)

  it('même graine ⇒ même journal', () => {
    const tables: Options[] = [{ bots: 5 }, { bots: 4, humans: 1, script: honest }, { bots: 2, humans: 3, script: honest }]
    for (const opts of tables) expect(playGame('rejeu', opts).state).toEqual(playGame('rejeu', opts).state)
  }, SLOW)

  it('état sérialisé à 16 sièges : 40 Ko au plus', () => {
    const biggest = Math.max(...A.a16().map((g) => g.maxJsonBytes))
    expect(biggest).toBeGreaterThan(0)
    expect(biggest).toBeLessThanOrEqual(40 * 1024)
  }, SLOW)
})

describe('simulation : la table parle (lot 5)', () => {
  const botSpeech = (games: readonly Game[], kinds: readonly string[], targetId?: string) =>
    games
      .flatMap((g) => g.rounds)
      .flatMap((r) => r.speech)
      .filter((sp) => sp.playerId.startsWith('bot-') && kinds.includes(sp.kind) && (targetId === undefined || sp.targetId === targetId))

  it('les bots se défendent quand un humain les vise, approuvent ses réponses et reviennent sur la manche d’avant', () => {
    expect(botSpeech(B.talker(), ['defend']).length).toBeGreaterThan(50)
    expect(botSpeech(B.honest(), ['ally'], 'h1').length).toBeGreaterThan(50)
    expect(botSpeech(A.a8(), REMARKS).length).toBeGreaterThan(100)
  }, SLOW)

  it('avec parcimonie : hors défenses, deux paroles libres de bots par manche en moyenne au plus', () => {
    for (const [name, games] of ALL) {
      const rounds = games().flatMap((g) => g.rounds)
      const chatter = botSpeech(games(), FREE_SPEECH.filter((kind) => kind !== 'defend'))
      expect(chatter.length / rounds.length, name).toBeLessThanOrEqual(2)
    }
  }, SLOW)

  it('effet de troupeau : la fausse accusation du bot espion ne lui gagne la manche (accusation-failed) que dans 12 % des manches au plus', () => {
    // Mesuré au lot 5 : 6 % au plus sur les tables de bots, 10 % à 3 joueurs (C), contre 8 % sans la parole.
    for (const [name, games] of [...ALL.filter(([n]) => n.startsWith('A')), ['B honnête', B.honest], ['C', C], ['D', D]] as [string, () => Game[]][]) {
      const rounds = games().flatMap((g) => g.rounds)
      const won = rounds.filter((r) => r.spyIsBot && divertedWon(r)).length / rounds.length
      expect(won, name).toBeLessThanOrEqual(0.12)
    }
  }, SLOW)
})

describe.runIf(process.env.ESPION_SIM_PRINT)('mesure exploratoire (ESPION_SIM_PRINT=1)', () => {
  it('affiche les taux de chaque configuration', () => {
    for (const [name, games] of ALL) console.warn(`${name.padEnd(13)} ${label(stats(games()))}`)
    expect(true).toBe(true)
  }, 600_000)

  it('affiche la parole libre des bots, par manche', () => {
    for (const [name, games] of ALL) {
      const rounds = games().flatMap((g) => g.rounds)
      const spoken = rounds.flatMap((r) => r.speech).filter((sp) => sp.playerId.startsWith('bot-') && FREE_SPEECH.includes(sp.kind))
      const byKind = FREE_SPEECH.map((kind) => `${kind}=${(spoken.filter((sp) => sp.kind === kind).length / rounds.length).toFixed(2)}`)
      console.warn(`${name.padEnd(13)} paroles/manche=${(spoken.length / rounds.length).toFixed(2)} ${byKind.join(' ')}`)
    }
    expect(true).toBe(true)
  }, 600_000)
})
