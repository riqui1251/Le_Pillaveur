import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * CROBARD (Pictionary apéro) — moteur PUR, serveur-autoritaire.
 *
 * Un dessinateur tourne à chaque manche (round-robin). Il choisit 1 mot
 * parmi 3 proposés, puis dessine (traits envoyés « complets » au
 * `pointerup` — cf. PartyCanvas) pendant que les autres tapent des
 * propositions. Premier bon devineur = gros score, suivants dégressif,
 * le dessinateur marque selon combien ont trouvé. Fin de manche anticipée
 * dès que tout le monde a trouvé, sinon au timeout.
 */

export const CROBARD_MIN_PLAYERS = 3
export const CROBARD_MAX_PLAYERS = 16
/** Compte à rebours d'échauffement au lancement. */
export const CROBARD_COUNTDOWN_MS = 5_000
/** Fenêtre pour choisir un mot parmi les 3 proposés. */
export const CROBARD_CHOOSING_MS = 10_000
/** Durée d'une manche de dessin. */
export const CROBARD_DRAWING_MS = 80_000
/**
 * Un bot ne peut pas dessiner → manche écourtée pour ne pas bloquer la
 * partie (même logique que le décrivant bot de Tabou Vocal).
 */
export const CROBARD_BOT_DRAWER_ROUND_MS = 5_000
/** Options de nombre de manches proposées au lobby. */
export const CROBARD_ROUNDS_OPTIONS = [6, 8, 10] as const
export const CROBARD_DEFAULT_ROUNDS = 8

/** Points du premier / deuxième / des suivants bons devineurs. */
export const CROBARD_POINTS_FIRST = 500
export const CROBARD_POINTS_SECOND = 300
export const CROBARD_POINTS_OTHER = 150
/** Points du dessinateur par bon devineur. */
export const CROBARD_DRAWER_POINTS_PER_GUESSER = 100

export type Stroke = {
  /** [x0, y0, x1, y1, …] normalisés [0,1] — indépendants de la résolution. */
  points: number[]
  color: string
  width: number
}

/** Plafonds anti-abus d'un dessin (partagés Crobard / Téléphone Dessiné). */
export const CANVAS_MAX_STROKES = 400
export const CANVAS_MAX_POINTS_PER_STROKE = 2_000

/** Valide/normalise UN trait venu du client — null si inexploitable. */
export function sanitizeStroke(raw: unknown): Stroke | null {
  const s = raw as Partial<Stroke> | null
  if (!s || !Array.isArray(s.points)) return null
  const points: number[] = []
  const max = Math.min(s.points.length, CANVAS_MAX_POINTS_PER_STROKE)
  for (let i = 0; i + 1 < max; i += 2) {
    const x = Number(s.points[i])
    const y = Number(s.points[i + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)))
  }
  if (points.length < 4) return null
  const width = Number(s.width)
  return {
    points,
    color: typeof s.color === 'string' ? s.color.slice(0, 24) : '#020617',
    width: Number.isFinite(width) ? Math.min(24, Math.max(1, width)) : 6,
  }
}

/** Valide/normalise un dessin complet (traits invalides écartés, plafonné). */
export function sanitizeStrokes(raw: unknown): Stroke[] {
  if (!Array.isArray(raw)) return []
  const out: Stroke[] = []
  for (const item of raw.slice(0, CANVAS_MAX_STROKES)) {
    const stroke = sanitizeStroke(item)
    if (stroke) out.push(stroke)
  }
  return out
}

export type CrobardPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  score: number
}

export type CrobardPhase = 'countdown' | 'choosing' | 'drawing' | 'roundEnd' | 'finished'

