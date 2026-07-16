import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * TABOU VOCAL (mime/description en équipes) — moteur PUR, serveur-autoritaire.
 *
 * 2 équipes, un décrivant tourne à chaque manche (alternance stricte
 * d'équipe). Pendant une manche chronométrée (60 s), PLUSIEURS mots
 * défilent dans la MÊME phase serveur (pas une transition par mot) : un
 * coéquipier clique FOUND (mot trouvé, +1 point équipe), le décrivant
 * clique PASS (mot passé, 0 point), un adversaire clique TABOO_CALLED (mot
 * tabou grillé, 0 point) — chaque clic tire immédiatement le mot suivant.
 * Réutilise le système d'équipes de Toucher-Coulé ('A' | 'B').
 */

export const TABOU_MIN_PLAYERS = 4
export const TABOU_MAX_PLAYERS = 16
/** Compte à rebours d'échauffement au lancement. */
export const TABOU_COUNTDOWN_MS = 5_000
/** Durée d'une manche de description. */
export const TABOU_ROUND_MS = 60_000
/**
 * Durée écourtée quand le décrivant tiré au sort est un bot (un bot ne
 * peut pas décrire un mot à voix haute) — la manche se résout d'elle-même
 * au bout de quelques secondes plutôt que de bloquer la partie 60 s.
 */
export const TABOU_BOT_DESCRIBER_ROUND_MS = 5_000
/** Options de score cible proposées au lobby. */
export const TABOU_TARGET_SCORE_OPTIONS = [15, 20, 25] as const
export const TABOU_DEFAULT_TARGET_SCORE = 20

export type TabouTeam = 'A' | 'B'

export type TabouPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  team: TabouTeam
}

/** Une entrée de contenu — SECRET tant qu'elle n'est pas revenue au bilan de manche. */
export type TabouEntry = {
  word: string
  taboo: [string, string, string, string]
  diff: 1 | 2 | 3
}

export type TabouRoundStats = { found: number; passed: number; taboo: number }

export type TabouPhase = 'countdown' | 'describing' | 'roundEnd' | 'finished'

export type TabouState = TimedPhaseState & {
  version: number
  phase: TabouPhase
  players: TabouPlayer[]
  /** Ordre de passage des décrivants — alterne strictement d'équipe (A,B,A,B…). */
  describerOrder: string[]
  describerIdx: number
  describerId: string
  /** SECRET — seul le décrivant le voit tant que la manche est en cours. */
  currentWord: TabouEntry | null
  /** Pool complet de la partie (pour retirage sans répétition). */
  allWords: TabouEntry[]
  /** File de tirage courante (sans répétition tant qu'elle n'est pas épuisée). */
  remainingWords: TabouEntry[]
  roundStats: TabouRoundStats
  /** Le mot en cours au moment où le temps s'écoule — devient public au bilan. */
  lastRoundWord: TabouEntry | null
  scores: { A: number; B: number }
  targetScore: number
  round: number
  winnerTeam: TabouTeam | null
  rematchVotes: string[]
  /** SECRET serveur. */
  rngState: number
}

export type TabouAction =
  | { type: 'FOUND'; playerId: string; now: number }
  | { type: 'PASS'; playerId: string; now: number }
  | { type: 'TABOO_CALLED'; playerId: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class TabouEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'TabouEngineError'
  }
}

export type TabouInitialPlayer = { id: string; name: string; isBot?: boolean; team: TabouTeam }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function tabouActive(state: TabouState): TabouPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

/** Alterne strictement d'équipe (A,B,A,B…) en respectant l'ordre d'inscription de chaque équipe. */
function buildDescriberOrder(players: TabouInitialPlayer[]): string[] {
  const a = players.filter((p) => p.team === 'A').map((p) => p.id)
  const b = players.filter((p) => p.team === 'B').map((p) => p.id)
  const order: string[] = []
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    if (a[i]) order.push(a[i])
    if (b[i]) order.push(b[i])
  }
  return order
}

/** Un bot ne peut pas décrire à voix haute → manche écourtée pour ne pas bloquer la partie. */
function roundDurationFor(state: TabouState, describerId: string): number {
  const describer = state.players.find((p) => p.id === describerId)
  return describer?.isBot ? TABOU_BOT_DESCRIBER_ROUND_MS : TABOU_ROUND_MS
}

