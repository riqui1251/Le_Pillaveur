import { createRng, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import type { BotSpeech } from '@/lib/online/bot-speech'
import { espionLocationIdOf, normalizeEspionLocationName } from './data'
import { isEspionAnswerFor, isEspionQuestionId, type EspionAnswer, type EspionQuestionId } from './data/questions'
import { ESPION_DEFAULT_DISCUSSION_MS } from './discussion'

/**
 * QUI EST L'ESPION ? (Spyfall apéro) — moteur PUR, serveur-autoritaire.
 *
 * Un lieu secret est tiré : tous les joueurs le connaissent SAUF l'espion,
 * qui ne voit rien. Discussion libre au vocal ; dès qu'un bot est à table,
 * s'y ajoute un fil de questions et réponses par boutons (ASK / ANSWER), que
 * les bots savent lire. À tout moment, un joueur peut accuser un autre :
 * ouvre une fenêtre de soutien PUBLIQUE de 15 s ; majorité atteinte →
 * révélation (après la dernière chance d'un espion humain démasqué) ; un
 * joueur parti reste accusable ; trop de refus (DECLINE) pour l'atteindre encore →
 * l'accusation s'efface. L'espion peut à tout moment deviner le lieu (un
 * seul essai) ; démasqué par la majorité, l'espion humain garde une dernière
 * chance de 20 s pour le deviner (phase `lastChance`). Timer principal écoulé
 * sans résolution → l'espion gagne par défaut (règle classique Spyfall).
 *
 * Contrairement au vote secret de l'Imposteur, l'accusation reste PUBLIQUE
 * en temps réel — cohérent avec une partie qui se joue à voix haute.
 */

export const ESPION_MIN_PLAYERS = 3
export const ESPION_MAX_PLAYERS = 16
/** Compte à rebours d'échauffement au lancement. */
export const ESPION_COUNTDOWN_MS = 5_000
/** Fenêtre de soutien à une accusation. */
export const ESPION_ACCUSATION_WINDOW_MS = 15_000
/** Dernière chance de l'espion humain démasqué : le temps de deviner le lieu avant la révélation. */
export const ESPION_LAST_CHANCE_MS = 20_000
/**
 * Plancher de lecture de la révélation : avant lui, « Manche suivante » est
 * refusé (READING_TIME). Sans lui, le premier impatient effaçait l'espion et
 * le lieu avant que la table les ait lus.
 */
export const ESPION_REVEAL_MIN_MS = 4_000
export { ESPION_DISCUSSION_MINUTES_OPTIONS, ESPION_DEFAULT_DISCUSSION_MS } from './discussion'
/** Options de manches à gagner proposées au lobby. */
export const ESPION_ROUNDS_TO_WIN_OPTIONS = [3, 5, 7] as const
export const ESPION_DEFAULT_ROUNDS_TO_WIN = 3

/** Une question sans réponse au bout de 25 s n'attend plus : quelqu'un d'autre peut interroger. */
export const ESPION_QUESTION_TIMEOUT_MS = 25_000
/** Un humain qui vient de répondre garde la main 12 s pour poser la question suivante (planificateur des bots). */
export const ESPION_HUMAN_ASK_PRIORITY_MS = 12_000
/** Questions posées par joueur et par manche. */
export const ESPION_ASKS_PER_PLAYER = 3
/** Une même question deux fois par manche au plus : assez pour comparer deux réponses, pas pour ressasser. */
export const ESPION_SAME_QUESTION_MAX = 2
/** Paroles libres (SPEAK) par joueur et par manche. */
export const ESPION_SPEECH_CAP = 2

/** Questions par manche : deux par joueur actif, entre 6 et 14. */
export function espionQuestionCap(activeCount: number): number {
  return Math.min(14, Math.max(6, 2 * activeCount))
}

/**
 * Fil PUBLIC de la manche : questions et réponses par boutons, accusations,
 * soutiens et refus, paroles libres. Les kinds partagés avec le socle
 * (suspect, defend, ally, rally, doubt) gardent son sens. `accuse` est
 * distinct de `suspect` parce que botSayKey ne lit que le kind (l'accusation
 * formelle a ses propres phrases) ; il se projette en suspect avant
 * speechSuspicion. `toldYou` / `wrong` sont les remarques sur l'espion de la
 * manche d'avant.
 */
export const ESPION_SPEECH_KINDS = [
  'question',
  'answer',
  'accuse',
  'rally',
  'doubt',
  'suspect',
  'defend',
  'ally',
  'toldYou',
  'wrong',
] as const
export type EspionSpeechKind = (typeof ESPION_SPEECH_KINDS)[number]

/**
 * Une entrée du fil. Elle ne porte que des ids de joueurs, un id de question
 * et un code de valeur, jamais un lieu : tout le fil part chez l'espion et
 * sur la TV.
 */
export type EspionSpeech = BotSpeech<EspionSpeechKind> & {
  /** Instant d'inscription : la question en attente et les échéances des bots s'en déduisent. */
  at: number
  questionId?: EspionQuestionId
  value?: EspionAnswer
  /** Inscrite sans bulle : seuls le premier soutien et le premier refus d'une accusation s'affichent. */
  quiet?: true
}

/** Paroles libres (SPEAK) ; question, answer, accuse, rally et doubt s'écrivent par leur propre action. */
export const ESPION_FREE_SPEECH_KINDS = ['suspect', 'defend', 'ally', 'toldYou', 'wrong'] as const satisfies readonly EspionSpeechKind[]
/** Remarques sur l'espion de la manche d'avant. */
export const ESPION_REMARK_KINDS = ['toldYou', 'wrong'] as const satisfies readonly EspionSpeechKind[]
/** Paroles qu'un HUMAIN peut émettre par les boutons (le reste est réservé aux bots). */
export const ESPION_HUMAN_SPEAK_KINDS = ['suspect', 'defend'] as const satisfies readonly EspionSpeechKind[]
export type EspionHumanSpeakKind = (typeof ESPION_HUMAN_SPEAK_KINDS)[number]

export type EspionRole = 'spy' | 'crew'

export type EspionPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** SECRET — 'spy' ou 'crew', jamais exposé avant le reveal (même au joueur lui-même : `isSpy` couvre ce besoin côté vue). */
  role: EspionRole
  /**
   * Absence déjà cumulée dans la manche (ms), absence en cours non comprise :
   * un aller-retour ne remet pas la grâce à zéro. Absent = 0.
   */
  awayMs?: number
}

