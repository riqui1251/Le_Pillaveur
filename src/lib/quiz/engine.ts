import { createRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * LE GRAND PILLAVEUR (quiz buzzer) — moteur PUR, serveur-autoritaire.
 *
 * Une question QCM s'affiche (téléphones = buzzers, TV = grand écran), chacun
 * répond en secret dans le temps imparti. Bonne réponse = points (base +
 * bonus de vitesse), mauvaise ou trop lent = gorgées. Podium à la fin, le
 * dernier finit son verre.
 *
 * ANTI-TRICHE : la bonne réponse ne quitte JAMAIS le serveur pendant la
 * phase question (les vues ne portent que l'énoncé + les choix) ; les
 * réponses sont horodatées CÔTÉ SERVEUR à la réception (bonus de vitesse
 * infalsifiable) ; une seule réponse acceptée par joueur.
 */

export const QUIZ_QUESTION_MS = 15_000
export const QUIZ_REVEAL_MS = 6_000
export const QUIZ_POINTS_BASE = 100
export const QUIZ_POINTS_SPEED_MAX = 100
export const QUIZ_SIPS_WRONG = 2
export const QUIZ_COUNTS = [10, 15, 20] as const
export const QUIZ_DEFAULT_COUNT = 10
export const QUIZ_MIN_PLAYERS = 2
export const QUIZ_MAX_PLAYERS = 12

export type QuizCategory = 'culture' | 'bouffe' | 'musique' | 'sport' | 'ecrans' | 'fete'

export type QuizQuestion = {
  id: string
  cat: QuizCategory
  /** 1 facile → 3 difficile (sert aussi à la proba de réussite des bots). */
  diff: 1 | 2 | 3
  q: string
  choices: [string, string, string, string]
  /** Index de la bonne réponse — SECRET pendant la phase question. */
  answer: number
}

export type QuizPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  score: number
  /** Bonnes réponses d'affilée (🔥 à partir de 3). */
  streak: number
  /** Gorgées cumulées. */
  sips: number
}

/** SECRET — réponse en attente (horodatée serveur). */
export type QuizAnswer = { choice: number; answeredAt: number }

/** Résultat PUBLIC d'une question (au reveal). */
export type QuizQuestionResult = {
  questionId: string
  /** Bonne réponse — publique seulement une fois la question fermée. */
  answer: number
  perPlayer: Record<
    string,
    { choice: number | null; correct: boolean; points: number; sips: number }
  >
}

export type QuizPhase = 'question' | 'reveal' | 'finished'

export type QuizState = TimedPhaseState & {
  version: number
  phase: QuizPhase
  players: QuizPlayer[]
  /** SECRET — questions tirées (avec réponses) ; jamais envoyées telles quelles. */
  questions: QuizQuestion[]
  qIdx: number
  /** Début de la question courante (bonus de vitesse). */
  questionStartAt: number
  /** SECRET — réponses en cours. */
  answers: Record<string, QuizAnswer>
  lastResult: QuizQuestionResult | null
  rematchVotes: string[]
  rngState: number
}

export type QuizAction =
  | { type: 'ANSWER'; playerId: string; choice: number; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class QuizEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'QuizEngineError'
  }
}

export type QuizInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Création ────────────────────────────────────────────────────────────────

export function createQuizState(
  players: QuizInitialPlayer[],
  pool: QuizQuestion[],
  count: number,
  seed: string | number,
  now: number = Date.now()
): QuizState {
  if (players.length < QUIZ_MIN_PLAYERS) throw new QuizEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > QUIZ_MAX_PLAYERS) throw new QuizEngineError('TOO_MANY_PLAYERS')
  if (pool.length === 0) throw new QuizEngineError('NO_QUESTIONS')

  const rng = createRng(seed)
  const drawn = rng.shuffle(pool).slice(0, Math.min(count, pool.length))

  return {
    version: 1,
    ...enterPhase(0, 'question', QUIZ_QUESTION_MS, now),
    phase: 'question',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      leftAt: null,
      score: 0,
      streak: 0,
      sips: 0,
    })),
    questions: drawn,
    qIdx: 0,
    questionStartAt: now,
    answers: {},
    lastResult: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Ferme la question : points (base + bonus vitesse serveur), gorgées, streaks. */
