import {
  createEspionState,
  espionRevealLeaderId,
  reduceEspion,
  toEspionClientView,
  toEspionSpectatorView,
  EspionEngineError,
  ESPION_DEFAULT_DISCUSSION_MS,
  ESPION_DEFAULT_ROUNDS_TO_WIN,
  ESPION_MIN_PLAYERS,
  ESPION_MAX_PLAYERS,
  ESPION_HUMAN_SPEAK_KINDS,
  type EspionHumanSpeakKind,
  type EspionState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { getEspionLocations } from './data'
// ⚠️ Le carnet est réservé au serveur (data/attributes.test.ts, G5) : il n'entre dans le cerveau qu'en dépendance.
import { espionAttrsOf } from './data/attributes'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { espionBotMove } from './bot-speech'
import type { EspionBotDeps } from './bot-brain'

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
      // Parties lancées avant le fil de questions : fil vide, aucun refus.
      speech: Array.isArray(raw.speech) ? raw.speech : [],
      // Révélation d'avant le plancher de lecture : jamais bloquée.
      revealAt: raw.revealAt ?? null,
      activeAccusation: raw.activeAccusation
        ? { ...raw.activeAccusation, declined: raw.activeAccusation.declined ?? [] }
        : null,
    }
  } catch {
    return null
  }
}

export type EspionRoomActionInput =
  | { type: 'accuse'; targetId: string }
  | { type: 'support' }
  | { type: 'decline' }
  | { type: 'ask'; targetId: string; questionId: string }
  | { type: 'answer'; value: string }
  | { type: 'speak'; kind: string; targetId: string }
  | { type: 'guess-location'; locationId: string }
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
      case 'decline':
        return {
          ok: true,
          state: reduceEspion(state, { type: 'DECLINE', playerId: userId, now: Date.now() }),
        }
      case 'ask':
        return {
          ok: true,
          state: reduceEspion(state, {
            type: 'ASK',
            playerId: userId,
            targetId: input.targetId,
            questionId: input.questionId,
            now: Date.now(),
          }),
        }
      case 'answer':
        return {
          ok: true,
          state: reduceEspion(state, { type: 'ANSWER', playerId: userId, value: input.value, now: Date.now() }),
        }
      case 'speak':
        // Un humain n'a que « Je trouve ça louche » et « Me défendre » ; les
        // autres paroles (alliance, remarques…) sont celles des bots.
        if (!(ESPION_HUMAN_SPEAK_KINDS as readonly string[]).includes(input.kind)) {
          return { ok: false, error: 'INVALID_KIND' }
        }
        return {
          ok: true,
          state: reduceEspion(state, {
            type: 'SPEAK',
            playerId: userId,
            kind: input.kind as EspionHumanSpeakKind,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'guess-location':
        return {
          ok: true,
          state: reduceEspion(state, {
            type: 'GUESS_LOCATION',
            playerId: userId,
            ...('locationId' in input ? { locationId: input.locationId } : { location: input.location }),
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

export function rejoinEspionPlayer(
  state: EspionState,
  playerId: string,
  now: number = Date.now()
): EspionState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceEspion(state, { type: 'REJOIN', playerId, now })
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

/** Le carnet prêté au cerveau des bots : seul ce module serveur l'importe. */
export const ESPION_BOT_DEPS: EspionBotDeps = { attrsOf: espionAttrsOf }

/**
 * Les bots sont choisis par l'hôte au lobby (table complétée, partie solo)
 * ou remplacent un joueur parti. En discussion, le planificateur
 * (bot-speech.ts) joue UNE écriture par tick quand une échéance publique est
 * due : devinette, soutien ou refus groupés, réponse, accusation, dernier
 * appel ou question suivante. Au reveal, le premier présent, s'il est bot,
 * « continue ». `rand`, `now` et `deps` sont injectables : une partie se
 * rejoue à l'identique.
 */
export function applyEspionBotAction(
  state: EspionState,
  rand: () => number = Math.random,
  now: number = Date.now(),
  deps: EspionBotDeps = ESPION_BOT_DEPS
): EspionRoomActionResult {
  try {
    if (state.phase === 'discussion') {
      const actions = espionBotMove(state, now, rand, deps)
      if (!actions) return { ok: false, error: 'NOT_BOT_TURN' }
      return { ok: true, state: actions.reduce(reduceEspion, state) }
    }

    const actorId = espionRevealLeaderId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'reveal') {
      return {
        ok: true,
        state: reduceEspion(state, { type: 'CONTINUE', playerId: actor.id, now }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof EspionEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