export type CrobardState = TimedPhaseState & {
  version: number
  phase: CrobardPhase
  players: CrobardPlayer[]
  /** Ordre de passage des dessinateurs (mélangé une fois à la création). */
  drawerOrder: string[]
  drawerIdx: number
  drawerId: string
  /** SECRET — 3 mots proposés, seul le dessinateur les voit, pendant `choosing`. */
  wordChoices: string[] | null
  /** SECRET — le mot choisi, seul le dessinateur le voit avant le bilan. */
  word: string | null
  /** PUBLIC dès qu'un trait est tracé — c'est le principe même du jeu. */
  strokes: Stroke[]
  /** PUBLIC — qui a déjà trouvé cette manche (ordre = rang de score), jamais LE mot. */
  correctGuessers: string[]
  allWords: string[]
  remainingWords: string[]
  round: number
  totalRounds: number
  /** Le mot de la manche qui vient de se terminer — devient public au bilan. */
  lastRoundWord: string | null
  winnerId: string | null
  rematchVotes: string[]
  /** SECRET serveur. */
  rngState: number
}

export type CrobardAction =
  | { type: 'CHOOSE_WORD'; playerId: string; index: number; now: number }
  | { type: 'DRAW_STROKE'; playerId: string; stroke: Stroke }
  | { type: 'CLEAR'; playerId: string }
  | { type: 'GUESS'; playerId: string; text: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class CrobardEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'CrobardEngineError'
  }
}

export type CrobardInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function crobardActive(state: CrobardState): CrobardPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Distance de Levenshtein (DP classique) — pour le feedback « proche ! ». */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i += 1) {
    let prevDiag = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1])
      prevDiag = tmp
    }
  }
  return dp[n]
}

/** Tire `count` mots distincts sans répétition ; réamorce la file si épuisée. */
function pickWords(
  rng: SeededRng,
  remaining: string[],
  allWords: string[],
  count: number
): { picked: string[]; remaining: string[] } {
  let queue = remaining
  const picked: string[] = []
  for (let i = 0; i < count; i += 1) {
    if (queue.length === 0) queue = rng.shuffle(allWords)
    picked.push(queue[0])
    queue = queue.slice(1)
  }
  return { picked, remaining: queue }
}

