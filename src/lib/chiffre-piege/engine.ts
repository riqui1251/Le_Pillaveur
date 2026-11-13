import { createRng, rngFromState, type RngState } from '@/lib/petit-buveur/rng'

/**
 * Moteur pur du Chiffre Piégé, partagé par la partie locale (un téléphone qui
 * fait le tour de la table) et par le serveur de la version en ligne.
 *
 * Une manche : un nombre piège est tiré en secret dans [1, max]. À son tour,
 * chacun propose un entier de l'intervalle encore ouvert [low, high], bornes
 * comprises. Raté : l'intervalle se resserre du côté où le piège n'est pas et
 * la main passe. Pile dessus : BOUM, le joueur prend min(essais de la manche,
 * 5), cet essai compris. Quand low === high, le dernier nombre EST le piège :
 * il faut le jouer, sauf joker « Je passe » (un par joueur et par partie, qui
 * coûte 1). La manche suivante s'ouvre au voisin du perdant ; après la
 * dernière, le moins pénalisé gagne.
 *
 * Pénalités NEUTRES : gorgées ou points selon l'ambiance, choisie à
 * l'affichage (le barème est le même). Aucune exception pour une entrée de
 * joueur : chaque action rend `{ ok: false, error }`. Le hasard vit dans
 * `rngState` (graine de partie), le temps arrive en paramètre (`now`).
 * `trap` et `rngState` sont SECRETS : `toChiffrePiegePublicView` les retire,
 * et l'écran n'a besoin de rien d'autre pour s'afficher.
 */

export const CHIFFRE_PIEGE_RANGES = [50, 100, 200] as const
export type ChiffrePiegeRange = (typeof CHIFFRE_PIEGE_RANGES)[number]
export const CHIFFRE_PIEGE_ROUND_COUNTS = [3, 5, 10] as const
export type ChiffrePiegeRoundCount = (typeof CHIFFRE_PIEGE_ROUND_COUNTS)[number]

export const CHIFFRE_PIEGE_DEFAULT_RANGE: ChiffrePiegeRange = 100
export const CHIFFRE_PIEGE_DEFAULT_ROUNDS: ChiffrePiegeRoundCount = 5
export const CHIFFRE_PIEGE_MIN_PLAYERS = 2
/** Plafond d'un BOUM : une gorgée (ou un point) par essai de la manche, 5 au plus. */
export const CHIFFRE_PIEGE_PENALTY_CAP = 5
export const CHIFFRE_PIEGE_JOKER_PENALTY = 1
/**
 * Lecture minimale du BOUM avant « Manche suivante » : un double toucher sur
 * « Tenter » ne doit pas enjamber l'écran qui dit qui boit.
 */
export const CHIFFRE_PIEGE_BOOM_READ_MS = 1_500

export type ChiffrePiegeSettings = { max: ChiffrePiegeRange; rounds: ChiffrePiegeRoundCount }

export type ChiffrePiegePhase = 'playing' | 'boom' | 'finished'

/** Où se cache le piège par rapport au nombre proposé. */
export type ChiffrePiegeDirection = 'higher' | 'lower'

/** Coup raté ou joker : le BOUM, lui, vit dans `lastBoom`. */
export type ChiffrePiegeMove =
  | { kind: 'guess'; playerId: string; value: number; dir: ChiffrePiegeDirection }
  | { kind: 'pass'; playerId: string }

export type ChiffrePiegeBoom = {
  playerId: string
  /** Le piège de la manche : public dès qu'il a sauté. */
  trap: number
  /** Essais de la manche, celui du BOUM compris. */
  attempts: number
  penalty: number
  roundIndex: number
  /** Instant du BOUM (ms) : base du plancher de lecture. */
  at: number
}