/** Accusation en cours — PUBLIQUE par design (transparence, cohérent avec une partie parlée). */
export type EspionAccusation = {
  accuserId: string
  targetId: string
  supporters: string[]
  /** Refus (« Je ne suis pas d'accord ») ; absent des parties lancées avant ce bouton. */
  declined?: string[]
  /** Fin de la fenêtre de soutien ; en dernière chance, fin de la dernière chance. */
  endsAt: number
}

export type EspionRoundOutcome = 'spy-caught' | 'accusation-failed' | 'spy-guessed-right' | 'spy-guessed-wrong' | 'timeout'

export type EspionRoundResult = {
  round: number
  location: string
  spyId: string
  outcome: EspionRoundOutcome
  winner: EspionRole
}

export type EspionPhase = 'countdown' | 'discussion' | 'lastChance' | 'reveal' | 'finished'

export type EspionState = TimedPhaseState & {
  version: number
  phase: EspionPhase
  players: EspionPlayer[]
  /** SECRET pour l'espion — le vrai lieu de la manche courante. */
  location: string
  /** Pool complet de lieux de la partie (pour retirage sans répétition). */
  allLocations: string[]
  /** File de tirage courante (sans répétition tant qu'elle n'est pas épuisée). */
  remainingLocations: string[]
  round: number
  discussionMs: number
  roundsToWin: number
  /** PUBLIQUE — contrairement au vote secret des autres jeux. */
  activeAccusation: EspionAccusation | null
  roundWins: { spy: number; crew: number }
  /** Le reveal de la dernière manche jouée : celle qui s'achève, puis, pendant la suivante, celle d'avant. */
  lastReveal: EspionRoundResult | null
  rematchVotes: string[]
  winnerTeam: EspionRole | null
  /** SECRET serveur. */
  rngState: RngState
  /**
   * PUBLIC — le fil de la manche courante et de la précédente. Absent des
   * parties lancées avant le fil : elles se reparsent avec un fil vide.
   */
  speech?: EspionSpeech[]
  /** Entrée en révélation (epoch ms serveur), plancher de lecture ; absent des parties d'avant. */
  revealAt?: number | null
}

export type EspionAction =
  | { type: 'ACCUSE'; playerId: string; targetId: string; now: number }
  | { type: 'SUPPORT'; playerId: string; now: number }
  | { type: 'DECLINE'; playerId: string; now: number }
  | { type: 'ASK'; playerId: string; targetId: string; questionId: string; now: number }
  | { type: 'ANSWER'; playerId: string; value: string; now: number }
  | { type: 'SPEAK'; playerId: string; kind: EspionSpeechKind; targetId: string; now: number }
  /**
   * `locationId` est la voie normale. `location` (un nom) reste accepté pour
   * un client ouvert avant le passage aux identifiants.
   */
  | { type: 'GUESS_LOCATION'; playerId: string; locationId?: string; location?: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  /** `now` mesure l'absence qui s'achève (cumul de la manche) ; sans lui, rien n'est ajouté. */
  | { type: 'REJOIN'; playerId: string; now?: number }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class EspionEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'EspionEngineError'
  }
}

