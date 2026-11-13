import {
  applyBjBotTurn,
  BJ_MAX_PLAYERS,
  BJ_MIN_PLAYERS,
  BjEngineError,
  convertToBots,
  createBjState,
  reduceBj,
  toBjClientView,
  type BjState,
} from './engine'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Black Jack : sérialisation, mapping HTTP → actions
 * moteur, vue unique (joueur + spectateur : rien n'y est propre à un joueur,
 * seuls le sabot et la carte fermée du croupier sont masqués).
 * Consommé par le registre `src/lib/online/game-adapters.ts`.
 */

export interface BjRoomMember {
  userId: string
  user: { displayName: string }
}

export function buildBjState(members: BjRoomMember[], botsCount: number = 0, seed?: string | number): BjState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  const personas = pickBotPersonas(BJ_MAX_PLAYERS)
  let botIndex = 0
  const addBot = () => {
    players.push({ id: `bot-${botIndex + 1}`, name: botDisplayName(personas[botIndex % personas.length]), isBot: true })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, BJ_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < BJ_MIN_PLAYERS) addBot()
  return createBjState(players, seed ?? randomSeed())
}

export function serializeBjState(state: BjState): string {
  return JSON.stringify(state)
}

export function parseBjState(json: string | null): BjState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as BjState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string' || !Array.isArray(raw.shoe)) return null
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

export type BjRoomActionResult = { ok: true; state: BjState } | { ok: false; error: string }

const MOVES = { hit: 'HIT', stand: 'STAND', double: 'DOUBLE', split: 'SPLIT' } as const

export function applyBjRoomAction(
  state: BjState,
  userId: string,
  body: Record<string, unknown>,
  graceMs: number
): BjRoomActionResult {
  try {
    switch (body.action) {
      case 'bet':
        return { ok: true, state: reduceBj(state, { type: 'BET', playerId: userId, stake: Number(body.stake) }) }
      case 'hit':
      case 'stand':
      case 'double':
      case 'split':
        return { ok: true, state: reduceBj(state, { type: MOVES[body.action], playerId: userId }) }
      case 'next-round':
        return { ok: true, state: reduceBj(state, { type: 'NEXT_ROUND', playerId: userId }) }
      case 'end':
        return { ok: true, state: reduceBj(state, { type: 'END', playerId: userId }) }
      case 'bot': {
        const next = applyBjBotTurn(state)
        return next ? { ok: true, state: next } : { ok: false, error: 'NOT_BOT_TURN' }
      }
      case 'replace-left':
        return { ok: true, state: reduceBj(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs }) }
      default:
        return { ok: false, error: 'invalid_action' }
    }
  } catch (e) {
    if (e instanceof BjEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markBjPlayerLeft(state: BjState, playerId: string, at: number): BjState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceBj(state, { type: 'LEAVE', playerId, at })
}

export function rejoinBjPlayer(state: BjState, playerId: string): BjState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceBj(state, { type: 'REJOIN', playerId })
}

export function convertBjPlayerToBot(state: BjState, playerId: string): BjState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  const next = convertToBots(state, new Set([playerId]))
  return { ...next, version: state.version + 1 }
}

export function bjViewJson(state: BjState): string {
  return JSON.stringify(toBjClientView(state))
}
