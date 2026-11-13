import { createRng, type RngState } from '@/lib/petit-buveur/rng'
import { VDN_THEMES, type VdnQuestionMeta, type VdnTheme } from './data/types'

/**
 * Moteur pur d'À Vue de Nez, partagé par la partie locale (un téléphone qui
 * passe de main en main) et, à venir, par le serveur de la version en ligne.
 *
 * Une question à réponse chiffrée, chacun estime en secret. À la révélation,
 * écart = |estimation − réponse| : le plus petit écart est « le plus proche »,
 * « dans le mille » s'il ne dépasse pas 2 % de la réponse (un an au plus pour
 * une année, écart nul quand la réponse vaut 0) ; le plus grand écart est
 * « le plus loin ». Ex æquo : tous concernés. Tous au même écart : personne.
 * Classement : +3, +6, −1.
 *
 * Le moteur compte des ÉVÉNEMENTS (plus proche, dans le mille, plus loin) :
 * gorgées ou points se lisent à l'affichage selon l'ambiance. Aucune
 * exception : chaque action rend `{ ok: false, error }`. Le hasard vit dans
 * `rngState`, le moteur ne lit jamais l'horloge. La réponse n'entre dans
 * l'état qu'à `reveal`, fournie par l'appelant qui détient la banque ; tant
 * que la question est ouverte, `toVdnPublicView` retire la graine et les
 * estimations des autres.
 */

export const VDN_QUESTION_COUNTS = [5, 10, 15] as const
export type VdnQuestionCount = (typeof VDN_QUESTION_COUNTS)[number]
export const VDN_DEFAULT_QUESTION_COUNT: VdnQuestionCount = 10
export const VDN_MIN_PLAYERS = 2

/** « Dans le mille » : un écart d'au plus 2 % de la réponse… */
export const VDN_BULLSEYE_RATIO = 0.02
/**
 * …et d'au plus un an quand la réponse est une année : 2 % du millésime
 * faisaient ±40 ans pour la chute du mur de Berlin, et le plus proche y
 * tombait presque toujours « dans le mille ».
 */
export const VDN_YEAR_BULLSEYE_MAX = 1
/** Règle graduée logarithmique dès que la réponse atteint ce nombre… */
export const VDN_LOG_ANSWER_FROM = 10_000
/** …ou dès que la plus forte estimation dépasse 50 fois la plus faible. */
export const VDN_LOG_SPREAD_RATIO = 50
/** Garde-fou de saisie : au-delà, la règle graduée ne veut plus rien dire. */
export const VDN_MAX_ABS_ESTIMATE = 1e15

export type VdnTag = 'bullseye' | 'closest' | 'farthest'

/** Barème du classement final, le même quelle que soit l'ambiance. */
export const VDN_POINTS: Readonly<Record<VdnTag, number>> = { bullseye: 6, closest: 3, farthest: -1 }
/** Ambiance alcool : gorgées distribuées (dans le mille, plus proche) ou bues (plus loin). */
export const VDN_SIPS: Readonly<Record<VdnTag, number>> = { bullseye: 6, closest: 3, farthest: 3 }

export type VdnSettings = {
  questionCount: VdnQuestionCount
  /** Thèmes retenus, dans l'ordre de VDN_THEMES ; vide = tout mélanger. */
  themes: VdnTheme[]
  /** En ligne, une estimation se corrige tant que la question est ouverte ; en local, elle est définitive. */
  allowCorrection: boolean
}

export type VdnPhase = 'answering' | 'reveal' | 'finished'

export type VdnResultRow = { playerId: string; estimate: number; gap: number; tag: VdnTag | null }

export type VdnReveal = {
  questionId: string
  answer: number
  /** Joueurs qui ont répondu, du plus proche au plus loin (ordre de la table à écart égal). */
  results: VdnResultRow[]
}

/** Dans le mille ne compte pas aussi comme « plus proche » : ce sont deux événements distincts. */
export type VdnTally = { closest: number; bullseye: number; farthest: number }