export type EspionInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function espionActive(state: EspionState): EspionPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

/** Un humain non parti est assis : la révélation se lit pour lui (plancher de lecture). */
export function espionHumanSeated(players: readonly Pick<EspionPlayer, 'isBot' | 'leftAt'>[]): boolean {
  return players.some((p) => !p.isBot && !p.leftAt)
}

/** Millisecondes depuis l'entrée en révélation ; un état sans horodatage est lisible tout de suite. */
export function espionRevealElapsedMs(state: Pick<EspionState, 'revealAt'>, now: number): number {
  if (state.revealAt == null) return Number.POSITIVE_INFINITY
  return now - state.revealAt
}

/** Soutiens qui font tomber une accusation : la majorité des joueurs actifs, bots compris. */
export function espionMajority(activeCount: number): number {
  return Math.floor(activeCount / 2) + 1
}

/**
 * Ce que les règles du fil lisent d'une table : l'état serveur comme la vue
 * d'un joueur, pour que le planificateur des bots, qui ne voit que des vues,
 * applique exactement les mêmes règles que le moteur.
 */
export type EspionTableRead = {
  phase: EspionPhase
  round: number
  speech?: EspionSpeech[]
  activeAccusation: EspionAccusation | null
  players: readonly { id: string; leftAt: number | null }[]
}

/** findLastIndex sans ES2023 : le moteur tourne aussi dans les vieux navigateurs des TV. */
function lastIndexOfKind(speech: readonly EspionSpeech[], kind: EspionSpeechKind): number {
  for (let i = speech.length - 1; i >= 0; i -= 1) if (speech[i].kind === kind) return i
  return -1
}

/** Le fil de la manche courante, dans l'ordre. */
export function espionRoundSpeech(table: Pick<EspionTableRead, 'round' | 'speech'>): EspionSpeech[] {
  return (table.speech ?? []).filter((sp) => sp.round === table.round)
}

export type EspionPendingQuestion = {
  askerId: string
  targetId: string
  questionId: EspionQuestionId
  askedAt: number
}

/**
 * La question qui attend sa réponse, DÉDUITE du fil : la dernière de la
 * manche, sans réponse depuis, posée il y a moins de 25 s à un joueur encore
 * là. Pas de champ à vider : l'expiration ou le départ de l'interrogé la
 * libèrent d'eux-mêmes.
 */
export function pendingEspionQuestion(table: EspionTableRead, now: number): EspionPendingQuestion | null {
  if (table.phase !== 'discussion') return null
  const speech = espionRoundSpeech(table)
  const index = lastIndexOfKind(speech, 'question')
  if (index < 0) return null
  const question = speech[index]
  if (speech.slice(index + 1).some((sp) => sp.kind === 'answer')) return null
  if (now - question.at >= ESPION_QUESTION_TIMEOUT_MS) return null
  if (!question.questionId || !question.targetId) return null
  const target = table.players.find((p) => p.id === question.targetId)
  if (!target || target.leftAt) return null
  return { askerId: question.playerId, targetId: question.targetId, questionId: question.questionId, askedAt: question.at }
}

/**
 * Pourquoi `askerId` ne peut interroger `targetId` sur aucune question, ou
 * null s'il le peut sur l'une d'elles : toutes les règles d'ASK sauf celles
 * de la question elle-même. Sous le plafond de la manche (14 au plus), il
 * reste toujours une question jamais épuisée (12 × 2 places) : le calendrier
 * des bots, qui n'importe aucune donnée, sait ainsi qui peut encore poser.
 */
export function espionAskBlock(table: EspionTableRead, askerId: string, targetId: string, now: number): string | null {
  if (table.phase !== 'discussion') return 'NOT_DISCUSSION_PHASE'
  const active = table.players.filter((p) => !p.leftAt)
  if (!active.some((p) => p.id === askerId)) return 'UNKNOWN_PLAYER'
  if (table.activeAccusation) return 'ACCUSATION_IN_PROGRESS'
  if (pendingEspionQuestion(table, now)) return 'QUESTION_PENDING'
  if (targetId === askerId) return 'CANNOT_ASK_SELF'
  if (!active.some((p) => p.id === targetId)) return 'INVALID_TARGET'
  const questions = espionRoundSpeech(table).filter((sp) => sp.kind === 'question')
  // À la Spyfall : on ne renvoie pas la question à qui vient de nous la poser.
  const last = questions[questions.length - 1]
  if (last && last.playerId === targetId && last.targetId === askerId) return 'NO_ASK_BACK'
  if (questions.filter((sp) => sp.playerId === askerId).length >= ESPION_ASKS_PER_PLAYER) return 'ASK_LIMIT'
  if (questions.length >= espionQuestionCap(active.length)) return 'QUESTION_LIMIT'
  return null
}