export type ChiffrePiegeState = {
  /** Table, dans l'ordre où la main tourne. */
  playerIds: string[]
  /** Joueurs momentanément absents : la main les saute. */
  awayIds: string[]
  max: ChiffrePiegeRange
  roundsTotal: ChiffrePiegeRoundCount
  /** Manche en cours, à partir de 0. */
  roundIndex: number
  /** SECRET tant qu'il n'a pas sauté. */
  trap: number
  low: number
  high: number
  turnIndex: number
  /** Coups ratés et jokers de la manche, dans l'ordre. */
  history: ChiffrePiegeMove[]
  jokersUsed: Record<string, boolean>
  /** Pénalités cumulées : gorgées ou points selon l'ambiance. */
  penalties: Record<string, number>
  /** Nombre de fois où chacun est tombé sur le piège. */
  booms: Record<string, number>
  lastBoom: ChiffrePiegeBoom | null
  phase: ChiffrePiegePhase
  /** SECRET : il prédit les prochains pièges. */
  rngState: RngState
}

/** Ce qu'un écran public (joueur, spectateur, TV) peut lire. */
export type ChiffrePiegePublicView = Omit<ChiffrePiegeState, 'trap' | 'rngState'>

export type ChiffrePiegeError =
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_PLAYERS'
  | 'INVALID_SETTINGS'
  | 'WRONG_PHASE'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'NOT_AN_INTEGER'
  | 'OUT_OF_RANGE'
  | 'JOKER_USED'
  | 'READING_TIME'
  | 'ALREADY_AWAY'
  | 'NOT_AWAY'

export type ChiffrePiegeResult =
  | { ok: true; state: ChiffrePiegeState }
  | { ok: false; error: ChiffrePiegeError }

export type ChiffrePiegeRankingRow = {
  playerId: string
  penalty: number
  booms: number
  jokerUsed: boolean
  /** Rang de compétition : les ex æquo partagent leur place (1, 1, 3). */
  rank: number
}

const ok = (state: ChiffrePiegeState): ChiffrePiegeResult => ({ ok: true, state })
const fail = (error: ChiffrePiegeError): ChiffrePiegeResult => ({ ok: false, error })

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

export function isChiffrePiegeRange(value: unknown): value is ChiffrePiegeRange {
  return isInt(value) && (CHIFFRE_PIEGE_RANGES as readonly number[]).indexOf(value) !== -1
}

export function isChiffrePiegeRoundCount(value: unknown): value is ChiffrePiegeRoundCount {
  return isInt(value) && (CHIFFRE_PIEGE_ROUND_COUNTS as readonly number[]).indexOf(value) !== -1
}

function filledRecord<T>(ids: readonly string[], value: T): Record<string, T> {
  const out: Record<string, T> = {}
  for (const id of ids) out[id] = value
  return out
}

/** Prochain joueur présent après `from`, en boucle ; `from` lui-même si personne d'autre n'est là. */
function nextActiveIndex(state: Pick<ChiffrePiegeState, 'playerIds' | 'awayIds'>, from: number): number {
  const count = state.playerIds.length
  for (let step = 1; step <= count; step += 1) {
    const index = (from + step) % count
    if (state.awayIds.indexOf(state.playerIds[index]) === -1) return index
  }
  return from
}

function nextStarterIndex(state: ChiffrePiegePublicView): number {
  const loser = state.lastBoom ? state.playerIds.indexOf(state.lastBoom.playerId) : -1
  return nextActiveIndex(state, loser === -1 ? state.turnIndex : loser)
}

/**
 * Partie neuve. Ordre des tirages (rejouabilité à graine égale) : le premier
 * joueur, puis le piège de la première manche.
 */
