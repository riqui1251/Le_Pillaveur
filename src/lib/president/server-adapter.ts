import {
  createPreState,
  currentPreActorId,
  preCloseNeeded,
  preRankOf,
  prePickBotPlay,
  reducePre,
  toPreClientView,
  toPreSpectatorView,
  withPreSpeech,
  PreEngineError,
  PRE_DEFAULT_MANCHES,
  PRE_MIN_PLAYERS,
  PRE_MAX_PLAYERS,
  type PreState,
} from './engine'
import { presidentBotSpeech, type PreSpeechEvent } from './bot-speech'
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
      lastExchange: raw.lastExchange ?? null,
      trickPlays: raw.trickPlays ?? [],
      trickHistory: raw.trickHistory ?? [],
      passedIds: raw.passedIds ?? [],
      outOrder: raw.outOrder ?? [],
      rematchVotes: raw.rematchVotes ?? [],
      speech: raw.speech ?? [],
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

/**
 * Les paroles des bots jointes à une transition (bot-speech.ts), lues sur les
 * vues SPECTATEUR : le planificateur ne voit aucune main. Écrites dans l'état
 * qui sort du coup, même écriture. Une parole refusée par le moteur ne coûte
 * jamais le coup : il passe sans elle.
 */
export function withPreBotTalk(
  before: PreState,
  after: PreState,
  event: PreSpeechEvent | null,
  rand: () => number = Math.random
): PreState {
  const says = presidentBotSpeech(toPreSpectatorView(before), toPreSpectatorView(after), event, rand)
  if (says.length === 0) return after
  try {
    return withPreSpeech(after, says)
  } catch (e) {
    if (e instanceof PreEngineError) return after
    throw e
  }
}

export function applyPreRoomAction(
  state: PreState,
  userId: string,
  input: PreRoomActionInput
): PreRoomActionResult {
  try {
    switch (input.type) {
      case 'play': {
        const next = reducePre(state, { type: 'PLAY', playerId: userId, cards: input.cards, now: Date.now() })
        return { ok: true, state: withPreBotTalk(state, next, { type: 'play', playerId: userId, cards: input.cards }) }
      }
      case 'close': {
        const next = reducePre(state, { type: 'CLOSE', playerId: userId, cards: input.cards, now: Date.now() })
        return { ok: true, state: withPreBotTalk(state, next, { type: 'close', playerId: userId, cards: input.cards }) }
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
      case 'advance': {
        // Minuteur : la pose d'office n'est pas un choix, seule la fin de manche fait parler.
        const next = reducePre(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() })
        return { ok: true, state: withPreBotTalk(state, next, null) }
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

/**
 * Le bot au tour pose le plus petit combo valide, sinon passe ; en interlude,
 * il continue. Sa pose ou sa fermeture porte ses paroles (withPreBotTalk) ;
 * `sayRand` ne tire que les paroles, le coup reste celui de prePickBotPlay.
 */
export function applyPreBotAction(state: PreState, sayRand: () => number = Math.random): PreRoomActionResult {
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
          const next = reducePre(state, { type: 'CLOSE', playerId: closer.id, cards, now: Date.now() })
          return { ok: true, state: withPreBotTalk(state, next, { type: 'close', playerId: closer.id, cards }, sayRand) }
        }
      }
    }

    const actorId = currentPreActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }

    if (state.phase === 'playing') {
      const play = prePickBotPlay(state, actor.id)
      if (play) {
        const next = reducePre(state, { type: 'PLAY', playerId: actor.id, cards: play, now: Date.now() })
        return { ok: true, state: withPreBotTalk(state, next, { type: 'play', playerId: actor.id, cards: play }, sayRand) }
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
