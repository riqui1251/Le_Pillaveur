import { createRng, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'

/**
 * Moteur pur de « Pile Poil » (LOCAL : un téléphone passe de main en main).
 *
 * Chaque tour a une cible T. Chaque joueur, à son tour, lance le chrono et
 * l'arrête quand il se croit pile à T ; le chrono vit dans le composant, le
 * moteur ne reçoit que la durée mesurée. Écart Δ = temps − T. Quand tout le
 * monde a joué, le tour se classe par |Δ| : le plus loin est puni
 * (clamp(round(|Δ| / 0,5 s), 1, 5)), un pile poil (|Δ| < 0,05 s) récompensé
 * (5). Le tour suivant commence au joueur suivant. Après N tours, le plus
 * petit écart cumulé gagne.
 *
 * Le moteur compte des événements neutres (écarts, pile poil, plus loin) :
 * gorgées ou points se décident à l'affichage, selon l'ambiance. Ni horloge
 * ni `Math.random` : la graine donne `rngState`, rangé dans l'état.
 */

export const PILE_POIL_LEVELS = ['normal', 'pro'] as const
export type PilePoilLevel = (typeof PILE_POIL_LEVELS)[number]

export const PILE_POIL_TARGET_MODES = ['fixed', 'variable'] as const
export type PilePoilTargetMode = (typeof PILE_POIL_TARGET_MODES)[number]

export const PILE_POIL_ROUND_COUNTS = [3, 5, 8] as const
export type PilePoilRoundCount = (typeof PILE_POIL_ROUND_COUNTS)[number]

export type PilePoilSettings = {
  level: PilePoilLevel
  targetMode: PilePoilTargetMode
  rounds: PilePoilRoundCount
}

export const PILE_POIL_DEFAULT_SETTINGS: PilePoilSettings = { level: 'normal', targetMode: 'fixed', rounds: 5 }

export const PILE_POIL_FIXED_TARGET_MS = 10_000
export const PILE_POIL_VARIABLE_TARGETS_MS = [5_000, 7_500, 10_000, 12_500, 15_000, 20_000] as const

/** Normal : chiffres effacés à 3 s. Dans les deux niveaux, l'anneau se fige à 3 s. */
export const PILE_POIL_REVEAL_MS = 3_000
/** Pile poil : moins de 0,05 s d'écart. */
export const PILE_POIL_BULLSEYE_MS = 50
/** Le plus loin : une unité par demi-seconde d'écart… */
export const PILE_POIL_PENALTY_STEP_MS = 500
/** … au plus cinq. */
export const PILE_POIL_MAX_PENALTY = 5
/** Un pile poil distribue cinq gorgées (ou rapporte cinq points). */
export const PILE_POIL_BULLSEYE_REWARD = 5
/**
 * Durées gardées au centième : c'est ce qui s'affiche. Sans cet arrondi, un
 * écart de 49,6 ms (« pile poil ») s'affichait « +0,05 », et 0,05 s n'en est
 * pas un.
 */
export const PILE_POIL_RESOLUTION_MS = 10

export type PilePoilResult = {
  player: string
  /** Durée mesurée, arrondie au centième de seconde. */
  elapsedMs: number
  /** Écart signé : temps − cible (négatif = trop tôt). */
  deltaMs: number
}

export type PilePoilRound = { target: number; results: PilePoilResult[] }

/**
 * - `waiting` : le joueur au tour peut lancer le chrono ;
 * - `running` : chrono lancé (la mesure vit dans le composant) ;
 * - `between` : son résultat est affiché, avant de passer au suivant ;
 * - `roundEnd` : tout le monde a joué, classement du tour ;
 * - `finished` : tous les tours sont joués.
 */
export type PilePoilPhase = 'waiting' | 'running' | 'between' | 'roundEnd' | 'finished'

export type PilePoilState = {
  settings: PilePoilSettings
  /** Table, dans l'ordre des joueurs (celui de la prop `players`). */
  playerIds: string[]
  roundIndex: number
  /** Cible du tour en cours, en ms. */
  target: number
  /** Ordre de passage du tour : la table, décalée d'un joueur à chaque tour. */
  order: string[]
  currentIndex: number
  /** Résultats du tour en cours, dans l'ordre de passage. */
  results: PilePoilResult[]
  /** Tours terminés (tous, une fois la partie finie). */
  history: PilePoilRound[]
  phase: PilePoilPhase
  rngState: RngState
}

export function sipsForDelta(deltaMs: number): number {
  const steps = Math.round(Math.abs(deltaMs) / PILE_POIL_PENALTY_STEP_MS)
  return Math.min(PILE_POIL_MAX_PENALTY, Math.max(1, steps))
}

export function isBullseye(deltaMs: number): boolean {
  return Math.abs(deltaMs) < PILE_POIL_BULLSEYE_MS
}

/** Normal : chiffres visibles les 3 premières secondes ; Pro : jamais pendant la mesure. */
export function digitsVisible(level: PilePoilLevel, elapsedMs: number): boolean {
  return level === 'normal' && elapsedMs < PILE_POIL_REVEAL_MS
}

/**
 * Part de l'anneau pendant la mesure (1 = la cible) : il avance jusqu'à 3 s
 * puis se fige — après, plus aucun indice.
 */
export function ringProgress(elapsedMs: number, targetMs: number): number {
  if (!(targetMs > 0)) return 0
  return Math.min(Math.max(elapsedMs, 0), PILE_POIL_REVEAL_MS) / targetMs
}

function rotate<T>(list: readonly T[], by: number): T[] {
  if (list.length === 0) return []
  const shift = ((by % list.length) + list.length) % list.length
  return [...list.slice(shift), ...list.slice(0, shift)]
}

/**
 * Cible d'un tour. Variable : tirée parmi les six durées, jamais deux fois de
 * suite la même — sinon « Variable » pouvait servir trois fois 10 s.
 */
export function targetFor(settings: PilePoilSettings, rng: SeededRng, previous: number | null = null): number {
  if (settings.targetMode === 'fixed') return PILE_POIL_FIXED_TARGET_MS
  return rng.pick(PILE_POIL_VARIABLE_TARGETS_MS.filter((target) => target !== previous))
}

/**
 * Nouvelle partie. Tirages, dans l'ordre : le premier joueur du premier tour,
 * puis la cible (en mode Variable seulement).
 */
export function createGame(
  playerIds: readonly string[],
  settings: PilePoilSettings,
  seed: number | string
): PilePoilState {
  const rng = createRng(seed)
  const first = playerIds.length > 0 ? rng.pickIndex(playerIds.length) : 0
  const target = targetFor(settings, rng)
  return {
    settings: { ...settings },
    playerIds: [...playerIds],
    roundIndex: 0,
    target,
    order: rotate(playerIds, first),
    currentIndex: 0,
    results: [],
    history: [],
    phase: 'waiting',
    rngState: rng.getState(),
  }
}

/** Joueur au chrono (ou dont le résultat s'affiche) ; null entre deux tours. */
export function currentPlayerId(state: PilePoilState): string | null {
  if (state.phase === 'roundEnd' || state.phase === 'finished') return null
  return state.order[state.currentIndex] ?? null
}

/** Joueur qui passera après celui au tour, dans ce même tour (null : le tour se termine). */
export function upcomingPlayerId(state: PilePoilState): string | null {
  if (state.phase === 'roundEnd' || state.phase === 'finished') return null
  return state.order[state.currentIndex + 1] ?? null
}

export function startRun(state: PilePoilState): PilePoilState {
  if (state.phase !== 'waiting') return state
  return { ...state, phase: 'running' }
}

/** Essai interrompu (écran quitté pendant la mesure) : le joueur recommence. */
export function cancelRun(state: PilePoilState): PilePoilState {
  if (state.phase !== 'running') return state
  return { ...state, phase: 'waiting' }
}

export function normalizeElapsed(elapsedMs: number): number {
  return Math.round(elapsedMs / PILE_POIL_RESOLUTION_MS) * PILE_POIL_RESOLUTION_MS
}

/** Le Stop : un seul résultat par essai (hors `running`, l'état ne bouge pas). */
export function recordResult(state: PilePoilState, elapsedMs: number): PilePoilState {
  if (state.phase !== 'running') return state
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return state
  const player = state.order[state.currentIndex]
  if (player === undefined) return state
  const elapsed = normalizeElapsed(elapsedMs)
  return {
    ...state,
    results: [...state.results, { player, elapsedMs: elapsed, deltaMs: elapsed - state.target }],
    phase: 'between',
  }
}

/** « Au suivant » : le joueur suivant, ou le classement du tour si tout le monde a joué. */
export function nextPlayer(state: PilePoilState): PilePoilState {
  if (state.phase !== 'between') return state
  const next = state.currentIndex + 1
  if (next < state.order.length) return { ...state, currentIndex: next, phase: 'waiting' }
  return { ...state, phase: 'roundEnd' }
}

/** Le tour suivant commence au joueur qui suivait le premier du tour précédent. */
export function nextRound(state: PilePoilState): PilePoilState {
  if (state.phase !== 'roundEnd') return state
  const history = [...state.history, { target: state.target, results: state.results }]
  if (state.roundIndex + 1 >= state.settings.rounds) {
    return { ...state, history, results: [], phase: 'finished' }
  }
  const rng = rngFromState(state.rngState)
  const target = targetFor(state.settings, rng, state.target)
  return {
    ...state,
    history,
    roundIndex: state.roundIndex + 1,
    target,
    order: rotate(state.order, 1),
    currentIndex: 0,
    results: [],
    phase: 'waiting',
    rngState: rng.getState(),
  }
}

export type PilePoilRankedResult = PilePoilResult & {
  /** 1 = le plus près de la cible ; les ex æquo partagent leur rang. */
  rank: number
  bullseye: boolean
  /** Le plus loin du tour (ex æquo compris), puni. Un pile poil ne l'est jamais. */
  furthest: boolean
  /** Gorgées bues (ou points perdus) : `sipsForDelta` pour le plus loin, 0 sinon. */
  penalty: number
}

/** Classement d'un tour (ou provisoire), du plus près au plus loin ; égalité → ordre de passage. */
export function roundRanking(results: readonly PilePoilResult[]): PilePoilRankedResult[] {
  const gap = (result: PilePoilResult) => Math.abs(result.deltaMs)
  // Que des pile poil : personne n'est puni pour avoir été un poil moins pile qu'un autre.
  const worst = results.reduce((max, result) => (isBullseye(result.deltaMs) ? max : Math.max(max, gap(result))), -1)
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => gap(a.result) - gap(b.result) || a.index - b.index)
    .map(({ result }) => {
      const bullseye = isBullseye(result.deltaMs)
      const furthest = !bullseye && gap(result) === worst
      return {
        ...result,
        rank: 1 + results.filter((other) => gap(other) < gap(result)).length,
        bullseye,
        furthest,
        penalty: furthest ? sipsForDelta(result.deltaMs) : 0,
      }
    })
}

