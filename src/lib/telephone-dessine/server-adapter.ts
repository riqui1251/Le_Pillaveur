import {
  createTelephoneState,
  currentTelephoneActorId,
  telephoneActive,
  telephoneActionTypeForRound,
  reduceTelephone,
  toTelephoneClientView,
  toTelephoneSpectatorView,
  TelephoneEngineError,
  type TelephoneState,
} from './engine'
import type { Stroke } from '@/lib/crobard/engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur de Téléphone Dessiné : sérialisation, mapping HTTP →
 * actions moteur, bots de remplacement, vues anti-triche. Consommé par le
 * registre `src/lib/online/game-adapters.ts`.
 *
 * `botsFillable: false` (comme le Loup-Garou) — la partie ne peut PAS être
 * lancée sous l'effectif humain minimum (un maillon tenu par un bot dès le
 * départ casserait l'effet de surprise final). Le remplacement en cours de
 * partie reste possible.
 */

export interface TelephoneRoomMember {
  userId: string
  user: { displayName: string }
}

export function buildTelephoneState(
  members: TelephoneRoomMember[],
  seed?: string | number
): TelephoneState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  return createTelephoneState(players, seed ?? randomSeed(), Date.now())
}

export function serializeTelephoneState(state: TelephoneState): string {
  return JSON.stringify(state)
}

export function parseTelephoneState(json: string | null): TelephoneState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as TelephoneState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      submittedIds: raw.submittedIds ?? [],
      revealOrder: raw.revealOrder ?? [],
    }
  } catch {
    return null
  }
}

export type TelephoneRoomActionInput =
  | { type: 'write'; text: string }
  | { type: 'draw-stroke'; stroke: Stroke }
  | { type: 'clear' }
  | { type: 'submit' }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'previous' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type TelephoneRoomActionResult =
  | { ok: true; state: TelephoneState }
  | { ok: false; error: string }

export function applyTelephoneRoomAction(
  state: TelephoneState,
  userId: string,
  input: TelephoneRoomActionInput
): TelephoneRoomActionResult {
  try {
    switch (input.type) {
      case 'write':
        return {
          ok: true,
          state: reduceTelephone(state, {
            type: 'WRITE',
            playerId: userId,
            text: input.text,
            now: Date.now(),
          }),
        }
      case 'draw-stroke':
        return {
          ok: true,
          state: reduceTelephone(state, { type: 'DRAW_STROKE', playerId: userId, stroke: input.stroke }),
        }
      case 'clear':
        return { ok: true, state: reduceTelephone(state, { type: 'CLEAR', playerId: userId }) }
      case 'submit':
        return {
          ok: true,
          state: reduceTelephone(state, { type: 'SUBMIT', playerId: userId, now: Date.now() }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceTelephone(state, {
            type: 'ADVANCE',
            claimedKey: input.phaseKey,
            now: Date.now(),
          }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceTelephone(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'previous':
        return {
          ok: true,
          state: reduceTelephone(state, { type: 'PREVIOUS', playerId: userId }),
        }
      case 'bot':
        return applyTelephoneBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceTelephone(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof TelephoneEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markTelephonePlayerLeft(
  state: TelephoneState,
  playerId: string,
  at: number
): TelephoneState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceTelephone(state, { type: 'LEAVE', playerId, at })
}

export function rejoinTelephonePlayer(state: TelephoneState, playerId: string): TelephoneState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceTelephone(state, { type: 'REJOIN', playerId })
}

export function convertTelephonePlayerToBot(state: TelephoneState, playerId: string): TelephoneState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
}

export function telephoneClientViewJson(state: TelephoneState, viewerId: string): string {
  return JSON.stringify(toTelephoneClientView(state, viewerId))
}

export function telephoneSpectatorViewJson(state: TelephoneState): string {
  return JSON.stringify(toTelephoneSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Manche simultanée : TOUS les bots en attente soumettent un maillon
 * minimal (texte vide, ou traits vides verrouillés) en UN seul tick —
 * contrairement aux autres jeux où un bot agit à la fois, ici plusieurs
 * bots peuvent devoir soumettre ensemble pour ne jamais bloquer la manche.
 * En `reveal`, le bot « continue » s'il est le premier joueur actif.
 */
export function applyTelephoneBotAction(state: TelephoneState): TelephoneRoomActionResult {
  try {
    if (state.phase === 'contributing') {
      const pendingBots = telephoneActive(state).filter(
        (p) => p.isBot && !state.submittedIds.includes(p.id)
      )
      if (pendingBots.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      const actionType = telephoneActionTypeForRound(state.round)
      let next = state
      for (const bot of pendingBots) {
        next =
          actionType === 'write'
            ? reduceTelephone(next, { type: 'WRITE', playerId: bot.id, text: '', now: Date.now() })
            : reduceTelephone(next, { type: 'SUBMIT', playerId: bot.id, now: Date.now() })
      }
      return { ok: true, state: next }
    }
    const actorId = currentTelephoneActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'reveal') {
      return {
        ok: true,
        state: reduceTelephone(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof TelephoneEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