function resolveQuestion(state: QuizState, now: number): QuizState {
  const question = state.questions[state.qIdx]
  const perPlayer: QuizQuestionResult['perPlayer'] = {}

  const players = state.players.map((p) => {
    const a = state.answers[p.id]
    const correct = a ? a.choice === question.answer : false
    let points = 0
    if (correct && a) {
      const elapsed = Math.max(0, a.answeredAt - state.questionStartAt)
      const ratio = Math.max(0, (QUIZ_QUESTION_MS - elapsed) / QUIZ_QUESTION_MS)
      points = QUIZ_POINTS_BASE + Math.round(QUIZ_POINTS_SPEED_MAX * ratio)
    }
    const sips = correct ? 0 : QUIZ_SIPS_WRONG
    perPlayer[p.id] = { choice: a?.choice ?? null, correct, points, sips }
    return {
      ...p,
      score: p.score + points,
      streak: correct ? p.streak + 1 : 0,
      sips: p.sips + sips,
    }
  })

  return {
    ...state,
    players,
    answers: {},
    lastResult: { questionId: question.id, answer: question.answer, perPlayer },
    ...enterPhase(state.phaseSeq, 'reveal', QUIZ_REVEAL_MS, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

/** Après le reveal : question suivante ou podium final. */
function advanceFromReveal(state: QuizState, now: number): QuizState {
  const nextIdx = state.qIdx + 1
  if (nextIdx >= state.questions.length) {
    return {
      ...state,
      phase: 'finished',
      phaseSeq: state.phaseSeq + 1,
      phaseEndsAt: null,
      version: state.version + 1,
    }
  }
  return {
    ...state,
    qIdx: nextIdx,
    questionStartAt: now,
    answers: {},
    lastResult: null,
    ...enterPhase(state.phaseSeq, 'question', QUIZ_QUESTION_MS, now),
    phase: 'question',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceQuiz(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'ANSWER': {
      if (state.phase !== 'question') throw new QuizEngineError('NOT_QUESTION_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player) throw new QuizEngineError('UNKNOWN_PLAYER')
      if (state.answers[player.id]) throw new QuizEngineError('ALREADY_ANSWERED')
      if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice > 3) {
        throw new QuizEngineError('INVALID_CHOICE')
      }
      const answers = {
        ...state.answers,
        [player.id]: { choice: action.choice, answeredAt: action.now },
      }
      const next = { ...state, answers, version: state.version + 1 }
      // Tous les joueurs PRÉSENTS ont répondu → résolution anticipée.
      const expected = state.players.filter((p) => !p.leftAt)
      if (expected.every((p) => answers[p.id])) return resolveQuestion(next, action.now)
      return next
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new QuizEngineError(check.error)
      if (state.phase === 'question') return resolveQuestion(state, action.now)
      if (state.phase === 'reveal') return advanceFromReveal(state, action.now)
      throw new QuizEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      // Passage anticipé du reveal (tap impatient) — n'importe quel joueur.
      if (state.phase !== 'reveal') throw new QuizEngineError('NOT_REVEAL')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new QuizEngineError('UNKNOWN_PLAYER')
      }
      return advanceFromReveal(state, action.now)
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new QuizEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new QuizEngineError('UNKNOWN_PLAYER')
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
      if (!player || player.isBot || !player.leftAt) throw new QuizEngineError('CANNOT_REJOIN')
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
      if (expired.length === 0) throw new QuizEngineError('NOTHING_TO_REPLACE')
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
      throw new QuizEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

/** Réponses simultanées → pas d'acteur unique (les échéances font l'arbitre). */
export function currentQuizActorId(): string | null {
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

/** Question SANS la réponse (seule forme qui quitte le serveur en phase question). */
export type QuizQuestionView = Omit<QuizQuestion, 'answer'>

export type QuizPlayerView = QuizPlayer & { hasAnswered: boolean }

export type QuizClientView = Omit<
  QuizState,
  'rngState' | 'questions' | 'answers' | 'players'
> & {
  players: QuizPlayerView[]
  phaseKey: string
  questionCount: number
  /** Question courante (énoncé + choix), null une fois la partie finie. */
  currentQuestion: QuizQuestionView | null
  /** Mon choix (feedback « réponse envoyée ») — null pour les autres/spectateur. */
  myChoice: number | null
}

export function toQuizClientView(state: QuizState, viewerId: string): QuizClientView {
  const { rngState: _rng, questions, answers, players, ...rest } = state
  void _rng
  const current = state.phase === 'finished' ? null : questions[state.qIdx] ?? null
  return {
    ...rest,
    phaseKey: phaseKey(state),
    questionCount: questions.length,
    currentQuestion: current
      ? { id: current.id, cat: current.cat, diff: current.diff, q: current.q, choices: current.choices }
      : null,
    myChoice: answers[viewerId]?.choice ?? null,
    players: players.map((p) => ({ ...p, hasAnswered: Boolean(answers[p.id]) })),
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : mêmes infos publiques, aucun choix personnel. */
export function toQuizSpectatorView(state: QuizState): QuizClientView {
  return toQuizClientView(state, '')
}