export function createChiffrePiegeGame(options: {
  playerIds: readonly string[]
  settings: ChiffrePiegeSettings
  seed: string | number
}): ChiffrePiegeResult {
  const { playerIds, settings, seed } = options
  if (playerIds.length < CHIFFRE_PIEGE_MIN_PLAYERS) return fail('NOT_ENOUGH_PLAYERS')
  if (playerIds.some((id) => typeof id !== 'string' || id.length === 0)) return fail('INVALID_PLAYERS')
  if (new Set(playerIds).size !== playerIds.length) return fail('INVALID_PLAYERS')
  if (!isChiffrePiegeRange(settings.max) || !isChiffrePiegeRoundCount(settings.rounds)) {
    return fail('INVALID_SETTINGS')
  }
  const rng = createRng(seed)
  const turnIndex = rng.pickIndex(playerIds.length)
  const trap = rng.int(1, settings.max)
  return ok({
    playerIds: [...playerIds],
    awayIds: [],
    max: settings.max,
    roundsTotal: settings.rounds,
    roundIndex: 0,
    trap,
    low: 1,
    high: settings.max,
    turnIndex,
    history: [],
    jokersUsed: filledRecord(playerIds, false),
    penalties: filledRecord(playerIds, 0),
    booms: filledRecord(playerIds, 0),
    lastBoom: null,
    phase: 'playing',
    rngState: rng.getState(),
  })
}

/** Joueur qui doit proposer un nombre ; null hors du jeu (BOUM à l'écran, partie finie). */
export function currentChiffrePiegePlayerId(state: ChiffrePiegePublicView): string | null {
  if (state.phase !== 'playing') return null
  return state.playerIds[state.turnIndex] ?? null
}

/** Essais déjà ratés dans la manche (les jokers n'en sont pas). */
export function chiffrePiegeAttempts(state: ChiffrePiegePublicView): number {
  let attempts = 0
  for (const move of state.history) if (move.kind === 'guess') attempts += 1
  return attempts
}

/** Ce que prendra le prochain qui tombe sur le piège. */
export function chiffrePiegeStake(state: ChiffrePiegePublicView): number {
  return Math.min(chiffrePiegeAttempts(state) + 1, CHIFFRE_PIEGE_PENALTY_CAP)
}

/** Nombres encore possibles : le risque du prochain essai est de 1 sur ce nombre. */
export function chiffrePiegeOdds(state: ChiffrePiegePublicView): number {
  return state.high - state.low + 1
}

/** Il ne reste qu'un nombre : c'est le piège, à jouer ou à esquiver au joker. */
export function isChiffrePiegeForced(state: ChiffrePiegePublicView): boolean {
  return state.phase === 'playing' && state.low === state.high
}

export function hasChiffrePiegeJoker(state: ChiffrePiegePublicView, playerId: string): boolean {
  return state.playerIds.indexOf(playerId) !== -1 && state.jokersUsed[playerId] !== true
}

/** Qui ouvrira la manche suivante (null hors BOUM ou après la dernière manche). */
export function chiffrePiegeNextStarterId(state: ChiffrePiegePublicView): string | null {
  if (state.phase !== 'boom' || state.roundIndex + 1 >= state.roundsTotal) return null
  return state.playerIds[nextStarterIndex(state)] ?? null
}

/** Instant à partir duquel « Manche suivante » est accepté (null hors BOUM). */
export function chiffrePiegeNextRoundAt(state: ChiffrePiegePublicView): number | null {
  if (state.phase !== 'boom' || !state.lastBoom) return null
  return state.lastBoom.at + CHIFFRE_PIEGE_BOOM_READ_MS
}

/**
 * Lecture du BOUM finie à `now`. Une horloge revenue AVANT l'instant du BOUM
 * (remise à l'heure, sauvegarde reprise « datée du futur ») vaut lecture
 * faite : sinon « Manche suivante » resterait refusé pendant tout le recul,
 * sur un écran qui n'a pas d'autre issue.
 */
export function isChiffrePiegeReadingOver(state: ChiffrePiegePublicView, now: number): boolean {
  const readyAt = chiffrePiegeNextRoundAt(state)
  if (readyAt === null || !state.lastBoom) return false
  return now >= readyAt || now < state.lastBoom.at
}

/** Lecture du BOUM qui reste à `now` (ms, 0 une fois finie), jamais plus que CHIFFRE_PIEGE_BOOM_READ_MS ; null hors BOUM. */
export function chiffrePiegeReadingLeftMs(state: ChiffrePiegePublicView, now: number): number | null {
  const readyAt = chiffrePiegeNextRoundAt(state)
  if (readyAt === null) return null
  return isChiffrePiegeReadingOver(state, now) ? 0 : readyAt - now
}