export type VdnState = {
  settings: VdnSettings
  /** Table, dans l'ordre de la prop `players` (local) ou des membres (en ligne). */
  playerIds: string[]
  questionIds: string[]
  /** Plus petite estimation admise, alignée sur questionIds (0 par défaut). */
  questionMins: number[]
  index: number
  /** Premier à estimer à la question 0 ; la main tourne ensuite d'un cran par question. */
  firstPlayerIndex: number
  /** SECRET tant que la phase est `answering` : null = pas encore répondu. */
  estimates: Record<string, number | null>
  phase: VdnPhase
  reveal: VdnReveal | null
  scores: Record<string, number>
  tallies: Record<string, VdnTally>
  rngState: RngState
}

export type VdnError =
  | 'NOT_ENOUGH_PLAYERS'
  | 'DUPLICATE_PLAYER'
  | 'NO_QUESTIONS'
  | 'WRONG_PHASE'
  | 'UNKNOWN_PLAYER'
  | 'ALREADY_ANSWERED'
  | 'NOT_A_NUMBER'
  | 'BELOW_MIN'
  | 'TOO_LARGE'
  | 'NOT_ALL_ANSWERED'
  | 'WRONG_QUESTION'

export type VdnOutcome = { ok: true; state: VdnState } | { ok: false; error: VdnError }

/** Ce que le moteur lit d'une question de la banque pour la tirer : jamais la réponse. */
export type VdnPoolEntry = Pick<VdnQuestionMeta, 'id' | 'theme' | 'min'>

const ok = (state: VdnState): VdnOutcome => ({ ok: true, state })
const fail = (error: VdnError): VdnOutcome => ({ ok: false, error })

const zeroTally = (): VdnTally => ({ closest: 0, bullseye: 0, farthest: 0 })

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Arrondi à 12 chiffres significatifs : 0,5 − 0,3 et 0,3 − 0,1 doivent rester ex æquo. */
function tidy(value: number): number {
  const v = Number(value.toPrecision(12))
  return v === 0 ? 0 : v
}

function minOf(entry: Pick<VdnQuestionMeta, 'min'>): number {
  return isFiniteNumber(entry.min) ? entry.min : 0
}

function emptyEstimates(playerIds: readonly string[]): Record<string, number | null> {
  const estimates: Record<string, number | null> = {}
  for (const id of playerIds) estimates[id] = null
  return estimates
}

/** Thèmes valides, sans doublon, dans l'ordre canonique ; les 7 cochés reviennent à « tout mélanger ». */
export function normalizeVdnThemes(themes: readonly string[]): VdnTheme[] {
  const picked = VDN_THEMES.filter((theme) => themes.includes(theme))
  return picked.length === VDN_THEMES.length ? [] : picked
}

export function isVdnQuestionCount(value: unknown): value is VdnQuestionCount {
  return (VDN_QUESTION_COUNTS as readonly unknown[]).includes(value)
}

/**
 * Tirage sans remise. Les thèmes alternent (un de chaque, dans un ordre
 * mélangé à chaque tour) : dix questions ne tombent pas toutes sur le sport.
 * Tirages : un mélange par thème présent, puis un mélange de l'ordre des
 * thèmes par tour.
 */
function pickQuestions(
  pool: readonly VdnPoolEntry[],
  settings: VdnSettings,
  rng: ReturnType<typeof createRng>
): VdnPoolEntry[] {
  const wanted = settings.themes.length > 0 ? settings.themes : null
  const seen = new Set<string>()
  const byTheme = new Map<VdnTheme, VdnPoolEntry[]>()
  for (const entry of pool) {
    if (seen.has(entry.id) || !VDN_THEMES.includes(entry.theme)) continue
    if (wanted && !wanted.includes(entry.theme)) continue
    seen.add(entry.id)
    const list = byTheme.get(entry.theme) ?? []
    list.push(entry)
    byTheme.set(entry.theme, list)
  }
  const decks: VdnPoolEntry[][] = []
  for (const theme of VDN_THEMES) {
    const list = byTheme.get(theme)
    if (list) decks.push(rng.shuffle(list))
  }
  const picked: VdnPoolEntry[] = []
  while (picked.length < settings.questionCount) {
    const live = decks.filter((deck) => deck.length > 0)
    if (live.length === 0) break
    for (const deck of rng.shuffle(live)) {
      if (picked.length >= settings.questionCount) break
      const next = deck.shift()
      if (next) picked.push(next)
    }
  }
  return picked
}

