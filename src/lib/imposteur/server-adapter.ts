import {
  createImposteurState,
  currentImposteurActorId,
  imposteurAlive,
  reduceImposteur,
  toImposteurClientView,
  toImposteurSpectatorView,
  ImposteurEngineError,
  IMPOSTEUR_EMPTY_CLUE,
  IMPOSTEUR_MIN_PLAYERS,
  IMPOSTEUR_MAX_PLAYERS,
  type ImposteurState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { getImposteurPairs } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur de l'Imposteur : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface ImposteurRoomMember {
  userId: string
  user: { displayName: string }
}

const IMPOSTEUR_BOT_NAMES = [
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
 * (rematch après départs — leçon du Menteur).
 */
export function buildImposteurState(
  members: ImposteurRoomMember[],
  lang: string | null | undefined,
  botsCount: number = 0,
  seed?: string | number
): ImposteurState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: IMPOSTEUR_BOT_NAMES[botIndex % IMPOSTEUR_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, IMPOSTEUR_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < IMPOSTEUR_MIN_PLAYERS) addBot()
  return createImposteurState(players, getImposteurPairs(lang), seed ?? randomSeed())
}

export function serializeImposteurState(state: ImposteurState): string {
  return JSON.stringify(state)
}

export function parseImposteurState(json: string | null): ImposteurState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as ImposteurState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, rematchVotes: raw.rematchVotes ?? [], pendingVotes: raw.pendingVotes ?? {} }
  } catch {
    return null
  }
}

export type ImposteurRoomActionInput =
  | { type: 'clue'; text: string }
  | { type: 'vote'; targetId: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type ImposteurRoomActionResult =
  | { ok: true; state: ImposteurState }
  | { ok: false; error: string }

export function applyImposteurRoomAction(
  state: ImposteurState,
  userId: string,
  input: ImposteurRoomActionInput
): ImposteurRoomActionResult {
  try {
    switch (input.type) {
      case 'clue':
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'CLUE',
            playerId: userId,
            text: input.text,
            now: Date.now(),
          }),
        }
      case 'vote':
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'VOTE',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'ADVANCE',
            claimedKey: input.phaseKey,
            now: Date.now(),
          }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceImposteur(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyImposteurBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof ImposteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markImposteurPlayerLeft(
  state: ImposteurState,
  playerId: string,
  at: number
): ImposteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceImposteur(state, { type: 'LEAVE', playerId, at })
}

export function rejoinImposteurPlayer(
  state: ImposteurState,
  playerId: string
): ImposteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceImposteur(state, { type: 'REJOIN', playerId })
}

export function convertImposteurPlayerToBot(
  state: ImposteurState,
  playerId: string
): ImposteurState | null {
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

export function imposteurClientViewJson(state: ImposteurState, viewerId: string): string {
  return JSON.stringify(toImposteurClientView(state, viewerId))
}

export function imposteurSpectatorViewJson(state: ImposteurState): string {
  return JSON.stringify(toImposteurSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Un bot ne sait pas décrire un mot : il donne l'indice automatique « … » et
 * vote au hasard (hors lui-même). Assumé faible — les bots n'existent qu'en
 * REMPLACEMENT d'un joueur parti, pas comme adversaires de choix.
 *
 * Pendant le VOTE (simultané), un seul tick fait voter TOUS les bots
 * retardataires d'un coup.
 */
export function applyImposteurBotAction(state: ImposteurState): ImposteurRoomActionResult {
  try {
    if (state.phase === 'vote') {
      const alive = imposteurAlive(state)
      const pendingBots = alive.filter((p) => p.isBot && !state.pendingVotes[p.id])
      if (pendingBots.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      let next = state
      for (const bot of pendingBots) {
        if (next.phase !== 'vote') break
        const targets = imposteurAlive(next).filter((p) => p.id !== bot.id)
        const target = targets[Math.floor(Math.random() * targets.length)]
        next = reduceImposteur(next, {
          type: 'VOTE',
          playerId: bot.id,
          targetId: target.id,
          now: Date.now(),
        })
      }
      return { ok: true, state: next }
    }

    const actorId = currentImposteurActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'clue') {
      return {
        ok: true,
        state: reduceImposteur(state, {
          type: 'CLUE',
          playerId: actor.id,
          text: IMPOSTEUR_EMPTY_CLUE,
          now: Date.now(),
        }),
      }
    }
    if (state.phase === 'reveal') {
      return {
        ok: true,
        state: reduceImposteur(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof ImposteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
