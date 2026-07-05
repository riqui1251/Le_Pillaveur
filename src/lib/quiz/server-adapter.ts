import {
  createQuizState,
  reduceQuiz,
  toQuizClientView,
  toQuizSpectatorView,
  QuizEngineError,
  QUIZ_DEFAULT_COUNT,
  QUIZ_MIN_PLAYERS,
  type QuizState,
} from './engine'
import { getQuizQuestions } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Grand Pillaveur (quiz) : sérialisation, mapping
 * HTTP → actions moteur, bots probabilistes, vues anti-triche. Consommé par
 * le registre `src/lib/online/game-adapters.ts`.
 */

export interface QuizRoomMember {
  userId: string
  user: { displayName: string }
}

const QUIZ_BOT_NAMES = ['Barnabé 🤖', 'Gépéto 🤖', 'Raoul 🤖', 'Suzette 🤖', 'Marcel 🤖']

/** Sièges vides comblés par des bots (solo lançable + rematch résilient). */
export function buildQuizState(
  members: QuizRoomMember[],
  lang: string | null | undefined,
  count?: number,
  seed?: string | number
): QuizState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  while (players.length < QUIZ_MIN_PLAYERS) {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: QUIZ_BOT_NAMES[botIndex % QUIZ_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  return createQuizState(
    players,
    getQuizQuestions(lang),
    count ?? QUIZ_DEFAULT_COUNT,
    seed ?? randomSeed()
  )
}

export function serializeQuizState(state: QuizState): string {
  return JSON.stringify(state)
}

export function parseQuizState(json: string | null): QuizState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as QuizState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, rematchVotes: raw.rematchVotes ?? [], answers: raw.answers ?? {} }
  } catch {
    return null
  }
}

export type QuizRoomActionInput =
  | { type: 'answer'; choice: number }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type QuizRoomActionResult = { ok: true; state: QuizState } | { ok: false; error: string }

export function applyQuizRoomAction(
  state: QuizState,
  userId: string,
  input: QuizRoomActionInput
): QuizRoomActionResult {
  try {
    switch (input.type) {
      case 'answer':
        return {
          ok: true,
          state: reduceQuiz(state, {
            type: 'ANSWER',
            playerId: userId,
            choice: input.choice,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceQuiz(state, {
            type: 'ADVANCE',
            claimedKey: input.phaseKey,
            now: Date.now(),
          }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceQuiz(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyQuizBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceQuiz(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof QuizEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markQuizPlayerLeft(
  state: QuizState,
  playerId: string,
  at: number
): QuizState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceQuiz(state, { type: 'LEAVE', playerId, at })
}

export function rejoinQuizPlayer(state: QuizState, playerId: string): QuizState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceQuiz(state, { type: 'REJOIN', playerId })
}

export function convertQuizPlayerToBot(state: QuizState, playerId: string): QuizState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
}

export function quizClientViewJson(state: QuizState, viewerId: string): string {
  return JSON.stringify(toQuizClientView(state, viewerId))
}

export function quizSpectatorViewJson(state: QuizState): string {
  return JSON.stringify(toQuizSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/** Probabilité de bonne réponse d'un bot selon la difficulté. */
const BOT_CORRECT_PROBA: Record<1 | 2 | 3, number> = { 1: 0.7, 2: 0.5, 3: 0.35 }

/**
 * Un tick fait répondre TOUS les bots retardataires (délai piloté par le
 * client arbitre — 3 à 8 s après la question, pour un rythme naturel).
 * Le hasard des réponses utilise Math.random (entrée « joueur »).
 */
export function applyQuizBotAction(state: QuizState): QuizRoomActionResult {
  try {
    if (state.phase !== 'question') return { ok: false, error: 'NOT_BOT_TURN' }
    const pending = state.players.filter((p) => p.isBot && !p.leftAt && !state.answers[p.id])
    if (pending.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
    const question = state.questions[state.qIdx]
    let next = state
    for (const bot of pending) {
      if (next.phase !== 'question') break
      const correct = Math.random() < BOT_CORRECT_PROBA[question.diff]
      const wrong = [0, 1, 2, 3].filter((c) => c !== question.answer)
      const choice = correct ? question.answer : wrong[Math.floor(Math.random() * wrong.length)]
      next = reduceQuiz(next, { type: 'ANSWER', playerId: bot.id, choice, now: Date.now() })
    }
    return { ok: true, state: next }
  } catch (e) {
    if (e instanceof QuizEngineError) return { ok: false, error: e.message }
    throw e
  }
}
