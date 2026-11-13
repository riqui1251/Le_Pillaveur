import { createRng, randomSeed, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { VDN_QUESTIONS } from './data/questions'
import { VDN_TEXTS as TEXTS_FR } from './data/fr'
import { VDN_TEXTS as TEXTS_EN } from './data/en'
import { VDN_TEXTS as TEXTS_ES } from './data/es'
import { VDN_TEXTS as TEXTS_IT } from './data/it'
import type { VdnQuestionMeta, VdnQuestionText, VdnTheme } from './data/types'
import {
  VDN_MAX_ABS_ESTIMATE,
  VDN_MIN_PLAYERS,
  createGame,
  hasAnswered,
  nextQuestion,
  ranking,
  reveal,
  submitEstimate,
  toVdnPublicView,
  type VdnPoolEntry,
  type VdnQuestionCount,
  type VdnState,
  type VdnTally,
} from './engine'
import {
  VDN_ANSWER_MS,
  VDN_ONLINE_MAX_PLAYERS,
  VDN_REVEAL_MIN_MS,
  VDN_REVEAL_MS,
  vdnActivePlayers,
  vdnPendingBot,
  vdnRevealLeader,
  type VdnClientView,
  type VdnOnlinePlayer,
  type VdnOnlinePlayerView,
} from './online-view'
import { vdnShownUnit } from './unit'

/**
 * Adaptateur serveur d'À Vue de Nez EN LIGNE : l'enveloppe autour du moteur
 * partagé avec le jeu local (version, horloge de phase, table, votes
 * « Rejouer », graine), la banque de la langue de la salle, les actions, le
 * cerveau des bots et les vues. SEUL module en ligne qui lit la banque : la
 * vue n'emporte que la question en cours, sa réponse et sa source n'y entrent
 * qu'à la révélation.
 *
 * Déroulé : `answering` (60 s, fin anticipée quand toute la table présente a
 * répondu) → `reveal` (30 s, ou « Question suivante » du meneur après 6 s de
 * lecture) → question suivante… → `finished`. Les absents d'une question sont
 * exclus de son calcul.
 */

export const VDN_ONLINE_LANGS = ['fr', 'en', 'es', 'it'] as const
export type VdnOnlineLang = (typeof VDN_ONLINE_LANGS)[number]

type TextBank = Readonly<Record<string, VdnQuestionText | undefined>>

const BANKS: Record<VdnOnlineLang, TextBank> = { fr: TEXTS_FR, en: TEXTS_EN, es: TEXTS_ES, it: TEXTS_IT }

export function vdnOnlineLangOf(lang: string | null | undefined): VdnOnlineLang {
  return (VDN_ONLINE_LANGS as readonly string[]).includes(lang ?? '') ? (lang as VdnOnlineLang) : 'fr'
}

/**
 * Réponses qui sont des ANNÉES (`year` de la méta, commune aux quatre
 * langues) : le moteur y juge « dans le mille » à un an près. Le bruit d'un
 * bot y porte sur l'ancienneté, pas sur le millésime (1977 × e^0,45 donnerait
 * l'an 3089 pour le premier Star Wars) — sauf avant notre ère (`bce`), où le
 * nombre se bruite tel quel.
 */
const YEAR_IDS: ReadonlySet<string> = new Set(
  VDN_QUESTIONS.filter((q) => (q as VdnQuestionMeta).year === true).map((q) => q.id)
)

export function isVdnYearQuestion(id: string): boolean {
  return YEAR_IDS.has(id)
}

/** Une question de la partie telle que le SERVEUR la garde : réponse et source comprises. */
export type VdnOnlineQuestion = {
  id: string
  theme: VdnTheme
  min: number
  answer: number
  text: string
  unit: string
  source: string
  /** La réponse est une année (cf. YEAR_IDS). */
  year: boolean
  /** …avant notre ère. Absent d'un état écrit avant ce champ : faux, comme alors. */
  bce?: boolean
}

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/** Banque d'une langue : une question sans énoncé ni source sort de la pioche plutôt que de s'afficher à moitié. */
export function vdnOnlineBank(lang: VdnOnlineLang): VdnOnlineQuestion[] {
  const texts = BANKS[lang]
  const questions: VdnOnlineQuestion[] = []
  for (const entry of VDN_QUESTIONS) {
    const meta: VdnQuestionMeta = entry
    const text = texts[meta.id]
    if (!text || !filled(text.text) || !filled(text.source) || typeof text.unit !== 'string') continue
    if (!Number.isFinite(meta.answer)) continue
    questions.push({
      id: meta.id,
      theme: meta.theme,
      min: typeof meta.min === 'number' && Number.isFinite(meta.min) ? meta.min : 0,
      answer: meta.answer,
      text: text.text.trim(),
      unit: text.unit.trim(),
      source: text.source.trim(),
      year: YEAR_IDS.has(meta.id),
      bce: meta.bce === true,
    })
  }
  return questions
}

// ─── État ────────────────────────────────────────────────────────────────────

export type VdnOnlineState = {
  /** +1 à chaque écriture acceptée. */
  version: number
  /** Recopié de `game.phase` après chaque appel du moteur. */
  phase: VdnState['phase']
  phaseSeq: number
  phaseEndsAt: number | null
  /** Entrée en révélation : base du plancher de lecture de « Question suivante ». */
  revealAt: number | null
  /** Humain = userId brut, bot = `bot-N` (match-results les distingue ainsi). */
  players: VdnOnlinePlayer[]
  rematchVotes: string[]
  /** Tirages du serveur (bruit des bots) : jamais dans une vue. */
  rngState: number
  lang: VdnOnlineLang
  /** SECRET : les questions de la partie dans l'ordre du moteur, réponses et sources comprises. */
  questions: VdnOnlineQuestion[]
  game: VdnState
}

export interface VdnRoomMember {
  userId: string
  user: { displayName: string }
}

export type VdnBuildOptions = {
  /** Langue de la salle (`settings.lang`) ; inconnue → français. */
  lang?: string | null
  botsCount?: number
  questionCount?: VdnQuestionCount
  themes?: readonly VdnTheme[]
  seed?: string | number
  now?: number
}

/**
 * Les membres, puis les bots choisis par l'hôte, puis de quoi atteindre le
 * minimum (filet d'un « Rejouer » après des départs). Personas sans doublon,
 * reproductibles à graine égale.
 */
export function buildVdnOnlineState(members: readonly VdnRoomMember[], options: VdnBuildOptions = {}): VdnOnlineState {
  const players: VdnOnlinePlayer[] = members.map((m) => ({
    id: m.userId,
    name: m.user.displayName,
    isBot: false,
    leftAt: null,
  }))
  const requested = Number.isFinite(options.botsCount) ? Math.floor(options.botsCount ?? 0) : 0
  const wanted = Math.max(0, Math.min(requested, VDN_ONLINE_MAX_PLAYERS - players.length))
  const totalBots = Math.max(wanted, VDN_MIN_PLAYERS - players.length)
  const seed = options.seed ?? randomSeed()
  pickBotPersonas(totalBots, createRng(`${seed}#bots`).next).forEach((persona, i) => {
    players.push({ id: `bot-${i + 1}`, name: botDisplayName(persona), isBot: true, leftAt: null })
  })

  const lang = vdnOnlineLangOf(options.lang)
  const bank = vdnOnlineBank(lang)
  const pool: VdnPoolEntry[] = bank.map((q) => ({ id: q.id, theme: q.theme, min: q.min }))
  const start = (themes: readonly VdnTheme[]) =>
    createGame({
      playerIds: players.map((p) => p.id),
      pool,
      seed,
      questionCount: options.questionCount,
      themes,
      allowCorrection: true,
    })
  let outcome = start(options.themes ?? [])
  // Des thèmes vides dans cette langue : toute la banque plutôt qu'une salle bloquée.
  if (!outcome.ok && outcome.error === 'NO_QUESTIONS') outcome = start([])
  if (!outcome.ok) throw new Error(`vue-de-nez : partie impossible (${outcome.error})`)
  const game = outcome.state
  const byId = new Map(bank.map((q) => [q.id, q]))
  const questions = game.questionIds
    .map((id) => byId.get(id))
    .filter((q): q is VdnOnlineQuestion => q !== undefined)

  return {
    version: 1,
    ...enterPhase(0, 'answering', VDN_ANSWER_MS, options.now ?? Date.now()),
    phase: 'answering',
    revealAt: null,
    players,
    rematchVotes: [],
    rngState: createRng(`${seed}#online`).getState(),
    lang,
    questions,
    game,
  }
}

export function serializeVdnOnlineState(state: VdnOnlineState): string {
  return JSON.stringify(state)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Ne lève jamais : null si absent ou illisible ; complète les champs qu'un ancien état n'aurait pas. */
export function parseVdnOnlineState(json: string | null): VdnOnlineState | null {
  if (!json) return null
  try {
    const raw: unknown = JSON.parse(json)
    if (!isRecord(raw) || typeof raw.version !== 'number' || typeof raw.phase !== 'string') return null
    if (typeof raw.phaseSeq !== 'number' || !Array.isArray(raw.players) || !Array.isArray(raw.questions)) return null
    const game = raw.game
    if (!isRecord(game) || !Array.isArray(game.playerIds) || !Array.isArray(game.questionIds) || !isRecord(game.estimates)) {
      return null
    }
    const state = raw as unknown as VdnOnlineState
    return {
      ...state,
      phaseEndsAt: typeof raw.phaseEndsAt === 'number' ? raw.phaseEndsAt : null,
      revealAt: typeof raw.revealAt === 'number' ? raw.revealAt : null,
      rematchVotes: Array.isArray(raw.rematchVotes) ? (raw.rematchVotes as string[]) : [],
    }
  } catch {
    return null
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type VdnRoomActionInput =
  | { type: 'estimate'; value: number }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type VdnRoomActionResult = { ok: true; state: VdnOnlineState } | { ok: false; error: string }

const done = (state: VdnOnlineState): VdnRoomActionResult => ({ ok: true, state })
const refuse = (error: string): VdnRoomActionResult => ({ ok: false, error })

/** Une écriture acceptée vaut UNE version, même quand elle enchaîne estimation et révélation. */
const bump = (state: VdnOnlineState): VdnOnlineState => ({ ...state, version: state.version + 1 })

function currentQuestion(state: VdnOnlineState): VdnOnlineQuestion | null {
  return state.questions[state.game.index] ?? null
}

/** La table avec, pour chacun, « a répondu à la question en cours ». */
export function vdnPlayerRows(state: VdnOnlineState): (VdnOnlinePlayer & { hasAnswered: boolean })[] {
  return state.players.map((p) => ({ ...p, hasAnswered: hasAnswered(state.game, p.id) }))
}

/** Révélation, échéance ou pas : les joueurs sans estimation sont exclus du calcul. */
function revealNow(state: VdnOnlineState, now: number): VdnRoomActionResult {
  const question = currentQuestion(state)
  if (!question) return refuse('INVALID_STATE')
  const outcome = reveal(state.game, { id: question.id, answer: question.answer, year: question.year }, { force: true })
  if (!outcome.ok) return refuse(outcome.error)
  return done({
    ...state,
    game: outcome.state,
    ...enterPhase(state.phaseSeq, 'reveal', VDN_REVEAL_MS, now),
    phase: 'reveal',
    revealAt: now,
  })
}

function goNext(state: VdnOnlineState, now: number): VdnRoomActionResult {
  const outcome = nextQuestion(state.game)
  if (!outcome.ok) return refuse(outcome.error)
  const game = outcome.state
  if (game.phase === 'finished') {
    return done({ ...state, game, ...enterPhase(state.phaseSeq, 'finished', null, now), phase: 'finished', revealAt: null })
  }
  return done({
    ...state,
    game,
    ...enterPhase(state.phaseSeq, 'answering', VDN_ANSWER_MS, now),
    phase: 'answering',
    revealAt: null,
  })
}

/** Toute la table présente a répondu : on n'attend pas l'échéance. */
function settleAnswers(state: VdnOnlineState, now: number): VdnRoomActionResult {
  if (state.phase !== 'answering') return done(state)
  const active = vdnActivePlayers(state.players)
  if (active.length === 0 || !active.every((p) => hasAnswered(state.game, p.id))) return done(state)
  return revealNow(state, now)
}

function step(state: VdnOnlineState, userId: string, input: VdnRoomActionInput, now: number): VdnRoomActionResult {
  switch (input.type) {
    case 'estimate': {
      if (state.phase !== 'answering') return refuse('WRONG_PHASE')
      const player = state.players.find((p) => p.id === userId)
      if (!player || player.isBot || player.leftAt) return refuse('UNKNOWN_PLAYER')
      const outcome = submitEstimate(state.game, userId, input.value)
      if (!outcome.ok) return refuse(outcome.error)
      return settleAnswers({ ...state, game: outcome.state }, now)
    }
    case 'advance': {
      // Tous les arbitres tirent à l'échéance : le premier passe, les autres prennent PHASE_CHANGED.
      const check = checkAdvance(state, input.phaseKey, now)
      if (!check.ok) return refuse(check.error)
      if (state.phase === 'answering') return revealNow(state, now)
      if (state.phase === 'reveal') return goNext(state, now)
      return refuse('NOTHING_TO_ADVANCE')
    }
    case 'continue': {
      if (state.phase !== 'reveal') return refuse('WRONG_PHASE')
      if (!state.players.some((p) => p.id === userId)) return refuse('UNKNOWN_PLAYER')
      if (vdnRevealLeader(state.players)?.id !== userId) return refuse('NOT_YOUR_TURN')
      if (now < (state.revealAt ?? 0) + VDN_REVEAL_MIN_MS) return refuse('READING_TIME')
      return goNext(state, now)
    }
    case 'bot':
      return botStep(state, now)
    case 'replace-left': {
      if (state.phase === 'finished') return refuse('NOTHING_TO_REPLACE')
      const expired = state.players.filter((p) => !p.isBot && p.leftAt !== null && now - p.leftAt >= input.graceMs)
      if (expired.length === 0) return refuse('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      const players = state.players.map((p) => (ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p))
      return settleAnswers({ ...state, players }, now)
    }
  }
}

/**
 * `userId` vaut '__service__' pour `bot` et `advance` tirés par le serveur :
 * ces deux chemins ne dépendent pas de l'acteur.
 */
export function applyVdnRoomAction(
  state: VdnOnlineState,
  userId: string,
  input: VdnRoomActionInput,
  now: number = Date.now()
): VdnRoomActionResult {
  const result = step(state, userId, input, now)
  return result.ok ? done(bump(result.state)) : result
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/** Écart type du bruit log-normal d'un bot : ±57 % à un écart type, l'ordre de grandeur d'une table. */
export const VDN_BOT_SIGMA = 0.45
/** Année de référence de l'ancienneté d'une date (bruit des questions-années). */
export const VDN_BOT_REFERENCE_YEAR = 2025

/** Loi normale centrée réduite (Box-Muller) tirée du RNG de la partie. */
function gaussian(rng: SeededRng): number {
  const u1 = 1 - rng.next()
  const u2 = rng.next()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** Chiffres après la virgule de la réponse attendue (9,81 → 2) ; 0 pour un entier. */
function decimalsOf(answer: number): number {
  const text = String(answer)
  const dot = text.indexOf('.')
  return dot === -1 || /e/i.test(text) ? 0 : Math.min(6, text.length - dot - 1)
}

/** Deux chiffres significatifs, comme on lance un ordre de grandeur, jamais plus fin que la réponse attendue. */
function roundLikeAnswer(value: number, answer: number): number {
  if (!Number.isFinite(value) || value === 0) return 0
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1)
  const coarse = Math.round(value / step) * step
  const scale = 10 ** decimalsOf(answer)
  return Number((Math.round(coarse * scale) / scale).toPrecision(12))
}

function clampEstimate(value: number, min: number): number {
  const clamped = Math.min(VDN_MAX_ABS_ESTIMATE, Math.max(min, value))
  return clamped === 0 ? 0 : clamped
}

/**
 * Estimation d'un bot : la réponse × e^N(0 ; 0,45), arrondie comme on lance
 * un chiffre (deux chiffres significatifs, une année de notre ère à l'unité).
 * Le seul endroit où un joueur lit la réponse avant la révélation : le bruit
 * le rend crédible, ni devin ni absurde. Avant notre ère, l'ancienneté
 * « 2025 − réponse » n'a pas de sens (Alésia, 52, tomberait vers l'an 760) :
 * le nombre se bruite comme les autres.
 */
export function vdnBotEstimate(
  question: Pick<VdnOnlineQuestion, 'answer' | 'min' | 'year' | 'bce'>,
  rng: SeededRng
): number {
  const factor = Math.exp(VDN_BOT_SIGMA * gaussian(rng))
  if (question.year && !question.bce) {
    const age = Math.max(1, VDN_BOT_REFERENCE_YEAR - question.answer)
    let year = VDN_BOT_REFERENCE_YEAR - age * factor
    // Une date très ancienne (Pompéi, 79) tomberait sous le minimum, donc à « l'an 0 » une fois
    // sur deux : l'écart part alors de l'autre côté de la réponse.
    if (year < question.min) year = VDN_BOT_REFERENCE_YEAR - age / factor
    return clampEstimate(Math.round(year), question.min)
  }
  return clampEstimate(roundLikeAnswer(question.answer * factor, question.answer), question.min)
}

/** Un tick = UN bot estime (le premier de la table qui n'a pas répondu) ; rien à faire → NOT_BOT_TURN. */
function botStep(state: VdnOnlineState, now: number): VdnRoomActionResult {
  const bot = vdnPendingBot(state.phase, vdnPlayerRows(state))
  const question = currentQuestion(state)
  if (!bot || !question) return refuse('NOT_BOT_TURN')
  const rng = rngFromState(state.rngState)
  const outcome = submitEstimate(state.game, bot.id, vdnBotEstimate(question, rng))
  if (!outcome.ok) return refuse(outcome.error)
  return settleAnswers({ ...state, game: outcome.state, rngState: rng.getState() }, now)
}

// ─── Départs, retours, remplacements ─────────────────────────────────────────

/** Quitter en partie → « parti » ; s'il était le dernier attendu, la révélation tombe. Null = rien à faire. */
export function markVdnPlayerLeft(state: VdnOnlineState, playerId: string, at: number): VdnOnlineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  const left: VdnOnlineState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, leftAt: at } : p)),
  }
  const settled = settleAnswers(left, at)
  return bump(settled.ok ? settled.state : left)
}

export function rejoinVdnPlayer(state: VdnOnlineState, playerId: string): VdnOnlineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return bump({ ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, leftAt: null } : p)) })
}