/** Tire le prochain mot sans répétition ; réamorce la file si épuisée. */
function pickWord(
  rng: SeededRng,
  remaining: TabouEntry[],
  allWords: TabouEntry[]
): { word: TabouEntry; remaining: TabouEntry[] } {
  const queue = remaining.length > 0 ? remaining : rng.shuffle(allWords)
  return { word: queue[0], remaining: queue.slice(1) }
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createTabouState(
  players: TabouInitialPlayer[],
  words: TabouEntry[],
  seed: string | number,
  now: number = Date.now(),
  targetScore: number = TABOU_DEFAULT_TARGET_SCORE
): TabouState {
  if (players.length < TABOU_MIN_PLAYERS) throw new TabouEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > TABOU_MAX_PLAYERS) throw new TabouEngineError('TOO_MANY_PLAYERS')
  if (words.length === 0) throw new TabouEngineError('NO_WORDS')
  const countA = players.filter((p) => p.team === 'A').length
  const countB = players.filter((p) => p.team === 'B').length
  if (countA < 2 || countB < 2) throw new TabouEngineError('UNBALANCED_TEAMS')
  if (!Number.isInteger(targetScore) || targetScore < 1) {
    throw new TabouEngineError('INVALID_TARGET_SCORE')
  }

  const rng: SeededRng = createRng(seed)
  const shuffled = rng.shuffle(words)
  const currentWord = shuffled[0]
  const remainingWords = shuffled.slice(1)
  const describerOrder = buildDescriberOrder(players)

  const withTeams: TabouPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    team: p.team,
  }))

  return {
    version: 1,
    ...enterPhase(0, 'countdown', TABOU_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withTeams,
    describerOrder,
    describerIdx: 0,
    describerId: describerOrder[0],
    currentWord,
    allWords: words,
    remainingWords,
    roundStats: { found: 0, passed: 0, taboo: 0 },
    lastRoundWord: null,
    scores: { A: 0, B: 0 },
    targetScore,
    round: 1,
    winnerTeam: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Tire le mot suivant dans la manche courante, SANS changer de phase. */
function drawNextWord(state: TabouState): TabouState {
  const rng = rngFromState(state.rngState)
  const { word, remaining } = pickWord(rng, state.remainingWords, state.allWords)
  return {
    ...state,
    currentWord: word,
    remainingWords: remaining,
    rngState: rng.getState(),
    version: state.version + 1,
  }
}

function endRound(state: TabouState, now: number): TabouState {
  return {
    ...state,
    lastRoundWord: state.currentWord,
    ...enterPhase(state.phaseSeq, 'roundEnd', null, now),
    phase: 'roundEnd',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceTabou(state: TabouState, action: TabouAction): TabouState {
  switch (action.type) {
    case 'FOUND': {
      if (state.phase !== 'describing') throw new TabouEngineError('NOT_DESCRIBING_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new TabouEngineError('UNKNOWN_PLAYER')
      const describer = state.players.find((p) => p.id === state.describerId)!
      if (player.id === describer.id) throw new TabouEngineError('DESCRIBER_CANNOT_FOUND')
      if (player.team !== describer.team) throw new TabouEngineError('NOT_TEAMMATE')
      const scores = { ...state.scores, [describer.team]: state.scores[describer.team] + 1 }
      return drawNextWord({
        ...state,
        scores,
        roundStats: { ...state.roundStats, found: state.roundStats.found + 1 },
      })
    }

    case 'PASS': {
      if (state.phase !== 'describing') throw new TabouEngineError('NOT_DESCRIBING_PHASE')
      if (action.playerId !== state.describerId) throw new TabouEngineError('NOT_DESCRIBER')
      return drawNextWord({
        ...state,
        roundStats: { ...state.roundStats, passed: state.roundStats.passed + 1 },
      })
    }

    case 'TABOO_CALLED': {
      if (state.phase !== 'describing') throw new TabouEngineError('NOT_DESCRIBING_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new TabouEngineError('UNKNOWN_PLAYER')
      const describer = state.players.find((p) => p.id === state.describerId)!
      if (player.team === describer.team) throw new TabouEngineError('NOT_OPPONENT')
      return drawNextWord({
        ...state,
        roundStats: { ...state.roundStats, taboo: state.roundStats.taboo + 1 },
      })
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new TabouEngineError(check.error)
      if (state.phase === 'countdown') {
        return {
          ...state,
          ...enterPhase(
            state.phaseSeq,
            'describing',
            roundDurationFor(state, state.describerId),
            action.now
          ),
          phase: 'describing',
          version: state.version + 1,
        }
      }
      if (state.phase === 'describing') {
        return endRound(state, action.now)
      }
      throw new TabouEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'roundEnd') throw new TabouEngineError('NOT_ROUND_END')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new TabouEngineError('UNKNOWN_PLAYER')
      }
      if (state.scores.A >= state.targetScore || state.scores.B >= state.targetScore) {
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          winnerTeam: state.scores.A > state.scores.B ? 'A' : 'B',
          version: state.version + 1,
        }
      }
      const rng = rngFromState(state.rngState)
      const { word, remaining } = pickWord(rng, state.remainingWords, state.allWords)
      const describerIdx = (state.describerIdx + 1) % state.describerOrder.length
      const describerId = state.describerOrder[describerIdx]
      return {
        ...state,
        describerIdx,
        describerId,
        currentWord: word,
        remainingWords: remaining,
        roundStats: { found: 0, passed: 0, taboo: 0 },
        lastRoundWord: null,
        round: state.round + 1,
        ...enterPhase(state.phaseSeq, 'describing', roundDurationFor(state, describerId), action.now),
        phase: 'describing',
        rngState: rng.getState(),
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new TabouEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new TabouEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) {
        throw new TabouEngineError('CANNOT_REJOIN')
      }
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new TabouEngineError('NOTHING_TO_REPLACE')
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
      throw new TabouEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * En `describing`, le décrivant est l'acteur mis en avant (notification
 * « à toi de faire deviner »). En `roundEnd`, le premier joueur encore en
 * jeu mène le « continuer ». Sinon (countdown/finished), pas d'acteur unique.
 */
export function currentTabouActorId(state: TabouState): string | null {
  if (state.phase === 'describing') return state.describerId
  if (state.phase === 'roundEnd') return tabouActive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type TabouPlayerView = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  team: TabouTeam
}

export type TabouClientView = Omit<
  TabouState,
  'rngState' | 'players' | 'currentWord' | 'allWords' | 'remainingWords'
> & {
  players: TabouPlayerView[]
  phaseKey: string
  /** true si le viewer est le décrivant de la manche courante. */
  isDescriber: boolean
  /** Le mot + tabous en cours — visible SEULEMENT du décrivant, pendant `describing`. */
  currentWord: TabouEntry | null
}

/**
 * Vue PAR JOUEUR : seul le décrivant voit `currentWord` pendant la manche.
 * `lastRoundWord` (posé au bilan) est déjà public dans `TabouState` — repris
 * tel quel via `...rest`, aucun traitement spécial requis.
 */
export function toTabouClientView(state: TabouState, viewerId: string): TabouClientView {
  const { rngState: _rng, players, currentWord, allWords, remainingWords, ...rest } = state
  void _rng
  void allWords
  void remainingWords
  const isDescriber = viewerId === state.describerId
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isDescriber,
    currentWord: isDescriber && state.phase === 'describing' ? currentWord : null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      team: p.team,
    })),
  }
}

/**
 * Vue SPECTATEUR NEUTRE (TV) : ne voit JAMAIS le mot en cours, même au
 * bilan de manche affiché en direct — seul `lastRoundWord` (déjà public à
 * `roundEnd`) peut apparaître, via `...rest`.
 */
export function toTabouSpectatorView(state: TabouState): TabouClientView {
  const { rngState: _rng, players, currentWord: _currentWord, allWords, remainingWords, ...rest } = state
  void _rng
  void _currentWord
  void allWords
  void remainingWords
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isDescriber: false,
    currentWord: null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      team: p.team,
    })),
  }
}
