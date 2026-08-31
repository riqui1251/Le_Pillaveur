import {
  createPreState,
  currentPreActorId,
  preCloseNeeded,
  preRankOf,
  prePickBotPlay,
  reducePre,
  toPreClientView,
  toPreSpectatorView,
  PreEngineError,
  PRE_DEFAULT_MANCHES,
  PRE_MIN_PLAYERS,
  PRE_MAX_PLAYERS,
  type PreState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Président : sérialisation, mapping HTTP → actions
 * moteur, bots (plus petit combo valide), vues anti-triche (mains cachées).
 */

export interface PreRoomMember {
  userId: string
  user: { displayName: string }
}

export function buildPreState(
  members: PreRoomMember[],
  botsCount: number = 0,
  seed?: string | number,
  manchesCount?: number,
  previousRanking: string[] | null = null
): PreState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const botPersonas = pickBotPersonas(PRE_MAX_PLAYERS)
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, PRE_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < PRE_MIN_PLAYERS) addBot()

  return createPreState(
    players,
    seed ?? randomSeed(),
    Date.now(),
    manchesCount ?? PRE_DEFAULT_MANCHES,
    previousRanking
  )
}

export function serializePreState(state: PreState): string {
  return JSON.stringify(state)
}

export function parsePreState(json: string | null): PreState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as PreState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      trickRun: raw.trickRun ?? null,
      passedIds: raw.passedIds ?? [],
      outOrder: raw.outOrder ?? [],
      rematchVotes: raw.rematchVotes ?? [],
    }
  } catch {
    return null
  }
}

export type PreRoomActionInput =
  | { type: 'play'; cards: number[] }
  | { type: 'close'; cards: number[] }
  | { type: 'pass' }
  | { type: 'continue' }
  | { type: 'advance'; phaseKey: string }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type PreRoomActionResult = { ok: true; state: PreState } | { ok: false; error: string }

export function applyPreRoomAction(
  state: PreState,
  userId: string,
  input: PreRoomActionInput
): PreRoomActionResult {
  try {
    switch (input.type) {
      case 'play':
        return {
          ok: true,
          state: reducePre(state, {
            type: 'PLAY',
            playerId: userId,
            cards: input.cards,
            now: Date.now(),
          }),
        }
      case 'close':
        return {
          ok: true,
          state: reducePre(state, {
            type: 'CLOSE',
            playerId: userId,
            cards: input.cards,
            now: Date.now(),
          }),
        }
      case 'pass':
        return {
          ok: true,
          state: reducePre(state, { type: 'PASS', playerId: userId, now: Date.now() }),
        }
      case 'continue':
        return {
          ok: true,
          state: reducePre(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'advance':
        return {
          ok: true,
          state: reducePre(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'bot':
        return applyPreBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reducePre(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof PreEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markPrePlayerLeft(state: PreState, playerId: string, at: number): PreState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reducePre(state, { type: 'LEAVE', playerId, at })
}

export function rejoinPrePlayer(state: PreState, playerId: string): PreState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reducePre(state, { type: 'REJOIN', playerId })
}

export function convertPrePlayerToBot(state: PreState, playerId: string): PreState | null {
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

export function preClientViewJson(state: PreState, viewerId: string): string {
  return JSON.stringify(toPreClientView(state, viewerId))
}

export function preSpectatorViewJson(state: PreState): string {
  return JSON.stringify(toPreSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/** Le bot au tour pose le plus petit combo valide, sinon passe ; en interlude, il continue. */
export function applyPreBotAction(state: PreState): PreRoomActionResult {
  try {
    // FERMETURE hors tour : un bot qui possède les cartes manquantes du rang
    // au sommet du pli les claque — prioritaire sur le tour courant.
    if (state.phase === 'playing') {
      const needed = preCloseNeeded(state)
      if (needed) {
        const closer = state.players.find(
          (p) =>
            p.isBot &&
            !p.leftAt &&
            p.hand.length > 0 &&
            p.hand.filter((c) => preRankOf(c) === needed.rank).length === needed.count
        )
        if (closer) {
          const cards = closer.hand.filter((c) => preRankOf(c) === needed.rank)
          return {
            ok: true,
            state: reducePre(state, { type: 'CLOSE', playerId: closer.id, cards, now: Date.now() }),
          }
        }
      }
    }

    const actorId = currentPreActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }

    if (state.phase === 'playing') {
      const play = prePickBotPlay(state, actor.id)
      if (play) {
        return {
          ok: true,
          state: reducePre(state, { type: 'PLAY', playerId: actor.id, cards: play, now: Date.now() }),
        }
      }
      return {
        ok: true,
        state: reducePre(state, { type: 'PASS', playerId: actor.id, now: Date.now() }),
      }
    }

    if (state.phase === 'interlude') {
      return {
        ok: true,
        state: reducePre(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }

    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof PreEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