/** Remplacement direct par un bot (déserteur : il garde son id, et sa défaite). */
export function convertVdnPlayerToBot(state: VdnOnlineState, playerId: string): VdnOnlineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return bump({
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
  })
}

// ─── Vues ────────────────────────────────────────────────────────────────────

const ZERO_TALLY: VdnTally = { closest: 0, bullseye: 0, farthest: 0 }

/**
 * Vue d'un téléphone (`viewerId`) ou de la TV (''). Jamais : la graine, les
 * questions suivantes, les estimations des autres avant la révélation, la
 * réponse ou la source d'une question encore ouverte.
 */
export function toVdnClientView(state: VdnOnlineState, viewerId: string): VdnClientView {
  const { game } = state
  const pub = toVdnPublicView(game, viewerId === '' ? null : viewerId)
  const finished = state.phase === 'finished'
  const question = finished ? null : currentQuestion(state)
  const shown = state.phase === 'reveal' && question && game.reveal?.questionId === question.id ? game.reveal : null
  const players: VdnOnlinePlayerView[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    leftAt: p.leftAt,
    hasAnswered: !finished && hasAnswered(game, p.id),
    score: game.scores[p.id] ?? 0,
    tally: game.tallies[p.id] ?? ZERO_TALLY,
  }))
  return {
    version: state.version,
    phase: state.phase,
    phaseSeq: state.phaseSeq,
    phaseEndsAt: state.phaseEndsAt,
    phaseKey: phaseKey(state),
    continueAt: state.phase === 'reveal' && state.revealAt !== null ? state.revealAt + VDN_REVEAL_MIN_MS : null,
    players,
    rematchVotes: state.rematchVotes,
    questionNumber: pub.questionNumber,
    questionCount: pub.questionCount,
    question: question
      ? {
          id: question.id,
          theme: question.theme,
          text: question.text,
          unit: vdnShownUnit(question.unit, question),
          min: question.min,
        }
      : null,
    myEstimate: finished ? null : pub.myEstimate,
    reveal:
      shown && question
        ? { questionId: question.id, answer: shown.answer, source: question.source, results: shown.results }
        : null,
    ranking: ranking(game),
  }
}

export function vdnClientViewJson(state: VdnOnlineState, viewerId: string): string {
  return JSON.stringify(toVdnClientView(state, viewerId))
}

export function vdnSpectatorViewJson(state: VdnOnlineState): string {
  return JSON.stringify(toVdnClientView(state, ''))
}