export function isChiffrePiegeFinished(state: ChiffrePiegePublicView): boolean {
  return state.phase === 'finished'
}

function turnRefusal(state: ChiffrePiegeState, playerId: string): ChiffrePiegeError | null {
  if (state.phase !== 'playing') return 'WRONG_PHASE'
  if (state.playerIds.indexOf(playerId) === -1) return 'UNKNOWN_PLAYER'
  if (currentChiffrePiegePlayerId(state) !== playerId) return 'NOT_YOUR_TURN'
  return null
}

/** Le joueur au tour propose `value` (entier de [low, high]). */
export function guessChiffrePiege(
  state: ChiffrePiegeState,
  move: { playerId: string; value: number; now: number }
): ChiffrePiegeResult {
  const refusal = turnRefusal(state, move.playerId)
  if (refusal) return fail(refusal)
  const { playerId, value, now } = move
  if (!isInt(value)) return fail('NOT_AN_INTEGER')
  if (value < state.low || value > state.high) return fail('OUT_OF_RANGE')

  const attempts = chiffrePiegeAttempts(state) + 1
  if (value === state.trap) {
    const penalty = Math.min(attempts, CHIFFRE_PIEGE_PENALTY_CAP)
    return ok({
      ...state,
      phase: 'boom',
      penalties: { ...state.penalties, [playerId]: (state.penalties[playerId] ?? 0) + penalty },
      booms: { ...state.booms, [playerId]: (state.booms[playerId] ?? 0) + 1 },
      lastBoom: { playerId, trap: state.trap, attempts, penalty, roundIndex: state.roundIndex, at: now },
    })
  }

  const dir: ChiffrePiegeDirection = value < state.trap ? 'higher' : 'lower'
  return ok({
    ...state,
    low: dir === 'higher' ? value + 1 : state.low,
    high: dir === 'lower' ? value - 1 : state.high,
    history: [...state.history, { kind: 'guess', playerId, value, dir }],
    turnIndex: nextActiveIndex(state, state.turnIndex),
  })
}

/** Joker « Je passe » : le joueur au tour saute son tour contre 1, une fois par partie. */
export function passChiffrePiege(state: ChiffrePiegeState, move: { playerId: string }): ChiffrePiegeResult {
  const refusal = turnRefusal(state, move.playerId)
  if (refusal) return fail(refusal)
  const { playerId } = move
  if (state.jokersUsed[playerId] === true) return fail('JOKER_USED')
  return ok({
    ...state,
    jokersUsed: { ...state.jokersUsed, [playerId]: true },
    penalties: { ...state.penalties, [playerId]: (state.penalties[playerId] ?? 0) + CHIFFRE_PIEGE_JOKER_PENALTY },
    history: [...state.history, { kind: 'pass', playerId }],
    turnIndex: nextActiveIndex(state, state.turnIndex),
  })
}

/**
 * Après un BOUM : nouvelle manche ouverte par le voisin du perdant, ou fin de
 * partie après la dernière. `skipReadingTime` : pour un tour joué par la
 * machine (bot, minuteur serveur), qui n'a rien à lire.
 */
export function nextChiffrePiegeRound(
  state: ChiffrePiegeState,
  options: { now: number; skipReadingTime?: boolean }
): ChiffrePiegeResult {
  if (chiffrePiegeNextRoundAt(state) === null) return fail('WRONG_PHASE')
  if (!options.skipReadingTime && !isChiffrePiegeReadingOver(state, options.now)) return fail('READING_TIME')
  if (state.roundIndex + 1 >= state.roundsTotal) return ok({ ...state, phase: 'finished' })

  const rng = rngFromState(state.rngState)
  const trap = rng.int(1, state.max)
  return ok({
    ...state,
    phase: 'playing',
    roundIndex: state.roundIndex + 1,
    trap,
    low: 1,
    high: state.max,
    history: [],
    turnIndex: nextStarterIndex(state),
    rngState: rng.getState(),
  })
}

