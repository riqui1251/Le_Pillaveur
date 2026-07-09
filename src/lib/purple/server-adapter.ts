import {
  createPurpleState,
  reducePurple,
  PurpleEngineError,
  PURPLE_MIN_PLAYERS,
  PURPLE_MAX_PLAYERS,
  toPurpleClientView,
  type PurpleState,
  type PurpleBet,
} from './engine'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Purple : sérialisation, mapping HTTP → actions
 * moteur, vues (aucune info cachée, une seule vue sert joueur + spectateur).
 * Consommé par le registre `src/lib/online/game-adapters.ts`.
 */

export interface PurpleRoomMember {
  userId: string
  user: { displayName: string }
}

const PURPLE_BOT_NAMES = [
  'Barnabé 🤖',
  'Gépéto 🤖',
  'Raoul 🤖',
  'Suzette 🤖',
  'Marcel 🤖',
  'Gaston 🤖',
  'Bernadette 🤖',
  'Norbert 🤖',
  'Ginette 🤖',
  'Roger 🤖',
]

export function buildPurpleState(
  members: PurpleRoomMember[],
  botsCount: number = 0,
  seed?: string | number
): PurpleState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: PURPLE_BOT_NAMES[botIndex % PURPLE_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, PURPLE_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < PURPLE_MIN_PLAYERS) addBot()
  return createPurpleState(players, seed ?? randomSeed())
}

export function serializePurpleState(state: PurpleState): string {
  return JSON.stringify(state)
}

export function parsePurpleState(json: string | null): PurpleState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as PurpleState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

export type PurpleRoomActionInput =
  | { type: 'bet'; bet: PurpleBet }
  | { type: 'continue' }
  | { type: 'pass' }
  | { type: 'close-reveal' }
  | { type: 'end' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type PurpleRoomActionResult =
  | { ok: true; state: PurpleState }
  | { ok: false; error: string }

const VALID_BETS = new Set<PurpleBet>(['rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple'])

/** IA du bot : pari aléatoire simple, continue une fois sur deux si possible. */
function applyPurpleBotAction(state: PurpleState): PurpleRoomActionResult {
  const actorId = state.players[state.currentPlayer]?.id
  const actor = state.players.find((p) => p.id === actorId)
  if (!actor?.isBot) return { ok: true, state }
  try {
    if (state.pendingReveal) {
      return { ok: true, state: reducePurple(state, { type: 'CLOSE_REVEAL', playerId: actorId! }) }
    }
    if (state.canContinue) {
      const action = Math.random() < 0.5 ? 'CONTINUE' : 'PASS'
      return { ok: true, state: reducePurple(state, { type: action, playerId: actorId! }) }
    }
    const bets: PurpleBet[] = ['rouge', 'noir', 'purple', 'double-rouge', 'double-noir', 'double-purple']
    const bet = bets[Math.floor(Math.random() * bets.length)]
    return { ok: true, state: reducePurple(state, { type: 'BET', playerId: actorId!, bet }) }
  } catch (e) {
    if (e instanceof PurpleEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function applyPurpleRoomAction(
  state: PurpleState,
  userId: string,
  input: PurpleRoomActionInput
): PurpleRoomActionResult {
  try {
    switch (input.type) {
      case 'bet':
        if (!VALID_BETS.has(input.bet)) return { ok: false, error: 'INVALID_BET' }
        return { ok: true, state: reducePurple(state, { type: 'BET', playerId: userId, bet: input.bet }) }
      case 'continue':
        return { ok: true, state: reducePurple(state, { type: 'CONTINUE', playerId: userId }) }
      case 'pass':
        return { ok: true, state: reducePurple(state, { type: 'PASS', playerId: userId }) }
      case 'close-reveal':
        return { ok: true, state: reducePurple(state, { type: 'CLOSE_REVEAL', playerId: userId }) }
      case 'end':
        return { ok: true, state: reducePurple(state, { type: 'END', playerId: userId }) }
      case 'bot':
        return applyPurpleBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reducePurple(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof PurpleEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markPurplePlayerLeft(state: PurpleState, playerId: string, at: number): PurpleState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reducePurple(state, { type: 'LEAVE', playerId, at })
}

export function rejoinPurplePlayer(state: PurpleState, playerId: string): PurpleState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reducePurple(state, { type: 'REJOIN', playerId })
}

export function convertPurplePlayerToBot(state: PurpleState, playerId: string): PurpleState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
}

export function purpleClientViewJson(state: PurpleState): string {
  return JSON.stringify(toPurpleClientView(state))
}

export function purpleSpectatorViewJson(state: PurpleState): string {
  return JSON.stringify(toPurpleClientView(state))
}