export type PilePoilStanding = {
  player: string
  /** Somme des |Δ| sur les tours joués. */
  totalGapMs: number
  bullseyes: number
  /** Total des punitions reçues en tant que plus loin (gorgées ou points). */
  penalties: number
  rank: number
  won: boolean
}

/** Classement cumulé de tours terminés, du plus petit écart au plus grand ; égalité → ordre de la table. */
export function standings(rounds: readonly PilePoilRound[], playerIds: readonly string[]): PilePoilStanding[] {
  const totals = new Map<string, { totalGapMs: number; bullseyes: number; penalties: number }>(
    playerIds.map((id) => [id, { totalGapMs: 0, bullseyes: 0, penalties: 0 }])
  )
  for (const round of rounds) {
    for (const ranked of roundRanking(round.results)) {
      const total = totals.get(ranked.player)
      if (!total) continue
      total.totalGapMs += Math.abs(ranked.deltaMs)
      if (ranked.bullseye) total.bullseyes += 1
      total.penalties += ranked.penalty
    }
  }
  const rows = playerIds.map((player, index) => {
    const total = totals.get(player) ?? { totalGapMs: 0, bullseyes: 0, penalties: 0 }
    return { player, index, ...total }
  })
  return rows
    .sort((a, b) => a.totalGapMs - b.totalGapMs || a.index - b.index)
    .map(({ index: _index, ...row }) => {
      const rank = 1 + rows.filter((other) => other.totalGapMs < row.totalGapMs).length
      return { ...row, rank, won: rank === 1 }
    })
}

