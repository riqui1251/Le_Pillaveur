import {
  createEspionState,
  currentEspionActorId,
  espionActive,
  reduceEspion,
  toEspionClientView,
  toEspionSpectatorView,
  EspionEngineError,
  ESPION_DEFAULT_DISCUSSION_MS,
  ESPION_DEFAULT_ROUNDS_TO_WIN,
  ESPION_MIN_PLAYERS,
  ESPION_MAX_PLAYERS,
  type EspionState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { getEspionLocations } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur de Qui est l'Espion ? : sérialisation, mapping HTTP →
 * actions moteur, bots de remplacement, vues anti-triche. Consommé par le
 * registre `src/lib/online/game-adapters.ts`.
 */

export interface EspionRoomMember {
  userId: string
  user: { displayName: string }
}

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte. Filet : on complète quand même jusqu'au minimum du moteur.
 */
export function buildEspionState(
  members: EspionRoomMember[],
  lang: string | null | undefined,
  botsCount: number = 0,
  seed?: string | number,
  discussionMs?: number,
  roundsToWin?: number
): EspionState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const botPersonas = pickBotPersonas(ESPION_MAX_PLAYERS)
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, ESPION_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < ESPION_MIN_PLAYERS) addBot()
  return createEspionState(
    players,
    getEspionLocations(lang),
    seed ?? randomSeed(),
    Date.now(),
    discussionMs ?? ESPION_DEFAULT_DISCUSSION_MS,
    roundsToWin ?? ESPION_DEFAULT_ROUNDS_TO_WIN
  )
}

export function serializeEspionState(state: EspionState): string {
  return JSON.stringify(state)
}

export function parseEspionState(json: string | null): EspionState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as EspionState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      remainingLocations: raw.remainingLocations ?? [],
    }
  } catch {
    return null
  }
}

export type EspionRoomActionInput =
  | { type: 'accuse'; targetId: string }
  | { type: 'support' }
  | { type: 'guess-location'; location: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type EspionRoomActionResult =
  | { ok: true; state: EspionState }
  | { ok: false; error: string }

export function applyEspionRoomAction(
  state: EspionState,
  userId: string,
  input: EspionRoomActionInput
): EspionRoomActionResult {
  try {
    switch (input.type) {
      case 'accuse':
        return {
          ok: true,
          state: reduceEspion(state, {
            type: 'ACCUSE',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'support':
        return {
          ok: true,
          state: reduceEspion(state, { type: 'SUPPORT', playerId: userId, now: Date.now() }),
        }
      case 'guess-location':
        return {
          ok: true,
          state: reduceEspion(state, {
            type: 'GUESS_LOCATION',
            playerId: userId,
            location: input.location,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceEspion(state, {
            type: 'ADVANCE',
            claimedKey: input.phaseKey,
            now: Date.now(),
          }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceEspion(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyEspionBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceEspion(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof EspionEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markEspionPlayerLeft(
  state: EspionState,
  playerId: string,
  at: number
): EspionState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceEspion(state, { type: 'LEAVE', playerId, at })
}

export function rejoinEspionPlayer(state: EspionState, playerId: string): EspionState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceEspion(state, { type: 'REJOIN', playerId })
}

export function convertEspionPlayerToBot(state: EspionState, playerId: string): EspionState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
}

export function espionClientViewJson(state: EspionState, viewerId: string): string {
  return JSON.stringify(toEspionClientView(state, viewerId))
}

export function espionSpectatorViewJson(state: EspionState): string {
  return JSON.stringify(toEspionSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Un bot n'accuse jamais et ne devine jamais le lieu (IA volontairement
 * faible, assumée — les bots n'existent qu'en REMPLACEMENT d'un joueur
 * parti). Il soutient une accusation en cours avec ~40 % de proba par tick
 * (le rythme des ticks « arbitre » côté client fait office de délai
 * aléatoire) — évite qu'une partie reste bloquée sur un bot absent sans
 * pour autant le rendre décisif.
 */
export function applyEspionBotAction(state: EspionState): EspionRoomActionResult {
  try {
    if (state.phase === 'discussion' && state.activeAccusation) {
      const active = espionActive(state)
      const pendingBots = active.filter(
        (p) => p.isBot && !state.activeAccusation!.supporters.includes(p.id)
      )
      if (pendingBots.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      let next = state
      for (const bot of pendingBots) {
        if (!next.activeAccusation) break // déjà résolu par un soutien précédent de cette boucle
        if (Math.random() < 0.4) {
          next = reduceEspion(next, { type: 'SUPPORT', playerId: bot.id, now: Date.now() })
        }
      }
      if (next === state) return { ok: false, error: 'NOT_BOT_TURN' }
      return { ok: true, state: next }
    }

    const actorId = currentEspionActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'reveal') {
      return {
        ok: true,
        state: reduceEspion(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof EspionEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