/**
 * Absence : la main saute l'absent, et s'il l'avait, elle passe aussitôt, sans
 * pénalité ni joker. Le serveur en ligne ne s'en sert PAS : partir puis revenir
 * y esquiverait le dernier nombre (le siège d'un parti y joue au hasard).
 */
export function setChiffrePiegeAway(
  state: ChiffrePiegeState,
  change: { playerId: string; away: boolean }
): ChiffrePiegeResult {
  if (state.phase === 'finished') return fail('WRONG_PHASE')
  const { playerId, away } = change
  if (state.playerIds.indexOf(playerId) === -1) return fail('UNKNOWN_PLAYER')
  const isAway = state.awayIds.indexOf(playerId) !== -1
  if (away && isAway) return fail('ALREADY_AWAY')
  if (!away && !isAway) return fail('NOT_AWAY')

  const next: ChiffrePiegeState = {
    ...state,
    awayIds: away ? [...state.awayIds, playerId] : state.awayIds.filter((id) => id !== playerId),
  }
  if (away && currentChiffrePiegePlayerId(state) === playerId) {
    return ok({ ...next, turnIndex: nextActiveIndex(next, state.turnIndex) })
  }
  return ok(next)
}

/** Classement du moins pénalisé au plus pénalisé ; à égalité, l'ordre de la table. */
export function chiffrePiegeRanking(state: ChiffrePiegePublicView): ChiffrePiegeRankingRow[] {
  const rows = state.playerIds.map((playerId, order) => ({
    order,
    playerId,
    penalty: state.penalties[playerId] ?? 0,
    booms: state.booms[playerId] ?? 0,
    jokerUsed: state.jokersUsed[playerId] === true,
  }))
  return [...rows]
    .sort((a, b) => a.penalty - b.penalty || a.order - b.order)
    .map((row) => ({
      playerId: row.playerId,
      penalty: row.penalty,
      booms: row.booms,
      jokerUsed: row.jokerUsed,
      rank: 1 + rows.filter((other) => other.penalty < row.penalty).length,
    }))
}

/** Vue sans secret : ni le piège en cours, ni la graine qui prédit les suivants. */
export function toChiffrePiegePublicView(state: ChiffrePiegeState): ChiffrePiegePublicView {
  const { trap: _trap, rngState: _rngState, ...view } = state
  return view
}

// ─── Reprise (useResumableLocalGame) ─────────────────────────────────────────

export const CHIFFRE_PIEGE_SAVE_ID = 'chiffre-piege'
/** À incrémenter dès que la forme de la sauvegarde change : l'ancienne est jetée. */
export const CHIFFRE_PIEGE_SAVE_VERSION = 1

/** L'état entier : il ne porte que des identifiants, jamais de profil. */
export type ChiffrePiegeSave = ChiffrePiegeState

export function toChiffrePiegeSave(state: ChiffrePiegeState): ChiffrePiegeSave {
  return { ...state }
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && id.length > 0)
}