/**
 * Pourquoi `askerId` ne peut pas poser `questionId` à `targetId`, ou null
 * s'il le peut. Partagé par le moteur et le planificateur des bots, qui ne
 * tente ainsi jamais un coup que le moteur refuserait.
 */
export function espionAskError(
  table: EspionTableRead,
  askerId: string,
  targetId: string,
  questionId: string,
  now: number
): string | null {
  const blocked = espionAskBlock(table, askerId, targetId, now)
  if (blocked === 'ASK_LIMIT' || blocked === 'QUESTION_LIMIT') {
    // Ordre historique des refus : une question inconnue ou épuisée prime sur les quotas.
    if (!isEspionQuestionId(questionId)) return 'UNKNOWN_QUESTION'
    if (espionQuestionAsked(table, questionId) >= ESPION_SAME_QUESTION_MAX) return 'QUESTION_EXHAUSTED'
    return blocked
  }
  if (blocked) return blocked
  if (!isEspionQuestionId(questionId)) return 'UNKNOWN_QUESTION'
  if (espionQuestionAsked(table, questionId) >= ESPION_SAME_QUESTION_MAX) return 'QUESTION_EXHAUSTED'
  return null
}

/** Combien de fois `questionId` a déjà été posée dans la manche. */
export function espionQuestionAsked(table: Pick<EspionTableRead, 'round' | 'speech'>, questionId: string): number {
  return espionRoundSpeech(table).filter((sp) => sp.kind === 'question' && sp.questionId === questionId).length
}

/** Inscrit une entrée au fil de la manche courante (sans toucher à la version). */
function withSpeech(state: EspionState, entry: Omit<EspionSpeech, 'round'>): EspionState {
  const { playerId, kind, targetId, ...extra } = entry
  return { ...state, speech: [...(state.speech ?? []), { playerId, kind, targetId, round: state.round, ...extra }] }
}

/** Les entrées écrites depuis l'ouverture de l'accusation en cours. */
function accusationSpeech(state: EspionState): EspionSpeech[] {
  const speech = espionRoundSpeech(state)
  // Une accusation ouverte avant le fil n'a pas d'entrée `accuse` : tout le fil de la manche lui revient.
  const opened = lastIndexOfKind(speech, 'accuse')
  return speech.slice(opened + 1)
}

/** Un seul soutien et un seul refus font une bulle par accusation : les suivants sont inscrits en silence. */
function quietUnlessFirst(state: EspionState, kind: 'rally' | 'doubt'): { quiet?: true } {
  return accusationSpeech(state).some((sp) => sp.kind === kind) ? { quiet: true } : {}
}

/** Parole libre (SPEAK) : la seule que plafonne ESPION_SPEECH_CAP. */
export function isEspionFreeSpeech(kind: EspionSpeechKind): boolean {
  return (ESPION_FREE_SPEECH_KINDS as readonly string[]).includes(kind)
}
const isFreeSpeech = isEspionFreeSpeech

/** Paroles libres qu'il reste à `playerId` dans la manche courante. */
export function espionFreeSpeechLeft(table: Pick<EspionTableRead, 'round' | 'speech'>, playerId: string): number {
  const spoken = espionRoundSpeech(table).filter((sp) => sp.playerId === playerId && isFreeSpeech(sp.kind)).length
  return Math.max(0, ESPION_SPEECH_CAP - spoken)
}

/** Par nom : un ancien client peut envoyer le nom dans la langue de son compte, l'id réconcilie les deux langues. */
function sameLocationName(guess: string, location: string): boolean {
  if (normalizeEspionLocationName(guess) === normalizeEspionLocationName(location)) return true
  const guessId = espionLocationIdOf(guess)
  return guessId !== null && guessId === espionLocationIdOf(location)
}

