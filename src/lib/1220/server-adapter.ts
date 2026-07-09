import {
  createGame1220State,
  reduceGame1220,
  lockConfigsIfAllReady,
  Game1220EngineError,
  GAME_1220_MIN_PLAYERS,
  GAME_1220_MAX_PLAYERS,
  toGame1220ClientView,
  type Game1220State,
} from './engine'
import type { Choices1220 } from '@/lib/game-1220'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du 1220 : sérialisation, mapping HTTP → actions moteur,
 * vues (aucune info cachée, une seule vue sert joueur + spectateur).
 * Consommé par le registre `src/lib/online/game-adapters.ts`.
 */

export interface Game1220RoomMember {
  userId: string
  user: { displayName: string }
}

const GAME_1220_BOT_NAMES = [
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

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte. Filet : on complète quand même jusqu'au minimum du moteur
 * (rematch après départs).
 */
export function buildGame1220State(
  members: Game1220RoomMember[],
  botsCount: number = 0,
  seed?: string | number
): Game1220State {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: GAME_1220_BOT_NAMES[botIndex % GAME_1220_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, GAME_1220_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < GAME_1220_MIN_PLAYERS) addBot()
  return createGame1220State(players, seed ?? randomSeed())
}

export function serializeGame1220State(state: Game1220State): string {
  return JSON.stringify(state)
}

export function parseGame1220State(json: string | null): Game1220State | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Game1220State
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

export type Game1220RoomActionInput =
  | { type: 'set-draft'; choices: Partial<Choices1220> }
  | { type: 'ready' }
  | { type: 'roll' }
  | { type: 'end' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type Game1220RoomActionResult =
  | { ok: true; state: Game1220State }
  | { ok: false; error: string }

export function applyGame1220RoomAction(
  state: Game1220State,
  userId: string,
  input: Game1220RoomActionInput
): Game1220RoomActionResult {
  try {
    switch (input.type) {
      case 'set-draft':
        return { ok: true, state: reduceGame1220(state, { type: 'SET_DRAFT', playerId: userId, choices: input.choices }) }
      case 'ready':
        return { ok: true, state: reduceGame1220(state, { type: 'READY', playerId: userId }) }
      case 'roll':
        return { ok: true, state: reduceGame1220(state, { type: 'ROLL', playerId: userId }) }
      case 'end':
        return { ok: true, state: reduceGame1220(state, { type: 'END', playerId: userId }) }
      case 'bot':
        // Jeu simultané : les bots n'ont rien à décider activement (prêts
        // d'office à la création). Tick défensif, toujours un no-op.
        return { ok: true, state }
      case 'replace-left':
        return {
          ok: true,
          state: reduceGame1220(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof Game1220EngineError) return { ok: false, error: e.message }
    throw e
  }
}

/** Quitter en partie → marqué « parti » (grâce avant bot). Null = no-op. */
export function markGame1220PlayerLeft(state: Game1220State, playerId: string, at: number): Game1220State | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceGame1220(state, { type: 'LEAVE', playerId, at })
}

export function rejoinGame1220Player(state: Game1220State, playerId: string): Game1220State | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceGame1220(state, { type: 'REJOIN', playerId })
}

/** Conversion directe en bot (expulsion AFK — validée par la route). */
export function convertGame1220PlayerToBot(state: Game1220State, playerId: string): Game1220State | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  const next: Game1220State = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
  const setupReady = next.setupReady.includes(playerId) ? next.setupReady : [...next.setupReady, playerId]
  return next.phase === 'setup' ? lockConfigsIfAllReady(next, setupReady) : { ...next, setupReady }
}

export function game1220ClientViewJson(state: Game1220State): string {
  return JSON.stringify(toGame1220ClientView(state))
}

export function game1220SpectatorViewJson(state: Game1220State): string {
  return JSON.stringify(toGame1220ClientView(state))
}
