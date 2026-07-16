import {
  createPbcState,
  currentPbcActorId,
  reducePbc,
  toPbcClientView,
  toPbcSpectatorView,
  PbcEngineError,
  PBC_DEFAULT_ROUNDS,
  type PbcState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { censorChatMessage } from '@/lib/chat-moderation'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Petit Bac : sérialisation, mapping HTTP → actions
 * moteur, vues anti-triche. PAS de bots de complément — le jeu repose sur
 * des réponses tapées par des humains (les bots n'existent qu'en
 * remplacement d'un déserteur, et déposent copie blanche).
 */

export interface PbcRoomMember {
  userId: string
  user: { displayName: string }
}

export function buildPbcState(
  members: PbcRoomMember[],
  seed?: string | number,
  roundsCount?: number
): PbcState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  return createPbcState(players, seed ?? randomSeed(), Date.now(), roundsCount ?? PBC_DEFAULT_ROUNDS)
}

export function serializePbcState(state: PbcState): string {
  return JSON.stringify(state)
}

export function parsePbcState(json: string | null): PbcState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as PbcState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      answers: raw.answers ?? {},
      contests: raw.contests ?? {},
      rejected: raw.rejected ?? [],
      rematchVotes: raw.rematchVotes ?? [],
    }
  } catch {
    return null
  }
}

/** Les réponses passent par la modération de texte libre (mêmes règles que le chat). */
function moderateAnswers(answers: unknown): string[] {
  if (!Array.isArray(answers)) return []
  return answers.map((a) => (typeof a === 'string' ? censorChatMessage(a).text : ''))
}

export type PbcRoomActionInput =
  | { type: 'stop'; answers: string[] }
  | { type: 'submit'; answers: string[] }
  | { type: 'contest'; targetId: string; category: number }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type PbcRoomActionResult = { ok: true; state: PbcState } | { ok: false; error: string }

export function applyPbcRoomAction(
  state: PbcState,
  userId: string,
  input: PbcRoomActionInput
): PbcRoomActionResult {
  try {
    switch (input.type) {
      case 'stop':
        return {
          ok: true,
          state: reducePbc(state, {
            type: 'STOP',
            playerId: userId,
            answers: moderateAnswers(input.answers),
            now: Date.now(),
          }),
        }
      case 'submit':
        return {
          ok: true,
          state: reducePbc(state, {
            type: 'SUBMIT',
            playerId: userId,
            answers: moderateAnswers(input.answers),
            now: Date.now(),
          }),
        }
      case 'contest':
        return {
          ok: true,
          state: reducePbc(state, {
            type: 'CONTEST',
            playerId: userId,
            targetId: input.targetId,
            category: input.category,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reducePbc(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'continue':
        return {
          ok: true,
          state: reducePbc(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyPbcBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reducePbc(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof PbcEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markPbcPlayerLeft(state: PbcState, playerId: string, at: number): PbcState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reducePbc(state, { type: 'LEAVE', playerId, at })
}

export function rejoinPbcPlayer(state: PbcState, playerId: string): PbcState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reducePbc(state, { type: 'REJOIN', playerId })
}

export function convertPbcPlayerToBot(state: PbcState, playerId: string): PbcState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  let next: PbcState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
  // Copie blanche immédiate pour ne pas geler un flush en cours.
  if (next.phase === 'flush' && !next.answers[playerId]) {
    next = {
      ...next,
      answers: {
        ...next.answers,
        [playerId]: Array.from({ length: next.categories.length }, () => ''),
      },
    }
  }
  return next
}

export function pbcClientViewJson(state: PbcState, viewerId: string): string {
  return JSON.stringify(toPbcClientView(state, viewerId))
}

export function pbcSpectatorViewJson(state: PbcState): string {
  return JSON.stringify(toPbcSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Les bots du Petit Bac sont UNIQUEMENT des déserteurs convertis : ils ne
 * savent pas écrire (copie blanche gérée par le moteur). Ce tick ne sert
 * qu'à mener le « continuer » du reveal si le meneur est devenu bot.
 */
export function applyPbcBotAction(state: PbcState): PbcRoomActionResult {
  try {
    if (state.phase === 'reveal') {
      const actorId = currentPbcActorId(state)
      const actor = state.players.find((p) => p.id === actorId)
      if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      return {
        ok: true,
        state: reducePbc(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof PbcEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