/** Tours complets : l'historique, plus le tour qui vient de se terminer (`roundEnd`). */
export function completedRounds(state: PilePoilState): PilePoilRound[] {
  if (state.phase !== 'roundEnd') return state.history
  return [...state.history, { target: state.target, results: state.results }]
}

/** Classement cumulé des tours complets ; une fois la partie finie, c'est le classement final. */
export function finalRanking(state: PilePoilState): PilePoilStanding[] {
  return standings(completedRounds(state), state.playerIds)
}

/** Sans alcool : +5 par pile poil, moins les points perdus en étant le plus loin. */
export function softPoints(standing: Pick<PilePoilStanding, 'bullseyes' | 'penalties'>): number {
  return standing.bullseyes * PILE_POIL_BULLSEYE_REWARD - standing.penalties
}

// ─── Reprise (useResumableLocalGame) ─────────────────────────────────────────

export const PILE_POIL_SAVE_ID = 'pile-poil'
/** À incrémenter dès que la forme de PilePoilSave change : l'ancienne sauvegarde est jetée. */
export const PILE_POIL_SAVE_VERSION = 1

export type PilePoilSavePhase = 'waiting' | 'between' | 'roundEnd'

export type PilePoilSave = Omit<PilePoilState, 'phase'> & { phase: PilePoilSavePhase }