function isSameIdSet(saved: readonly string[], table: readonly string[]): boolean {
  if (saved.length !== table.length || new Set(saved).size !== saved.length) return false
  return table.every((id) => saved.indexOf(id) !== -1)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readCounts(value: unknown, ids: readonly string[]): Record<string, number> | null {
  if (!isPlainObject(value)) return null
  const out: Record<string, number> = {}
  for (const id of ids) {
    const count = value[id] ?? 0
    if (!isInt(count) || count < 0) return null
    out[id] = count
  }
  return out
}

function readFlags(value: unknown, ids: readonly string[]): Record<string, boolean> | null {
  if (!isPlainObject(value)) return null
  const out: Record<string, boolean> = {}
  for (const id of ids) {
    const flag = value[id] ?? false
    if (typeof flag !== 'boolean') return null
    out[id] = flag
  }
  return out
}

function readMove(value: unknown, ids: readonly string[], max: number): ChiffrePiegeMove | null {
  if (!isPlainObject(value)) return null
  const { kind, playerId, value: guessed, dir } = value
  if (typeof playerId !== 'string' || ids.indexOf(playerId) === -1) return null
  if (kind === 'pass') return { kind, playerId }
  if (kind !== 'guess' || !isInt(guessed) || guessed < 1 || guessed > max) return null
  if (dir !== 'higher' && dir !== 'lower') return null
  return { kind, playerId, value: guessed, dir }
}

/** `undefined` : BOUM illisible (sauvegarde rejetée) ; `null` : aucun BOUM encore. */
function readBoom(value: unknown, ids: readonly string[], max: number): ChiffrePiegeBoom | null | undefined {
  if (value === null) return null
  if (!isPlainObject(value)) return undefined
  const { playerId, trap, attempts, penalty, roundIndex, at } = value
  if (typeof playerId !== 'string' || ids.indexOf(playerId) === -1) return undefined
  if (!isInt(trap) || trap < 1 || trap > max) return undefined
  if (!isInt(attempts) || attempts < 1 || !isInt(penalty) || penalty < 1 || !isInt(roundIndex) || roundIndex < 0) {
    return undefined
  }
  if (typeof at !== 'number' || !Number.isFinite(at)) return undefined
  return { playerId, trap, attempts, penalty, roundIndex, at }
}

/**
 * Sauvegarde → état pour la table ACTUELLE (`playerIds`, ordre de la prop) :
 * le tour est retrouvé par identifiant, pas par index. Null si la sauvegarde
 * est illisible, d'une autre table, ou d'une partie déjà finie : on repart
 * alors sur une partie neuve plutôt que de planter.
 */
export function restoreChiffrePiegeSave(save: unknown, playerIds: readonly string[]): ChiffrePiegeState | null {
  if (!isPlainObject(save)) return null
  const s = save
  if (!isIdList(s.playerIds) || !isSameIdSet(s.playerIds, playerIds)) return null
  if (!isChiffrePiegeRange(s.max) || !isChiffrePiegeRoundCount(s.roundsTotal)) return null
  const max = s.max
  const roundsTotal = s.roundsTotal
  if (s.phase !== 'playing' && s.phase !== 'boom') return null
  const phase = s.phase
  if (!isInt(s.roundIndex) || s.roundIndex < 0 || s.roundIndex >= roundsTotal) return null
  if (!isInt(s.trap) || !isInt(s.low) || !isInt(s.high)) return null
  if (s.low < 1 || s.high > max || s.trap < s.low || s.trap > s.high) return null
  if (!isInt(s.turnIndex) || s.turnIndex < 0 || s.turnIndex >= s.playerIds.length) return null
  if (!isInt(s.rngState) || s.rngState < 0) return null

  if (!Array.isArray(s.history)) return null
  const history: ChiffrePiegeMove[] = []
  for (const raw of s.history) {
    const move = readMove(raw, playerIds, max)
    if (!move) return null
    history.push(move)
  }

  const jokersUsed = readFlags(s.jokersUsed, playerIds)
  const penalties = readCounts(s.penalties, playerIds)
  const booms = readCounts(s.booms, playerIds)
  if (!jokersUsed || !penalties || !booms) return null

  const lastBoom = readBoom(s.lastBoom, playerIds, max)
  if (lastBoom === undefined) return null
  if (phase === 'boom' && (!lastBoom || lastBoom.trap !== s.trap || lastBoom.roundIndex !== s.roundIndex)) {
    return null
  }

  let awayIds: string[] = []
  if (s.awayIds !== undefined) {
    if (!isIdList(s.awayIds)) return null
    awayIds = s.awayIds.filter((id) => playerIds.indexOf(id) !== -1)
  }

  return {
    playerIds: [...playerIds],
    awayIds,
    max,
    roundsTotal,
    roundIndex: s.roundIndex,
    trap: s.trap,
    low: s.low,
    high: s.high,
    turnIndex: playerIds.indexOf(s.playerIds[s.turnIndex]),
    history,
    jokersUsed,
    penalties,
    booms,
    lastBoom,
    phase,
    rngState: s.rngState,
  }
}