/**
 * Nouvelle partie. Tirages, dans l'ordre : les questions (pickQuestions),
 * puis le premier joueur à estimer. Moins de questions disponibles que
 * demandé : la partie est plus courte, pas refusée.
 */
export function createGame(options: {
  playerIds: readonly string[]
  pool: readonly VdnPoolEntry[]
  seed: string | number
  questionCount?: VdnQuestionCount
  themes?: readonly VdnTheme[]
  allowCorrection?: boolean
}): VdnOutcome {
  const playerIds = [...options.playerIds]
  if (playerIds.length < VDN_MIN_PLAYERS) return fail('NOT_ENOUGH_PLAYERS')
  if (new Set(playerIds).size !== playerIds.length) return fail('DUPLICATE_PLAYER')
  const settings: VdnSettings = {
    questionCount: options.questionCount ?? VDN_DEFAULT_QUESTION_COUNT,
    themes: normalizeVdnThemes(options.themes ?? []),
    allowCorrection: options.allowCorrection ?? false,
  }
  const rng = createRng(options.seed)
  const picked = pickQuestions(options.pool, settings, rng)
  if (picked.length === 0) return fail('NO_QUESTIONS')
  const firstPlayerIndex = rng.pickIndex(playerIds.length)
  const scores: Record<string, number> = {}
  const tallies: Record<string, VdnTally> = {}
  for (const id of playerIds) {
    scores[id] = 0
    tallies[id] = zeroTally()
  }
  return ok({
    settings,
    playerIds,
    questionIds: picked.map((entry) => entry.id),
    questionMins: picked.map(minOf),
    index: 0,
    firstPlayerIndex,
    estimates: emptyEstimates(playerIds),
    phase: 'answering',
    reveal: null,
    scores,
    tallies,
    rngState: rng.getState(),
  })
}

export function currentQuestionId(state: VdnState): string | null {
  return state.questionIds[state.index] ?? null
}

export function currentMin(state: VdnState): number {
  const min = state.questionMins[state.index]
  return isFiniteNumber(min) ? min : 0
}

export function hasAnswered(state: VdnState, playerId: string): boolean {
  return isFiniteNumber(state.estimates[playerId])
}

export function allAnswered(state: VdnState): boolean {
  return state.playerIds.every((id) => hasAnswered(state, id))
}

/** Ordre de passage du téléphone pour la question en cours : la main tourne d'un cran par question. */
export function answerOrder(state: VdnState): string[] {
  const n = state.playerIds.length
  if (n === 0) return []
  const start = (((state.firstPlayerIndex + state.index) % n) + n) % n
  return state.playerIds.map((_, i) => state.playerIds[(start + i) % n])
}

/** Prochain joueur à estimer (local), null quand tout le monde a répondu. */
export function nextToAnswer(state: VdnState): string | null {
  if (state.phase !== 'answering') return null
  for (const id of answerOrder(state)) {
    if (!hasAnswered(state, id)) return id
  }
  return null
}

export function submitEstimate(state: VdnState, playerId: string, value: number): VdnOutcome {
  if (state.phase !== 'answering') return fail('WRONG_PHASE')
  if (!state.playerIds.includes(playerId)) return fail('UNKNOWN_PLAYER')
  if (!isFiniteNumber(value)) return fail('NOT_A_NUMBER')
  if (Math.abs(value) > VDN_MAX_ABS_ESTIMATE) return fail('TOO_LARGE')
  if (value < currentMin(state)) return fail('BELOW_MIN')
  if (hasAnswered(state, playerId) && !state.settings.allowCorrection) return fail('ALREADY_ANSWERED')
  return ok({ ...state, estimates: { ...state.estimates, [playerId]: value === 0 ? 0 : value } })
}

export function gapOf(estimate: number, answer: number): number {
  return tidy(Math.abs(estimate - answer))
}

/** Ce que le barème lit d'une question, en plus de sa réponse. */
export type VdnScoringOptions = {
  /** La réponse est une année, avant ou de notre ère : « dans le mille » à un an près au plus. */
  year?: boolean
}

