import {
  createTelephoneState,
  currentTelephoneActorId,
  telephoneActive,
  telephoneActionTypeForRound,
  telephoneRevealLastLinkIdx,
  reduceTelephone,
  toTelephoneClientView,
  toTelephoneSpectatorView,
  TelephoneEngineError,
  TELEPHONE_REVEAL_MS,
  type TelephoneState,
} from './engine'
import { telephoneBotSay } from './bot-speech'
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
    const revealOrder = raw.revealOrder ?? []
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      submittedIds: raw.submittedIds ?? [],
      speech: Array.isArray(raw.speech) ? raw.speech : [],
      revealOrder,
      // Révélation lancée avant le dévoilement maillon par maillon : la table
      // voyait déjà la chaîne entière, elle la garde entière.
      revealLinkIdx:
        typeof raw.revealLinkIdx === 'number'
          ? raw.revealLinkIdx
          : telephoneRevealLastLinkIdx({ chains: raw.chains ?? {}, revealOrder }, raw.revealIdx ?? 0),
      // Parties LANCÉES avant l'horloge de révélation : leur reveal n'a pas
      // d'échéance et resterait suspendu au seul meneur. On lui en pose une
      // à la première relecture — la table repart toute seule.
      phaseEndsAt:
        raw.phase === 'reveal' && raw.phaseEndsAt == null
          ? Date.now() + TELEPHONE_REVEAL_MS
          : raw.phaseEndsAt,
    }
  } catch {
    return null
  }
}

export type TelephoneRoomActionInput =
  | { type: 'write'; text: string }
  | { type: 'draw-stroke'; stroke: Stroke }
  | { type: 'clear' }
  | { type: 'submit'; strokes?: Stroke[] }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue'; phaseKey?: string }
  | { type: 'previous'; phaseKey?: string }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type TelephoneRoomActionResult =
  | { ok: true; state: TelephoneState }
  | { ok: false; error: string }

/**
 * `sayRand` tire les paroles des bots (les tests lui donnent un flux à
 * part) : la réaction à la chute d'une chaîne naît dans l'écriture du cran
 * qui la dévoile — celui du meneur, humain ou bot, ou de l'horloge.
 */
export function applyTelephoneRoomAction(
  state: TelephoneState,
  userId: string,
  input: TelephoneRoomActionInput,
  sayRand: () => number = Math.random
): TelephoneRoomActionResult {
  const result = reduceTelephoneRoomAction(state, userId, input)
  return result.ok ? { ok: true, state: withTelephoneSay(state, result.state, sayRand) } : result
}

function reduceTelephoneRoomAction(
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
          state: reduceTelephone(state, {
            type: 'SUBMIT',
            playerId: userId,
            strokes: input.strokes,
            now: Date.now(),
          }),
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
          state: reduceTelephone(state, {
            type: 'CONTINUE',
            playerId: userId,
            now: Date.now(),
            claimedKey: input.phaseKey,
          }),
        }
      case 'previous':
        return {
          ok: true,
          state: reduceTelephone(state, {
            type: 'PREVIOUS',
            playerId: userId,
            now: Date.now(),
            claimedKey: input.phaseKey,
          }),
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

/** La chaîne affichée est entière (son dernier maillon dévoilé). */
function chainShown(state: TelephoneState): boolean {
  return state.phase === 'reveal' && state.revealLinkIdx >= telephoneRevealLastLinkIdx(state, state.revealIdx)
}

/**
 * Ce cran vient de dévoiler la chute de la chaîne à l'écran : la table
 * réagit, sur la vue PUBLIQUE. Revenir à une chaîne déjà vue (PREVIOUS)
 * ne relance rien. Une parole refusée ne coûte jamais le cran.
 */
export function withTelephoneSay(prev: TelephoneState, next: TelephoneState, sayRand: () => number): TelephoneState {
  const justShown =
    chainShown(next) && prev.phase === 'reveal' && prev.revealIdx === next.revealIdx && !chainShown(prev)
  if (!justShown) return next
  const moves = telephoneBotSay(toTelephoneSpectatorView(next), sayRand)
  if (moves.length === 0) return next
  try {
    return reduceTelephone(next, { type: 'SAY', moves })
  } catch (e) {
    if (e instanceof TelephoneEngineError) return next
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
