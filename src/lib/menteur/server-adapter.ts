import {
  createMenteurState,
  isMenteurAlive,
  menteurBotSeatId,
  menteurSeatPlayedByBot,
  menteurSkipOwnBidTurn,
  reduceMenteur,
  toMenteurClientView,
  toMenteurSpectatorView,
  MenteurEngineError,
  MENTEUR_MAX_PLAYERS,
  type MenteurAction,
  type MenteurRules,
  type MenteurState,
} from './engine'
import { menteurBotDecide } from './bot-brain'
import { menteurBotSay } from './bot-speech'
import { botDisplayName, botTraitsFor, pickBotPersonas } from '@/lib/online/bot-personas'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Menteur : sérialisation, mapping HTTP → actions
 * moteur, IA du bot, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface MenteurRoomMember {
  userId: string
  user: { displayName: string }
}

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte. Filet : on complète quand même jusqu'au minimum du moteur
 * (rematch après départs).
 */
export function buildMenteurState(
  members: MenteurRoomMember[],
  botsCount: number = 0,
  seed?: string | number,
  rules?: MenteurRules
): MenteurState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const botPersonas = pickBotPersonas(MENTEUR_MAX_PLAYERS)
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, MENTEUR_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < 2) addBot()
  return createMenteurState(players, seed ?? randomSeed(), rules)
}

export function serializeMenteurState(state: MenteurState): string {
  return JSON.stringify(state)
}

export function parseMenteurState(json: string | null): MenteurState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as MenteurState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    // Champs arrivés après coup : un état sérialisé avant eux se joue tel quel.
    return menteurSkipOwnBidTurn({
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      revealAt: raw.revealAt ?? null,
      bids: raw.bids ?? [],
      duels: raw.duels ?? [],
      speech: raw.speech ?? [],
    })
  } catch {
    return null
  }
}

export type MenteurRoomActionInput =
  | { type: 'bid'; qty: number; face: number }
  | { type: 'dudo' }
  | { type: 'calza' }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type MenteurRoomActionResult =
  | { ok: true; state: MenteurState }
  | { ok: false; error: string }

/**
 * `now` est injecté pour la simulation (horloge virtuelle) : la route, elle,
 * garde l'heure du serveur.
 */
export function applyMenteurRoomAction(
  state: MenteurState,
  userId: string,
  input: MenteurRoomActionInput,
  now: number = Date.now()
): MenteurRoomActionResult {
  try {
    switch (input.type) {
      case 'bid':
        return { ok: true, state: reduceMenteur(state, { type: 'BID', playerId: userId, qty: input.qty, face: input.face }) }
      case 'dudo':
        return { ok: true, state: reduceMenteur(state, { type: 'DUDO', playerId: userId, now }) }
      case 'calza':
        return { ok: true, state: reduceMenteur(state, { type: 'CALZA', playerId: userId, now }) }
      case 'continue':
        return {
          ok: true,
          state: reduceMenteur(state, { type: 'CONTINUE', playerId: userId, now }),
        }
      case 'bot':
        return applyMenteurBotAction(state, Math.random, now)
      case 'replace-left':
        return {
          ok: true,
          state: reduceMenteur(state, { type: 'REPLACE_LEFT', now, graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof MenteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

/** Quitter en partie → marqué « parti » (grâce avant bot). Null = no-op. */
export function markMenteurPlayerLeft(
  state: MenteurState,
  playerId: string,
  at: number
): MenteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceMenteur(state, { type: 'LEAVE', playerId, at })
}

export function rejoinMenteurPlayer(state: MenteurState, playerId: string): MenteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceMenteur(state, { type: 'REJOIN', playerId })
}

/** Conversion directe en bot (expulsion AFK — validée par la route). */
export function convertMenteurPlayerToBot(state: MenteurState, playerId: string): MenteurState | null {
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

export function menteurClientViewJson(state: MenteurState, viewerId: string): string {
  return JSON.stringify(toMenteurClientView(state, viewerId))
}

export function menteurSpectatorViewJson(state: MenteurState): string {
  return JSON.stringify(toMenteurSpectatorView(state))
}

// ─── IA du bot ───────────────────────────────────────────────────────────────

/**
 * Un coup du bot au tour : « manche suivante » s'il mène la révélation, sinon
 * le coup que son cerveau (bot-brain.ts) décide sur SA vue, selon les traits
 * de son persona — retrouvé par le nom, un converti joue en DEFAULT_BOT_TRAITS
 * —, avec la parole qu'il y joint (bot-speech.ts), dans UNE réduction. Le
 * tour d'un humain parti se joue de même, comme celui d'un converti, mais
 * sans parole : il n'a rien dit.
 * `rand` et `now` sont injectés (simulation, tests) : avec la même suite
 * `rand`, le même coup. Le pourquoi du coup ne sort pas d'ici.
 *
 * `sayRand` tire les paroles : la simulation lui donne un flux à part, pour
 * que les phrases ne déplacent aucun tirage du jeu — une partie se rejoue à
 * l'identique avec ou sans elles. En production, les deux sont Math.random.
 */
export function applyMenteurBotAction(
  state: MenteurState,
  rand: () => number = Math.random,
  now: number = Date.now(),
  sayRand: () => number = rand
): MenteurRoomActionResult {
  const actorId = menteurBotSeatId(state)
  const actor = state.players.find((p) => p.id === actorId)
  if (!actor || !menteurSeatPlayedByBot(actor)) return { ok: false, error: 'NOT_BOT_TURN' }

  try {
    if (state.phase === 'reveal') {
      return { ok: true, state: reduceMenteur(state, { type: 'CONTINUE', playerId: actor.id, now }) }
    }
    if (state.phase !== 'bidding') return { ok: false, error: 'NOT_BIDDING' }

    const view = toMenteurClientView(state, actor.id)
    const traits = botTraitsFor(actor.name)
    const { action: move, why } = menteurBotDecide(view, actor.id, traits, rand)
    const said = actor.isBot ? menteurBotSay(view, actor.id, move, why, traits, sayRand) : null
    const say = said?.targetId ? { kind: said.kind, targetId: said.targetId } : undefined
    const action: MenteurAction =
      move.type === 'BID'
        ? { type: 'BID', playerId: actor.id, qty: move.qty, face: move.face, say }
        : { type: move.type, playerId: actor.id, now, say }
    return { ok: true, state: reduceMenteur(state, action) }
  } catch (e) {
    if (e instanceof MenteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { isMenteurAlive }