export function bullseyeThreshold(answer: number, options: VdnScoringOptions = {}): number {
  if (answer === 0) return 0
  const threshold = tidy(Math.abs(answer) * VDN_BULLSEYE_RATIO)
  return options.year ? Math.min(threshold, VDN_YEAR_BULLSEYE_MAX) : threshold
}

/**
 * Le barème d'une question. Les entrées arrivent dans l'ordre de la table,
 * qui départage l'affichage à écart égal.
 */
export function scoreQuestion(
  answer: number,
  entries: readonly { playerId: string; estimate: number }[],
  options: VdnScoringOptions = {}
): VdnResultRow[] {
  const rows = entries
    .filter((entry) => isFiniteNumber(entry.estimate))
    .map((entry, order) => ({ ...entry, gap: gapOf(entry.estimate, answer), order }))
    .sort((a, b) => a.gap - b.gap || a.order - b.order)
  if (rows.length === 0) return []
  const best = rows[0].gap
  const worst = rows[rows.length - 1].gap
  const threshold = bullseyeThreshold(answer, options)
  return rows.map(({ playerId, estimate, gap }) => {
    let tag: VdnTag | null = null
    if (best !== worst) {
      if (gap === best) tag = gap <= threshold ? 'bullseye' : 'closest'
      else if (gap === worst) tag = 'farthest'
    }
    return { playerId, estimate, gap, tag }
  })
}

/**
 * Révèle la question en cours. En local, tout le monde doit avoir répondu ;
 * en ligne, l'échéance passe `force` : les absents sont exclus du calcul.
 */
export function reveal(
  state: VdnState,
  question: { id: string; answer: number } & VdnScoringOptions,
  options: { force?: boolean } = {}
): VdnOutcome {
  if (state.phase !== 'answering') return fail('WRONG_PHASE')
  if (question.id !== currentQuestionId(state)) return fail('WRONG_QUESTION')
  if (!isFiniteNumber(question.answer)) return fail('NOT_A_NUMBER')
  if (!options.force && !allAnswered(state)) return fail('NOT_ALL_ANSWERED')
  const entries: { playerId: string; estimate: number }[] = []
  for (const playerId of state.playerIds) {
    const estimate = state.estimates[playerId]
    if (isFiniteNumber(estimate)) entries.push({ playerId, estimate })
  }
  const results = scoreQuestion(question.answer, entries, { year: question.year })
  const scores = { ...state.scores }
  const tallies = { ...state.tallies }
  for (const row of results) {
    if (!row.tag) continue
    scores[row.playerId] = (scores[row.playerId] ?? 0) + VDN_POINTS[row.tag]
    const tally = tallies[row.playerId] ?? zeroTally()
    tallies[row.playerId] = { ...tally, [row.tag]: tally[row.tag] + 1 }
  }
  return ok({
    ...state,
    phase: 'reveal',
    reveal: { questionId: question.id, answer: question.answer, results },
    scores,
    tallies,
  })
}

/** Question suivante, ou fin de partie après la dernière révélation. */
export function nextQuestion(state: VdnState): VdnOutcome {
  if (state.phase !== 'reveal') return fail('WRONG_PHASE')
  if (state.index + 1 >= state.questionIds.length) return ok({ ...state, phase: 'finished' })
  return ok({
    ...state,
    index: state.index + 1,
    estimates: emptyEstimates(state.playerIds),
    phase: 'answering',
    reveal: null,
  })
}

export type VdnRankingRow = {
  playerId: string
  score: number
  /** Rang « compétition » : 1, 1, 3… */
  rank: number
  tally: VdnTally
  /** Gagne qui est seul ou ex æquo en tête avec un score positif. */
  won: boolean
}