/** Un bot ne peut pas dessiner à voix... à l'écran → manche écourtée. */
function roundDurationFor(state: CrobardState, drawerId: string): number {
  const drawer = state.players.find((p) => p.id === drawerId)
  return drawer?.isBot ? CROBARD_BOT_DRAWER_ROUND_MS : CROBARD_DRAWING_MS
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createCrobardState(
  players: CrobardInitialPlayer[],
  words: string[],
  seed: string | number,
  now: number = Date.now(),
  totalRounds: number = CROBARD_DEFAULT_ROUNDS
): CrobardState {
  if (players.length < CROBARD_MIN_PLAYERS) throw new CrobardEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > CROBARD_MAX_PLAYERS) throw new CrobardEngineError('TOO_MANY_PLAYERS')
  if (words.length < 3) throw new CrobardEngineError('NOT_ENOUGH_WORDS')
  if (!Number.isInteger(totalRounds) || totalRounds < 1) {
    throw new CrobardEngineError('INVALID_TOTAL_ROUNDS')
  }

  const rng: SeededRng = createRng(seed)
  const drawerOrder = rng.shuffle(players.map((p) => p.id))
  const shuffledWords = rng.shuffle(words)

  const withScores: CrobardPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    score: 0,
  }))

  return {
    version: 1,
    ...enterPhase(0, 'countdown', CROBARD_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withScores,
    drawerOrder,
    drawerIdx: 0,
    drawerId: drawerOrder[0],
    wordChoices: null,
    word: null,
    strokes: [],
    correctGuessers: [],
    allWords: words,
    remainingWords: shuffledWords,
    round: 1,
    totalRounds,
    lastRoundWord: null,
    winnerId: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

function startDrawing(state: CrobardState, word: string, now: number): CrobardState {
  return {
    ...state,
    word,
    wordChoices: null,
    strokes: [],
    correctGuessers: [],
    ...enterPhase(state.phaseSeq, 'drawing', roundDurationFor(state, state.drawerId), now),
    phase: 'drawing',
    version: state.version + 1,
  }
}

function endRound(state: CrobardState, now: number): CrobardState {
  return {
    ...state,
    lastRoundWord: state.word,
    word: null,
    ...enterPhase(state.phaseSeq, 'roundEnd', null, now),
    phase: 'roundEnd',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceCrobard(state: CrobardState, action: CrobardAction): CrobardState {
  switch (action.type) {
    case 'CHOOSE_WORD': {
      if (state.phase !== 'choosing') throw new CrobardEngineError('NOT_CHOOSING_PHASE')
      if (action.playerId !== state.drawerId) throw new CrobardEngineError('NOT_DRAWER')
      if (!state.wordChoices || !state.wordChoices[action.index]) {
        throw new CrobardEngineError('INVALID_CHOICE')
      }
      return startDrawing(state, state.wordChoices[action.index], action.now)
    }

    case 'DRAW_STROKE': {
      if (state.phase !== 'drawing') throw new CrobardEngineError('NOT_DRAWING_PHASE')
      if (action.playerId !== state.drawerId) throw new CrobardEngineError('NOT_DRAWER')
      const stroke = sanitizeStroke(action.stroke)
      if (!stroke) throw new CrobardEngineError('INVALID_STROKE')
      if (state.strokes.length >= CANVAS_MAX_STROKES) throw new CrobardEngineError('TOO_MANY_STROKES')
      return {
        ...state,
        strokes: [...state.strokes, stroke],
        version: state.version + 1,
      }
    }

    case 'CLEAR': {
      if (state.phase !== 'drawing') throw new CrobardEngineError('NOT_DRAWING_PHASE')
      if (action.playerId !== state.drawerId) throw new CrobardEngineError('NOT_DRAWER')
      return { ...state, strokes: [], version: state.version + 1 }
    }

    case 'GUESS': {
      if (state.phase !== 'drawing') throw new CrobardEngineError('NOT_DRAWING_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new CrobardEngineError('UNKNOWN_PLAYER')
      if (player.id === state.drawerId) throw new CrobardEngineError('DRAWER_CANNOT_GUESS')
      if (state.correctGuessers.includes(player.id)) throw new CrobardEngineError('ALREADY_GUESSED')

      const guess = normalize(action.text)
      const word = normalize(state.word ?? '')
      if (guess.length > 0 && guess === word) {
        const place = state.correctGuessers.length
        const points = place === 0 ? CROBARD_POINTS_FIRST : place === 1 ? CROBARD_POINTS_SECOND : CROBARD_POINTS_OTHER
        const correctGuessers = [...state.correctGuessers, player.id]
        const players = state.players.map((p) => {
          if (p.id === player.id) return { ...p, score: p.score + points }
          if (p.id === state.drawerId) return { ...p, score: p.score + CROBARD_DRAWER_POINTS_PER_GUESSER }
          return p
        })
        let next: CrobardState = { ...state, correctGuessers, players, version: state.version + 1 }
        const remainingGuessers = crobardActive(next).filter((p) => p.id !== next.drawerId)
        if (correctGuessers.length >= remainingGuessers.length) {
          next = endRound(next, action.now)
        }
        return next
      }
      if (guess.length > 0 && levenshtein(guess, word) <= 1) throw new CrobardEngineError('GUESS_CLOSE')
      throw new CrobardEngineError('GUESS_WRONG')
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new CrobardEngineError(check.error)
      if (state.phase === 'countdown') {
        const rng = rngFromState(state.rngState)
        const { picked, remaining } = pickWords(rng, state.remainingWords, state.allWords, 3)
        return {
          ...state,
          wordChoices: picked,
          remainingWords: remaining,
          ...enterPhase(state.phaseSeq, 'choosing', CROBARD_CHOOSING_MS, action.now),
          phase: 'choosing',
          rngState: rng.getState(),
          version: state.version + 1,
        }
      }
      if (state.phase === 'choosing') {
        const word = state.wordChoices?.[0]
        if (!word) throw new CrobardEngineError('NO_WORD_CHOICES')
        return startDrawing(state, word, action.now)
      }
      if (state.phase === 'drawing') {
        return endRound(state, action.now)
      }
      throw new CrobardEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'roundEnd') throw new CrobardEngineError('NOT_ROUND_END')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new CrobardEngineError('UNKNOWN_PLAYER')
      }
      if (state.round >= state.totalRounds) {
        const winner = [...state.players].sort((a, b) => b.score - a.score)[0]
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          winnerId: winner?.id ?? null,
          version: state.version + 1,
        }
      }
      const rng = rngFromState(state.rngState)
      const { picked, remaining } = pickWords(rng, state.remainingWords, state.allWords, 3)
      const drawerIdx = (state.drawerIdx + 1) % state.drawerOrder.length
      return {
        ...state,
        drawerIdx,
        drawerId: state.drawerOrder[drawerIdx],
        wordChoices: picked,
        remainingWords: remaining,
        word: null,
        strokes: [],
        correctGuessers: [],
        lastRoundWord: null,
        round: state.round + 1,
        ...enterPhase(state.phaseSeq, 'choosing', CROBARD_CHOOSING_MS, action.now),
        phase: 'choosing',
        rngState: rng.getState(),
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new CrobardEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new CrobardEngineError('UNKNOWN_PLAYER')
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
        throw new CrobardEngineError('CANNOT_REJOIN')
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
      if (expired.length === 0) throw new CrobardEngineError('NOTHING_TO_REPLACE')
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
      throw new CrobardEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * En `choosing`, le dessinateur choisit son mot. En `drawing`, personne n'a
 * de « tour » unique (plusieurs devineurs agissent en parallèle) → null. En
 * `roundEnd`, le premier joueur encore en jeu mène le « continuer ».
 */
export function currentCrobardActorId(state: CrobardState): string | null {
  if (state.phase === 'choosing') return state.drawerId
  if (state.phase === 'roundEnd') return crobardActive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type CrobardPlayerView = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  score: number
}

export type CrobardClientView = Omit<
  CrobardState,
  'rngState' | 'players' | 'wordChoices' | 'word' | 'allWords' | 'remainingWords'
> & {
  players: CrobardPlayerView[]
  phaseKey: string
  /** true si le viewer est le dessinateur de la manche courante. */
  isDrawer: boolean
  /** Les 3 mots à choisir — visible SEULEMENT du dessinateur, pendant `choosing`. */
  wordChoices: string[] | null
  /** Le mot en cours — visible SEULEMENT du dessinateur, pendant `drawing`. */
  word: string | null
}

/**
 * Vue PAR JOUEUR : seul le dessinateur voit `wordChoices`/`word`. Les traits
 * (`strokes`) restent PUBLICS tels quels — c'est le principe du jeu.
 * `lastRoundWord` (posé au bilan) est déjà public dans `CrobardState`.
 */
export function toCrobardClientView(state: CrobardState, viewerId: string): CrobardClientView {
  const { rngState: _rng, players, wordChoices, word, allWords, remainingWords, ...rest } = state
  void _rng
  void allWords
  void remainingWords
  const isDrawer = viewerId === state.drawerId
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isDrawer,
    wordChoices: isDrawer && state.phase === 'choosing' ? wordChoices : null,
    word: isDrawer && state.phase === 'drawing' ? word : null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      score: p.score,
    })),
  }
}

/**
 * Vue SPECTATEUR NEUTRE (TV) : ne voit JAMAIS le mot ni les choix — les
 * traits restent publics (c'est le clou du spectacle sur grand écran).
 */
export function toCrobardSpectatorView(state: CrobardState): CrobardClientView {
  const { rngState: _rng, players, wordChoices: _wc, word: _w, allWords, remainingWords, ...rest } = state
  void _rng
  void _wc
  void _w
  void allWords
  void remainingWords
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isDrawer: false,
    wordChoices: null,
    word: null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      score: p.score,
    })),
  }
}