/**
 * État à sauvegarder. Un chrono en cours ne se reprend pas (l'essai est
 * rejoué) ; une partie finie ne laisse rien à reprendre : null.
 */
export function toPilePoilSave(state: PilePoilState): PilePoilSave | null {
  if (state.phase === 'finished') return null
  return {
    settings: { ...state.settings },
    playerIds: [...state.playerIds],
    roundIndex: state.roundIndex,
    target: state.target,
    order: [...state.order],
    currentIndex: state.currentIndex,
    results: state.results.map((result) => ({ ...result })),
    history: state.history.map((round) => ({ target: round.target, results: round.results.map((result) => ({ ...result })) })),
    phase: state.phase === 'running' ? 'waiting' : state.phase,
    rngState: state.rngState,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isIndex = (value: unknown, length: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length

function readSettings(value: unknown): PilePoilSettings | null {
  if (!isRecord(value)) return null
  const level = PILE_POIL_LEVELS.find((candidate) => candidate === value.level)
  const targetMode = PILE_POIL_TARGET_MODES.find((candidate) => candidate === value.targetMode)
  const rounds = PILE_POIL_ROUND_COUNTS.find((candidate) => candidate === value.rounds)
  if (!level || !targetMode || !rounds) return null
  return { level, targetMode, rounds }
}

function isTargetOf(settings: PilePoilSettings, target: unknown): target is number {
  if (settings.targetMode === 'fixed') return target === PILE_POIL_FIXED_TARGET_MS
  return PILE_POIL_VARIABLE_TARGETS_MS.some((candidate) => candidate === target)
}

function isPermutation(value: unknown, ids: readonly string[]): value is string[] {
  if (!Array.isArray(value) || value.length !== ids.length) return false
  const seen = new Set<string>()
  for (const id of value) {
    if (typeof id !== 'string' || !ids.includes(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}

/** Résultats rejoués dans l'ordre de passage ; l'écart est recalculé, jamais cru sur parole. */
function readResults(value: unknown, order: readonly string[], target: number): PilePoilResult[] | null {
  if (!Array.isArray(value) || value.length > order.length) return null
  const results: PilePoilResult[] = []
  for (let i = 0; i < value.length; i += 1) {
    const entry: unknown = value[i]
    if (!isRecord(entry) || entry.player !== order[i]) return null
    const elapsed = entry.elapsedMs
    if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) return null
    const elapsedMs = normalizeElapsed(elapsed)
    results.push({ player: order[i], elapsedMs, deltaMs: elapsedMs - target })
  }
  return results
}

function readHistory(value: unknown, settings: PilePoilSettings, playerIds: readonly string[], rounds: number): PilePoilRound[] | null {
  if (!Array.isArray(value) || value.length !== rounds) return null
  const history: PilePoilRound[] = []
  for (const entry of value as unknown[]) {
    if (!isRecord(entry) || !isTargetOf(settings, entry.target) || !Array.isArray(entry.results)) return null
    const players = entry.results.map((result: unknown) => (isRecord(result) ? result.player : null))
    if (!isPermutation(players, playerIds)) return null
    const results = readResults(entry.results, players, entry.target)
    if (!results) return null
    history.push({ target: entry.target, results })
  }
  return history
}

/**
 * Sauvegarde → état pour la table ACTUELLE (mêmes joueurs, ordre de la prop).
 * Null si illisible ou d'une autre table : partie neuve plutôt qu'un plantage.
 */
export function restorePilePoilSave(save: unknown, playerIds: readonly string[]): PilePoilState | null {
  if (!isRecord(save) || playerIds.length === 0) return null
  const settings = readSettings(save.settings)
  if (!settings) return null
  if (!isPermutation(save.playerIds, playerIds)) return null
  if (!isIndex(save.roundIndex, settings.rounds)) return null
  if (!isTargetOf(settings, save.target)) return null
  if (!isPermutation(save.order, playerIds)) return null
  if (!isIndex(save.currentIndex, playerIds.length)) return null
  const phase = save.phase
  if (phase !== 'waiting' && phase !== 'between' && phase !== 'roundEnd') return null
  const results = readResults(save.results, save.order, save.target)
  if (!results) return null
  const played = phase === 'waiting' ? save.currentIndex : phase === 'between' ? save.currentIndex + 1 : playerIds.length
  if (results.length !== played) return null
  if (phase === 'roundEnd' && save.currentIndex !== playerIds.length - 1) return null
  const history = readHistory(save.history, settings, playerIds, save.roundIndex)
  if (!history) return null
  const rngState = save.rngState
  if (typeof rngState !== 'number' || !Number.isInteger(rngState) || rngState < 0 || rngState > 0xffffffff) return null
  return {
    settings,
    playerIds: [...playerIds],
    roundIndex: save.roundIndex,
    target: save.target,
    order: [...save.order],
    currentIndex: save.currentIndex,
    results,
    history,
    phase,
    rngState,
  }
}

/**
 * Prédicat de `useResumableLocalGame` : la sauvegarde se relit pour CETTE
 * table. Ses réglages voyagent avec elle : le pré-lobby repart des réglages
 * par défaut à chaque montage (onglet rechargé, langue changée), et les
 * comparer effaçait sans prévenir une partie en Pro, en Variable ou en 3 ou
 * 8 tours. Lu sur une donnée du stockage, il ne lève jamais.
 */
export function isResumablePilePoilSave(save: unknown, playerIds: readonly string[]): boolean {
  return restorePilePoilSave(save, playerIds) !== null
}
