import {
  createDilState,
  currentDilActorId,
  dilActive,
  dilCurrentCard,
  reduceDil,
  toDilClientView,
  toDilSpectatorView,
  DilEngineError,
  DIL_DEFAULT_ROUNDS,
  DIL_MIN_PLAYERS,
  DIL_MAX_PLAYERS,
  type DilState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { dilContentFor } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur de Dilemmes : sérialisation, mapping HTTP → actions
 * moteur, bots, vues. Pas de classement (aucun skill) — assumé.
 */

export interface DilRoomMember {
  userId: string
  user: { displayName: string }
}

const DIL_BOT_NAMES = [
  'Barnabé 🤖', 'Gépéto 🤖', 'Raoul 🤖', 'Suzette 🤖', 'Marcel 🤖',
  'Gaston 🤖', 'Bernadette 🤖', 'Norbert 🤖', 'Ginette 🤖', 'Roger 🤖',
]

export function buildDilState(
  members: DilRoomMember[],
  ambiance: 'soft' | 'alcool',
  botsCount: number = 0,
  seed?: string | number,
  roundsCount?: number
): DilState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: DIL_BOT_NAMES[botIndex % DIL_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, DIL_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < DIL_MIN_PLAYERS) addBot()

  return createDilState(
    players,
    dilContentFor(ambiance),
    seed ?? randomSeed(),
    Date.now(),
    roundsCount ?? DIL_DEFAULT_ROUNDS
  )
}

export function serializeDilState(state: DilState): string {
  return JSON.stringify(state)
}

export function parseDilState(json: string | null): DilState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as DilState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, votes: raw.votes ?? {}, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

export type DilRoomActionInput =
  | { type: 'vote'; choice: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type DilRoomActionResult = { ok: true; state: DilState } | { ok: false; error: string }

export function applyDilRoomAction(
  state: DilState,
  userId: string,
  input: DilRoomActionInput
): DilRoomActionResult {
  try {
    switch (input.type) {
      case 'vote':
        return {
          ok: true,
          state: reduceDil(state, {
            type: 'VOTE',
            playerId: userId,
            choice: input.choice,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceDil(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceDil(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyDilBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceDil(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof DilEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markDilPlayerLeft(state: DilState, playerId: string, at: number): DilState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceDil(state, { type: 'LEAVE', playerId, at })
}

export function rejoinDilPlayer(state: DilState, playerId: string): DilState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceDil(state, { type: 'REJOIN', playerId })
}

export function convertDilPlayerToBot(state: DilState, playerId: string): DilState | null {
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

export function dilClientViewJson(state: DilState, viewerId: string): string {
  return JSON.stringify(toDilClientView(state, viewerId))
}

export function dilSpectatorViewJson(state: DilState): string {
  return JSON.stringify(toDilSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/** Bots convertis en cours de manche : votent au hasard ; au reveal, le bot meneur continue. */
export function applyDilBotAction(state: DilState): DilRoomActionResult {
  try {
    if (state.phase === 'vote') {
      const pending = dilActive(state).filter((p) => p.isBot && !state.votes[p.id])
      if (pending.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      const card = dilCurrentCard(state)
      let next = state
      for (const bot of pending) {
        if (next.phase !== 'vote' || !card) break
        let choice = Math.random() < 0.5 ? 'A' : 'B'
        if (card.kind === 'who') {
          const targets = dilActive(next).filter((t) => t.id !== bot.id)
          if (targets.length === 0) continue
          choice = targets[Math.floor(Math.random() * targets.length)].id
        }
        next = reduceDil(next, { type: 'VOTE', playerId: bot.id, choice, now: Date.now() })
      }
      return { ok: true, state: next }
    }
    if (state.phase === 'reveal') {
      const actor = state.players.find((p) => p.id === currentDilActorId(state))
      if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      return {
        ok: true,
        state: reduceDil(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof DilEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