export function ranking(state: Pick<VdnState, 'playerIds' | 'scores' | 'tallies'>): VdnRankingRow[] {
  const rows = state.playerIds
    .map((playerId, order) => ({
      playerId,
      order,
      score: state.scores[playerId] ?? 0,
      tally: state.tallies[playerId] ?? zeroTally(),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
  let rank = 0
  return rows.map((row, i) => {
    if (i === 0 || row.score !== rows[i - 1].score) rank = i + 1
    return { playerId: row.playerId, score: row.score, rank, tally: row.tally, won: rank === 1 && row.score > 0 }
  })
}

export function sipsGiven(tally: VdnTally): number {
  return tally.closest * VDN_SIPS.closest + tally.bullseye * VDN_SIPS.bullseye
}

export function sipsDrunk(tally: VdnTally): number {
  return tally.farthest * VDN_SIPS.farthest
}

// ─── Règle graduée ───────────────────────────────────────────────────────────

export type VdnScale = {
  kind: 'lin' | 'log'
  min: number
  max: number
  /** Graduations, bornes comprises. */
  ticks: number[]
}

function wantsLogScale(answer: number, estimates: readonly number[]): boolean {
  if (answer >= VDN_LOG_ANSWER_FROM) return true
  const positives = estimates.filter((v) => isFiniteNumber(v) && v > 0)
  if (positives.length < 2) return false
  return Math.max(...positives) / Math.min(...positives) > VDN_LOG_SPREAD_RATIO
}

function niceStep(raw: number): number {
  const base = 10 ** Math.floor(Math.log10(raw))
  const f = raw / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * base
}

function linearScale(lo: number, hi: number): VdnScale {
  let a = lo
  let b = hi
  if (a === b) {
    const pad = a === 0 ? 1 : Math.abs(a) / 2
    a -= pad
    b += pad
  }
  const span = b - a
  const step = niceStep(span / 4)
  let min = Math.floor((a - span * 0.08) / step) * step
  const max = Math.ceil((b + span * 0.08) / step) * step
  // Une question sans réponse négative ne gradue pas sous zéro.
  if (lo >= 0 && min < 0) min = 0
  const ticks: number[] = []
  for (let i = 0; i <= 50; i += 1) {
    const value = tidy(min + i * step)
    if (value > max + step / 2) break
    ticks.push(value)
  }
  return { kind: 'lin', min: tidy(min), max: tidy(max), ticks }
}

/** Mantisses des bornes logarithmiques : assez fines pour ne pas écraser un groupe serré. */
const LOG_MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

function logFloor(value: number): number {
  const base = 10 ** Math.floor(Math.log10(value))
  let best = base
  for (const m of LOG_MANTISSAS) {
    if (m * base <= value * (1 + 1e-9)) best = m * base
  }
  return tidy(best)
}

function logCeil(value: number): number {
  const base = 10 ** Math.floor(Math.log10(value))
  for (const m of LOG_MANTISSAS) {
    if (m * base >= value * (1 - 1e-9)) return tidy(m * base)
  }
  return tidy(10 * base)
}

function logTicks(min: number, max: number): number[] {
  const inside = (v: number) => v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)
  const candidates = (mantissas: number[]) => {
    const out: number[] = []
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e += 1) {
      for (const m of mantissas) {
        const v = tidy(m * 10 ** e)
        if (inside(v)) out.push(v)
      }
    }
    return out
  }
  let ticks = candidates([1, 2, 5])
  if (ticks.length > 7) ticks = candidates([1])
  // Trop de décennies pour la largeur d'un téléphone : une sur deux, une sur trois…
  if (ticks.length > 7) {
    const every = Math.ceil(ticks.length / 6)
    ticks = ticks.filter((_, i) => i % every === 0)
  }
  const all = [min, ...ticks, max].sort((x, y) => x - y)
  return all.filter((v, i) => i === 0 || v !== all[i - 1])
}

function logScale(positives: readonly number[]): VdnScale {
  const min = logFloor(Math.min(...positives) / 1.15)
  let max = logCeil(Math.max(...positives) * 1.15)
  if (max <= min) max = tidy(min * 10)
  return { kind: 'log', min, max, ticks: logTicks(min, max) }
}

/**
 * Échelle de la règle graduée : linéaire, ou logarithmique quand la réponse
 * atteint 10 000 ou que les estimations s'étalent sur plus d'un facteur 50
 * (jamais avec une valeur négative). En log, une valeur nulle se pose au bord gauche.
 */
export function scaleFor(answer: number, estimates: readonly number[]): VdnScale {
  const values = [answer, ...estimates].filter(isFiniteNumber)
  if (values.length === 0) return { kind: 'lin', min: 0, max: 1, ticks: [0, 1] }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (lo >= 0 && hi > 0 && wantsLogScale(answer, estimates)) return logScale(values.filter((v) => v > 0))
  return linearScale(lo, hi)
}

/** Position d'une valeur sur la règle, de 0 (bord gauche) à 1 (bord droit). */
export function scalePosition(scale: VdnScale, value: number): number {
  if (!isFiniteNumber(value)) return 0
  let ratio: number
  if (scale.kind === 'log') {
    if (value <= 0 || scale.min <= 0) return 0
    const a = Math.log10(scale.min)
    const b = Math.log10(scale.max)
    ratio = b === a ? 0.5 : (Math.log10(value) - a) / (b - a)
  } else {
    ratio = scale.max === scale.min ? 0.5 : (value - scale.min) / (scale.max - scale.min)
  }
  return Math.min(1, Math.max(0, ratio))
}

/**
 * Rangées des marqueurs : deux marqueurs plus proches que `minGap` (fraction
 * de la règle) ne partagent pas une rangée. Au-delà de `maxLanes`, le
 * marqueur rejoint la rangée qui a le plus de place.
 */
export function assignLanes(positions: readonly number[], minGap: number, maxLanes = 4): number[] {
  const order = positions.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i)
  const lastInLane: number[] = []
  const lanes = positions.map(() => 0)
  for (const { p, i } of order) {
    let lane = lastInLane.findIndex((last) => p - last >= minGap)
    if (lane === -1 && lastInLane.length < Math.max(1, maxLanes)) {
      lane = lastInLane.length
      lastInLane.push(p)
    } else if (lane === -1) {
      lane = 0
      for (let l = 1; l < lastInLane.length; l += 1) {
        if (lastInLane[l] < lastInLane[lane]) lane = l
      }
    }
    lastInLane[lane] = p
    lanes[i] = lane
  }
  return lanes
}