/** Tire le prochain lieu sans répétition ; réamorce la file si épuisée. */
function pickLocation(
  rng: SeededRng,
  remaining: string[],
  allLocations: string[]
): { location: string; remaining: string[] } {
  const queue = remaining.length > 0 ? remaining : rng.shuffle(allLocations)
  return { location: queue[0], remaining: queue.slice(1) }
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createEspionState(
  players: EspionInitialPlayer[],
  locations: string[],
  seed: string | number,
  now: number = Date.now(),
  discussionMs: number = ESPION_DEFAULT_DISCUSSION_MS,
  roundsToWin: number = ESPION_DEFAULT_ROUNDS_TO_WIN
): EspionState {
  if (players.length < ESPION_MIN_PLAYERS) throw new EspionEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > ESPION_MAX_PLAYERS) throw new EspionEngineError('TOO_MANY_PLAYERS')
  if (locations.length === 0) throw new EspionEngineError('NO_LOCATIONS')
  if (!Number.isInteger(roundsToWin) || roundsToWin < 1) {
    throw new EspionEngineError('INVALID_ROUNDS_TO_WIN')
  }

  const rng: SeededRng = createRng(seed)
  const shuffled = rng.shuffle(locations)
  const location = shuffled[0]
  const remainingLocations = shuffled.slice(1)
  const spyIdx = rng.pickIndex(players.length)

  const withRoles: EspionPlayer[] = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    role: i === spyIdx ? 'spy' : 'crew',
  }))

  return {
    version: 1,
    // La partie s'ouvre sur un compte à rebours avant la discussion.
    ...enterPhase(0, 'countdown', ESPION_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withRoles,
    location,
    allLocations: locations,
    remainingLocations,
    round: 1,
    discussionMs,
    roundsToWin,
    activeAccusation: null,
    roundWins: { spy: 0, crew: 0 },
    lastReveal: null,
    rematchVotes: [],
    winnerTeam: null,
    rngState: rng.getState(),
    speech: [],
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

function resolveRound(
  state: EspionState,
  winner: EspionRole,
  outcome: EspionRoundOutcome,
  now: number
): EspionState {
  const roundWins = { ...state.roundWins, [winner]: state.roundWins[winner] + 1 }
  const spy = state.players.find((p) => p.role === 'spy')!
  const lastReveal: EspionRoundResult = {
    round: state.round,
    location: state.location,
    spyId: spy.id,
    outcome,
    winner,
  }
  return {
    ...state,
    roundWins,
    lastReveal,
    activeAccusation: null,
    ...enterPhase(state.phaseSeq, 'reveal', null, now),
    phase: 'reveal',
    revealAt: now,
    version: state.version + 1,
  }
}

/**
 * Résout l'accusation courante si la majorité des joueurs actifs la soutient.
 * L'espion humain démasqué, s'il est là, a encore sa dernière chance : 20 s
 * pour deviner le lieu (l'accusation reste affichée, son échéance devient
 * celle de la phase). Parti, il ne peut plus deviner ; bot, il a déjà tenté
 * sa chance à une voix du verdict (espionDesperateGuess) : la manche est jouée.
 */
function maybeResolveAccusation(state: EspionState, now: number): EspionState {
  const accusation = state.activeAccusation
  if (!accusation) return state
  if (accusation.supporters.length < espionMajority(espionActive(state).length)) return state
  const target = state.players.find((p) => p.id === accusation.targetId)
  if (!target) return state
  if (target.role !== 'spy') return resolveRound(state, 'spy', 'accusation-failed', now)
  if (target.leftAt || target.isBot) return resolveRound(state, 'crew', 'spy-caught', now)
  return {
    ...state,
    activeAccusation: { ...accusation, endsAt: now + ESPION_LAST_CHANCE_MS },
    ...enterPhase(state.phaseSeq, 'lastChance', ESPION_LAST_CHANCE_MS, now),
    phase: 'lastChance',
    version: state.version + 1,
  }
}

/**
 * Rejet anticipé : quand les soutiens et les indécis (actifs hors cible qui
 * n'ont ni soutenu ni refusé) ne peuvent plus faire la majorité,
 * l'accusation s'efface sans pénalité, sans attendre la fin de la fenêtre.
 * Seul un refus la déclenche : sans bouton de refus (table 100 % humaine),
 * la règle reste inerte.
 */
function rejectIfHopeless(state: EspionState): EspionState {
  const accusation = state.activeAccusation
  if (!accusation) return state
  const active = espionActive(state)
  const declined = accusation.declined ?? []
  const undecided = active.filter(
    (p) => p.id !== accusation.targetId && !accusation.supporters.includes(p.id) && !declined.includes(p.id)
  ).length
  if (accusation.supporters.length + undecided >= espionMajority(active.length)) return state
  return { ...state, activeAccusation: null }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceEspion(state: EspionState, action: EspionAction): EspionState {
  switch (action.type) {
    case 'ACCUSE': {
      if (state.phase !== 'discussion') throw new EspionEngineError('NOT_DISCUSSION_PHASE')
      if (state.activeAccusation) throw new EspionEngineError('ACCUSATION_IN_PROGRESS')
      const accuser = state.players.find((p) => p.id === action.playerId)
      if (!accuser || accuser.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      // Un parti reste accusable : l'espion qui sentait venir l'accusation
      // quittait la table et gagnait la manche au chrono.
      const target = state.players.find((p) => p.id === action.targetId)
      if (!target) throw new EspionEngineError('INVALID_TARGET')
      if (target.id === accuser.id) throw new EspionEngineError('CANNOT_ACCUSE_SELF')
      const activeAccusation: EspionAccusation = {
        accuserId: accuser.id,
        targetId: target.id,
        supporters: [accuser.id],
        declined: [],
        endsAt: action.now + ESPION_ACCUSATION_WINDOW_MS,
      }
      const opened = withSpeech(
        { ...state, activeAccusation, version: state.version + 1 },
        { playerId: accuser.id, kind: 'accuse', targetId: target.id, at: action.now }
      )
      return maybeResolveAccusation(opened, action.now)
    }

    case 'SUPPORT': {
      if (state.phase !== 'discussion' || !state.activeAccusation) {
        throw new EspionEngineError('NO_ACTIVE_ACCUSATION')
      }
      if (action.now >= state.activeAccusation.endsAt) throw new EspionEngineError('ACCUSATION_EXPIRED')
      const supporter = state.players.find((p) => p.id === action.playerId)
      if (!supporter || supporter.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      if (state.activeAccusation.targetId === supporter.id) throw new EspionEngineError('CANNOT_SUPPORT_SELF')
      if (state.activeAccusation.supporters.includes(supporter.id)) {
        throw new EspionEngineError('ALREADY_SUPPORTED')
      }
      // Une seule décision par joueur : un refus ne se change pas en soutien.
      if ((state.activeAccusation.declined ?? []).includes(supporter.id)) {
        throw new EspionEngineError('ALREADY_DECLINED')
      }
      const activeAccusation: EspionAccusation = {
        ...state.activeAccusation,
        supporters: [...state.activeAccusation.supporters, supporter.id],
      }
      const rallied = withSpeech(
        { ...state, activeAccusation, version: state.version + 1 },
        {
          playerId: supporter.id,
          kind: 'rally',
          targetId: activeAccusation.targetId,
          at: action.now,
          ...quietUnlessFirst(state, 'rally'),
        }
      )
      return maybeResolveAccusation(rallied, action.now)
    }

    case 'DECLINE': {
      if (state.phase !== 'discussion' || !state.activeAccusation) {
        throw new EspionEngineError('NO_ACTIVE_ACCUSATION')
      }
      const accusation = state.activeAccusation
      if (action.now >= accusation.endsAt) throw new EspionEngineError('ACCUSATION_EXPIRED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      if (player.id === accusation.targetId || player.id === accusation.accuserId) {
        throw new EspionEngineError('CANNOT_DECLINE')
      }
      if (accusation.supporters.includes(player.id)) throw new EspionEngineError('ALREADY_SUPPORTED')
      const declined = accusation.declined ?? []
      if (declined.includes(player.id)) throw new EspionEngineError('ALREADY_DECLINED')
      const doubted = withSpeech(
        {
          ...state,
          activeAccusation: { ...accusation, declined: [...declined, player.id] },
          version: state.version + 1,
        },
        {
          playerId: player.id,
          kind: 'doubt',
          targetId: accusation.targetId,
          at: action.now,
          ...quietUnlessFirst(state, 'doubt'),
        }
      )
      return rejectIfHopeless(doubted)
    }

    case 'ASK': {
      const error = espionAskError(state, action.playerId, action.targetId, action.questionId, action.now)
      if (error) throw new EspionEngineError(error)
      return withSpeech(
        { ...state, version: state.version + 1 },
        {
          playerId: action.playerId,
          kind: 'question',
          targetId: action.targetId,
          at: action.now,
          questionId: action.questionId as EspionQuestionId,
        }
      )
    }

    case 'ANSWER': {
      // Une réponse reste permise pendant une accusation : la question était posée avant.
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      const pending = pendingEspionQuestion(state, action.now)
      if (!pending || pending.targetId !== player.id) throw new EspionEngineError('NO_PENDING_QUESTION')
      if (!isEspionAnswerFor(pending.questionId, action.value)) throw new EspionEngineError('INVALID_ANSWER')
      return withSpeech(
        { ...state, version: state.version + 1 },
        {
          playerId: player.id,
          kind: 'answer',
          targetId: pending.askerId,
          at: action.now,
          questionId: pending.questionId,
          value: action.value,
        }
      )
    }

    case 'SPEAK': {
      if (state.phase !== 'discussion') throw new EspionEngineError('NOT_DISCUSSION_PHASE')
      if (!isFreeSpeech(action.kind)) throw new EspionEngineError('INVALID_KIND')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      const target = state.players.find((p) => p.id === action.targetId)
      if (!target || target.leftAt || target.id === actor.id) throw new EspionEngineError('INVALID_TARGET')
      const spoken = espionRoundSpeech(state).filter((sp) => sp.playerId === actor.id && isFreeSpeech(sp.kind))
      if (spoken.length >= ESPION_SPEECH_CAP) throw new EspionEngineError('ALREADY_SPOKE')
      return withSpeech(
        { ...state, version: state.version + 1 },
        { playerId: actor.id, kind: action.kind, targetId: target.id, at: action.now }
      )
    }

    case 'GUESS_LOCATION': {
      if (state.phase !== 'discussion' && state.phase !== 'lastChance') {
        throw new EspionEngineError('NOT_DISCUSSION_PHASE')
      }
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      if (player.role !== 'spy') throw new EspionEngineError('NOT_SPY')
      let correct: boolean
      if (typeof action.locationId === 'string') {
        correct = espionLocationIdOf(state.location) === action.locationId
      } else if (typeof action.location === 'string') {
        correct = sameLocationName(action.location, state.location)
      } else {
        throw new EspionEngineError('INVALID_GUESS')
      }
      return resolveRound(state, correct ? 'spy' : 'crew', correct ? 'spy-guessed-right' : 'spy-guessed-wrong', action.now)
    }

    case 'ADVANCE': {
      // Une fenêtre d'accusation active et expirée se résout AVANT le timer principal.
      if (
        state.phase === 'discussion' &&
        state.activeAccusation &&
        action.now >= state.activeAccusation.endsAt
      ) {
        return { ...state, activeAccusation: null, version: state.version + 1 }
      }
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new EspionEngineError(check.error)
      if (state.phase === 'countdown') {
        return {
          ...state,
          ...enterPhase(state.phaseSeq, 'discussion', state.discussionMs, action.now),
          phase: 'discussion',
          version: state.version + 1,
        }
      }
      if (state.phase === 'discussion') {
        // Timer principal écoulé sans résolution → l'espion gagne par défaut.
        return resolveRound(state, 'spy', 'timeout', action.now)
      }
      // Dernière chance écoulée sans devinette : l'espion démasqué perd la manche.
      if (state.phase === 'lastChance') return resolveRound(state, 'crew', 'spy-caught', action.now)
      throw new EspionEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new EspionEngineError('NOT_REVEAL')
      const asker = state.players.find((p) => p.id === action.playerId)
      if (!asker) throw new EspionEngineError('UNKNOWN_PLAYER')
      // Le bot qui mène la révélation lit aussi pour la table : sans humain
      // assis, personne à faire attendre, une table de bots ne se fige pas.
      const mustRead = !asker.isBot || espionHumanSeated(state.players)
      if (mustRead && espionRevealElapsedMs(state, action.now) < ESPION_REVEAL_MIN_MS) {
        throw new EspionEngineError('READING_TIME')
      }
      if (state.roundWins.spy >= state.roundsToWin || state.roundWins.crew >= state.roundsToWin) {
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          revealAt: null,
          winnerTeam: state.roundWins.spy > state.roundWins.crew ? 'spy' : 'crew',
          version: state.version + 1,
        }
      }
      const rng = rngFromState(state.rngState)
      const { location, remaining } = pickLocation(rng, state.remainingLocations, state.allLocations)
      // Un espion parti ne pourrait ni être accusé ni deviner : la manche lui
      // reviendrait au chrono. Repli sur toute la table si plus personne n'est là.
      const active = espionActive(state)
      const pool = active.length > 0 ? active : state.players
      const spyId = pool[rng.pickIndex(pool.length)].id
      // Nouvelle manche, nouveau compte d'absence (celle d'un parti court toujours via leftAt).
      const players = state.players.map(({ awayMs: _away, ...p }) => {
        void _away
        return { ...p, role: (p.id === spyId ? 'spy' : 'crew') as EspionRole }
      })
      return {
        ...state,
        players,
        location,
        remainingLocations: remaining,
        round: state.round + 1,
        // On garde la manche qui s'achève (remarques sur son espion), pas celles d'avant.
        speech: (state.speech ?? []).filter((sp) => sp.round === state.round),
        // Son reveal aussi : l'espion d'avant est public depuis, et « je vous
        // l'avais dit » le vise. Les écrans ne le lisent qu'en phase reveal.
        lastReveal: state.lastReveal,
        ...enterPhase(state.phaseSeq, 'discussion', state.discussionMs, action.now),
        phase: 'discussion',
        revealAt: null,
        rngState: rng.getState(),
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new EspionEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new EspionEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      // L'absence déjà cumulée dans la manche avance le départ : un
      // aller-retour ne relance pas les 3 min de grâce avant le bot.
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at - (p.awayMs ?? 0) } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) {
        throw new EspionEngineError('CANNOT_REJOIN')
      }
      const leftAt = player.leftAt
      // leftAt porte déjà l'absence cumulée avant ce départ : le cumul vaut now − leftAt.
      const awayMs = action.now === undefined ? player.awayMs : Math.max(0, action.now - leftAt)
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null, ...(awayMs ? { awayMs } : {}) } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new EspionEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      return {
        ...state,
        players: state.players.map((p) =>
          ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    default: {
      const exhaustive: never = action
      throw new EspionEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * Jamais d'acteur unique → null : la discussion et la dernière chance ont
 * leur échéance, et même quand une question attend sa réponse, l'interrogé
 * ne devient ni le joueur au tour ni un candidat à l'AFK. La révélation, que
 * n'importe qui referme, non plus : le premier présent, s'il est bot, la mène
 * (espionRevealLeaderId), sans que personne y soit expulsable.
 */
export function currentEspionActorId(state: EspionState): string | null {
  void state
  return null
}

/** Le premier joueur encore là mène le « continuer » de la révélation. */
export function espionRevealLeaderId(table: Pick<EspionTableRead, 'players'>): string | null {
  return table.players.find((p) => !p.leftAt)?.id ?? null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type EspionPlayerView = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** null tant que la manche n'est pas révélée — personne ne voit AUCUN rôle avant le reveal de chaque manche. */
  role: EspionRole | null
}

export type EspionClientView = Omit<
  EspionState,
  'rngState' | 'players' | 'location' | 'allLocations' | 'remainingLocations'
> & {
  players: EspionPlayerView[]
  phaseKey: string
  /** true si le viewer est l'espion de la manche courante. */
  isSpy: boolean
  /** Le vrai lieu — null pour l'espion (jusqu'au reveal), toujours visible pour les autres. */
  location: string | null
  /** Révélation : instant (epoch ms serveur) où « Manche suivante » est accepté. */
  continueAt: number | null
}

function continueAtOf(state: EspionState): number | null {
  return state.phase === 'reveal' && state.revealAt != null ? state.revealAt + ESPION_REVEAL_MIN_MS : null
}

/**
 * Vue PAR JOUEUR : l'espion ne voit jamais le lieu avant le reveal ; les
 * autres le voient toujours. Aucun rôle (le sien inclus) n'est exposé avant
 * le reveal de la manche, où lieu et rôles deviennent publics — `isSpy` couvre
 * le besoin de savoir « suis-je l'espion » sans exposer `role` en clair.
 */
export function toEspionClientView(state: EspionState, viewerId: string): EspionClientView {
  const { rngState: _rng, players, location, allLocations, remainingLocations, ...rest } = state
  void _rng
  void allLocations
  void remainingLocations
  // Le lieu + les rôles deviennent publics dès la révélation du ROUND (pas
  // seulement en fin de match) — cohérent avec `lastReveal` déjà peuplé.
  const revealed = state.phase === 'reveal' || state.phase === 'finished'
  const viewer = players.find((p) => p.id === viewerId)
  const viewerIsSpy = viewer?.role === 'spy'
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isSpy: Boolean(viewerIsSpy),
    location: revealed || !viewerIsSpy ? location : null,
    continueAt: continueAtOf(state),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      role: revealed ? p.role : null,
    })),
  }
}

/**
 * Vue SPECTATEUR NEUTRE (TV) : jamais le lieu ni les rôles avant le reveal —
 * contrairement à un joueur non-espion, le spectateur n'a AUCUN droit de
 * savoir le lieu en cours de partie (dédiée, ne délègue pas à la vue joueur).
 */
export function toEspionSpectatorView(state: EspionState): EspionClientView {
  const { rngState: _rng, players, location, allLocations, remainingLocations, ...rest } = state
  void _rng
  void allLocations
  void remainingLocations
  const revealed = state.phase === 'reveal' || state.phase === 'finished'
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isSpy: false,
    location: revealed ? location : null,
    continueAt: continueAtOf(state),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      role: revealed ? p.role : null,
    })),
  }
}
