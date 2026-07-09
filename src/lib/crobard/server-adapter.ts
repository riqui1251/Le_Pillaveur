import {
  createCrobardState,
  currentCrobardActorId,
  reduceCrobard,
  toCrobardClientView,
  toCrobardSpectatorView,
  CrobardEngineError,
  CROBARD_MAX_PLAYERS,
  CROBARD_MIN_PLAYERS,
  CROBARD_DEFAULT_ROUNDS,
  type CrobardState,
  type Stroke,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { getCrobardWords } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur de Crobard : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface CrobardRoomMember {
  userId: string
  user: { displayName: string }
}

const CROBARD_BOT_NAMES = [
  'Croquis 🤖',
  'Griffonne 🤖',
  'Pinceau 🤖',
  'Esquisse 🤖',
  'Doodle 🤖',
  'Fusain 🤖',
  'Aquarelle 🤖',
  'Pastel 🤖',
]

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte. Filet : on complète quand même jusqu'au minimum du moteur.
 */
export function buildCrobardState(
  members: CrobardRoomMember[],
  lang: string | null | undefined,
  botsCount: number = 0,
  seed?: string | number,
  totalRounds?: number
): CrobardState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: CROBARD_BOT_NAMES[botIndex % CROBARD_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, CROBARD_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < CROBARD_MIN_PLAYERS) addBot()
  return createCrobardState(
    players,
    getCrobardWords(lang),
    seed ?? randomSeed(),
    Date.now(),
    totalRounds ?? CROBARD_DEFAULT_ROUNDS
  )
}

export function serializeCrobardState(state: CrobardState): string {
  return JSON.stringify(state)
}

export function parseCrobardState(json: string | null): CrobardState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as CrobardState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      remainingWords: raw.remainingWords ?? [],
      strokes: raw.strokes ?? [],
      correctGuessers: raw.correctGuessers ?? [],
    }
  } catch {
    return null
  }
}

export type CrobardRoomActionInput =
  | { type: 'choose-word'; index: number }
  | { type: 'draw-stroke'; stroke: Stroke }
  | { type: 'clear' }
  | { type: 'guess'; text: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type CrobardRoomActionResult =
  | { ok: true; state: CrobardState }
  | { ok: false; error: string }

export function applyCrobardRoomAction(
  state: CrobardState,
  userId: string,
  input: CrobardRoomActionInput
): CrobardRoomActionResult {
  try {
    switch (input.type) {
      case 'choose-word':
        return {
          ok: true,
          state: reduceCrobard(state, {
            type: 'CHOOSE_WORD',
            playerId: userId,
            index: input.index,
            now: Date.now(),
          }),
        }
      case 'draw-stroke':
        return {
          ok: true,
          state: reduceCrobard(state, { type: 'DRAW_STROKE', playerId: userId, stroke: input.stroke }),
        }
      case 'clear':
        return { ok: true, state: reduceCrobard(state, { type: 'CLEAR', playerId: userId }) }
      case 'guess':
        return {
          ok: true,
          state: reduceCrobard(state, {
            type: 'GUESS',
            playerId: userId,
            text: input.text,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceCrobard(state, {
            type: 'ADVANCE',
            claimedKey: input.phaseKey,
            now: Date.now(),
          }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceCrobard(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyCrobardBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceCrobard(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof CrobardEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markCrobardPlayerLeft(state: CrobardState, playerId: string, at: number): CrobardState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceCrobard(state, { type: 'LEAVE', playerId, at })
}

export function rejoinCrobardPlayer(state: CrobardState, playerId: string): CrobardState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceCrobard(state, { type: 'REJOIN', playerId })
}

export function convertCrobardPlayerToBot(state: CrobardState, playerId: string): CrobardState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
}

export function crobardClientViewJson(state: CrobardState, viewerId: string): string {
  return JSON.stringify(toCrobardClientView(state, viewerId))
}

export function crobardSpectatorViewJson(state: CrobardState): string {
  return JSON.stringify(toCrobardSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Un bot ne choisit jamais de mot, ne dessine jamais et ne devine jamais
 * (IA volontairement faible, assumée). Quand le dessinateur tiré est un
 * bot, la manche s'écourte d'elle-même côté moteur
 * (`CROBARD_BOT_DRAWER_ROUND_MS`) — rien à faire ici. Seul le bilan de
 * manche (`roundEnd`) a besoin d'un bot qui « continue » s'il est le
 * premier joueur actif restant.
 */
export function applyCrobardBotAction(state: CrobardState): CrobardRoomActionResult {
  try {
    const actorId = currentCrobardActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'roundEnd') {
      return {
        ok: true,
        state: reduceCrobard(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof CrobardEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