// ─── Vue publique (en ligne, TV) ─────────────────────────────────────────────

export type VdnPublicView = {
  settings: VdnSettings
  playerIds: string[]
  phase: VdnPhase
  /** Numéro (base 1) et nombre de questions : la liste des suivantes reste au serveur. */
  questionNumber: number
  questionCount: number
  questionId: string | null
  questionMin: number
  answeredIds: string[]
  /** L'estimation du seul spectateur qui regarde, null pour la TV. */
  myEstimate: number | null
  reveal: VdnReveal | null
  scores: Record<string, number>
  tallies: Record<string, VdnTally>
}

/**
 * Ce qu'un téléphone (viewerId) ou la TV (null) peut voir : ni graine, ni
 * questions à venir, ni estimation d'autrui avant la révélation.
 */
export function toVdnPublicView(state: VdnState, viewerId: string | null): VdnPublicView {
  const mine = viewerId === null ? null : state.estimates[viewerId]
  return {
    settings: state.settings,
    playerIds: state.playerIds,
    phase: state.phase,
    questionNumber: state.index + 1,
    questionCount: state.questionIds.length,
    questionId: currentQuestionId(state),
    questionMin: currentMin(state),
    answeredIds: state.playerIds.filter((id) => hasAnswered(state, id)),
    myEstimate: isFiniteNumber(mine) ? mine : null,
    reveal: state.reveal,
    scores: state.scores,
    tallies: state.tallies,
  }
}

// ─── Reprise (useResumableLocalGame) ─────────────────────────────────────────

export const VDN_SAVE_ID = 'vue-de-nez'
/** À incrémenter dès que la forme de VdnSave change : l'ancienne sauvegarde est jetée. */
export const VDN_SAVE_VERSION = 1

/** L'état est déjà du JSON pur (identifiants seulement) : il se sauvegarde tel quel. */
export type VdnSave = VdnState

export function toVdnSave(state: VdnState): VdnSave {
  return state
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isIndex = (value: unknown, length: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

function readTally(value: unknown): VdnTally | null {
  if (!isObject(value)) return null
  const { closest, bullseye, farthest } = value
  if (!isCount(closest) || !isCount(bullseye) || !isCount(farthest)) return null
  return { closest, bullseye, farthest }
}

function readReveal(value: unknown, questionId: string, playerIds: readonly string[]): VdnReveal | null {
  if (!isObject(value) || value.questionId !== questionId || !isFiniteNumber(value.answer)) return null
  if (!Array.isArray(value.results)) return null
  const results: VdnResultRow[] = []
  for (const row of value.results) {
    if (!isObject(row) || typeof row.playerId !== 'string' || !playerIds.includes(row.playerId)) return null
    if (!isFiniteNumber(row.estimate) || !isFiniteNumber(row.gap)) return null
    const tag = row.tag
    if (tag !== null && tag !== 'bullseye' && tag !== 'closest' && tag !== 'farthest') return null
    results.push({ playerId: row.playerId, estimate: row.estimate, gap: row.gap, tag })
  }
  return { questionId, answer: value.answer, results }
}

/**
 * Sauvegarde → état, pour la table ACTUELLE et la banque chargée. Null si
 * elle est illisible, d'une autre table, ou cite une question que la banque
 * ne connaît plus : partie neuve plutôt qu'un plantage. Une partie finie ne
 * se reprend pas. Les réglages viennent de la sauvegarde, jamais de la
 * pré-partie : c'est aussi le prédicat de reprise du jeu local.
 */
export function restoreVdnSave(
  save: unknown,
  playerIds: readonly string[],
  knownQuestionIds: ReadonlySet<string>
): VdnState | null {
  if (!isObject(save) || !isObject(save.settings)) return null
  const rawSettings = save.settings
  if (!isVdnQuestionCount(rawSettings.questionCount) || !Array.isArray(rawSettings.themes)) return null
  if (!rawSettings.themes.every((t): t is VdnTheme => (VDN_THEMES as readonly unknown[]).includes(t))) return null
  if (typeof rawSettings.allowCorrection !== 'boolean') return null
  const settings: VdnSettings = {
    questionCount: rawSettings.questionCount,
    themes: normalizeVdnThemes(rawSettings.themes),
    allowCorrection: rawSettings.allowCorrection,
  }

  if (!Array.isArray(save.playerIds) || save.playerIds.length !== playerIds.length) return null
  const ids = save.playerIds.filter((id): id is string => typeof id === 'string' && playerIds.includes(id))
  if (ids.length !== playerIds.length || new Set(ids).size !== ids.length) return null

  if (!Array.isArray(save.questionIds) || save.questionIds.length === 0) return null
  const questionIds = save.questionIds.filter((id): id is string => typeof id === 'string' && knownQuestionIds.has(id))
  if (questionIds.length !== save.questionIds.length || new Set(questionIds).size !== questionIds.length) return null
  if (!Array.isArray(save.questionMins) || save.questionMins.length !== questionIds.length) return null
  if (!save.questionMins.every(isFiniteNumber)) return null
  const questionMins = save.questionMins as number[]

  if (!isIndex(save.index, questionIds.length) || !isIndex(save.firstPlayerIndex, ids.length)) return null
  if (save.phase !== 'answering' && save.phase !== 'reveal') return null
  if (!isFiniteNumber(save.rngState)) return null

  if (!isObject(save.estimates) || !isObject(save.scores) || !isObject(save.tallies)) return null
  const estimates: Record<string, number | null> = {}
  const scores: Record<string, number> = {}
  const tallies: Record<string, VdnTally> = {}
  for (const id of ids) {
    const estimate = save.estimates[id]
    if (estimate !== null && !isFiniteNumber(estimate)) return null
    estimates[id] = estimate
    const score = save.scores[id]
    if (!isFiniteNumber(score)) return null
    scores[id] = score
    const tally = readTally(save.tallies[id])
    if (!tally) return null
    tallies[id] = tally
  }

  const questionId = questionIds[save.index]
  let revealed: VdnReveal | null = null
  if (save.phase === 'reveal') {
    revealed = readReveal(save.reveal, questionId, ids)
    if (!revealed) return null
  } else if (save.reveal !== null) {
    return null
  }

  return {
    settings,
    playerIds: ids,
    questionIds,
    questionMins,
    index: save.index,
    firstPlayerIndex: save.firstPlayerIndex,
    estimates,
    phase: save.phase,
    reveal: revealed,
    scores,
    tallies,
    rngState: save.rngState,
  }
}
