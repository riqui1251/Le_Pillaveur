import {
  createSFState,
  currentSFActorId,
  reduceSF,
  sfActive,
  toSFClientView,
  toSFSpectatorView,
  SFEngineError,
  SF_DEFAULT_ROUNDS,
  SF_MIN_PLAYERS,
  SF_MAX_PLAYERS,
  type SFState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { sfContentFor } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur de Sans Filtre : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface SFRoomMember {
  userId: string
  user: { displayName: string }
}

const SF_BOT_NAMES = [
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
 * l'hôte (filet jusqu'au minimum moteur pour le rematch après départs).
 * Le contenu est filtré selon l'ambiance de l'HÔTE (Soft = cartes sages).
 */
export function buildSFState(
  members: SFRoomMember[],
  ambiance: 'soft' | 'alcool',
  botsCount: number = 0,
  seed?: string | number,
  roundsCount?: number
): SFState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: SF_BOT_NAMES[botIndex % SF_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, SF_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < SF_MIN_PLAYERS) addBot()

  const { blacks, whites } = sfContentFor(ambiance)
  return createSFState(
    players,
    blacks,
    whites,
    seed ?? randomSeed(),
    Date.now(),
    roundsCount ?? SF_DEFAULT_ROUNDS
  )
}

export function serializeSFState(state: SFState): string {
  return JSON.stringify(state)
}

export function parseSFState(json: string | null): SFState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as SFState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      submissions: raw.submissions ?? [],
      rematchVotes: raw.rematchVotes ?? [],
      whiteDeck: raw.whiteDeck ?? [],
    }
  } catch {
    return null
  }
}

export type SFRoomActionInput =
  | { type: 'play-card'; card: number }
  | { type: 'judge-pick'; card: number }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type SFRoomActionResult = { ok: true; state: SFState } | { ok: false; error: string }

export function applySFRoomAction(
  state: SFState,
  userId: string,
  input: SFRoomActionInput
): SFRoomActionResult {
  try {
    switch (input.type) {
      case 'play-card':
        return {
          ok: true,
          state: reduceSF(state, {
            type: 'PLAY_CARD',
            playerId: userId,
            card: input.card,
            now: Date.now(),
          }),
        }
      case 'judge-pick':
        return {
          ok: true,
          state: reduceSF(state, {
            type: 'JUDGE_PICK',
            playerId: userId,
            card: input.card,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceSF(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceSF(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applySFBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceSF(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof SFEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markSFPlayerLeft(state: SFState, playerId: string, at: number): SFState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceSF(state, { type: 'LEAVE', playerId, at })
}

export function rejoinSFPlayer(state: SFState, playerId: string): SFState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceSF(state, { type: 'REJOIN', playerId })
}

export function convertSFPlayerToBot(state: SFState, playerId: string): SFState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  let next: SFState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
  // Un juge AFK devenu bot passe la main au prochain humain — même règle que
  // REPLACE_LEFT dans le moteur, pour ne pas geler la table jusqu'au timeout.
  if (next.judgeId === playerId && next.phase === 'judging') {
    const humans = sfActive(next).filter((p) => !p.isBot)
    const order = next.players.map((p) => p.id)
    const start = order.indexOf(playerId)
    for (let step = 1; step <= order.length && humans.length > 0; step++) {
      const candidate = next.players[(start + step) % order.length]
      if (!candidate.isBot && !candidate.leftAt) {
        next = { ...next, judgeId: candidate.id }
        break
      }
    }
  }
  return next
}

export function sfClientViewJson(state: SFState, viewerId: string): string {
  return JSON.stringify(toSFClientView(state, viewerId))
}

export function sfSpectatorViewJson(state: SFState): string {
  return JSON.stringify(toSFSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Les bots de DÉPART abattent leur carte dès l'entrée de manche (moteur) ;
 * ce tick ne concerne que les conversions en cours de manche : abattre pour
 * les bots en retard, couronner si le juge est devenu bot, mener le
 * « continuer » du reveal. Assumé faible — les bots n'existent qu'en
 * remplacement d'un joueur parti.
 */
export function applySFBotAction(state: SFState): SFRoomActionResult {
  try {
    if (state.phase === 'submit') {
      const pendingBots = sfActive(state).filter(
        (p) =>
          p.isBot &&
          p.id !== state.judgeId &&
          p.hand.length > 0 &&
          !state.submissions.some((s) => s.playerId === p.id)
      )
      if (pendingBots.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      let next = state
      for (const bot of pendingBots) {
        if (next.phase !== 'submit') break
        const hand = next.players.find((p) => p.id === bot.id)?.hand ?? []
        if (hand.length === 0) continue
        const card = hand[Math.floor(Math.random() * hand.length)]
        next = reduceSF(next, { type: 'PLAY_CARD', playerId: bot.id, card, now: Date.now() })
      }
      return { ok: true, state: next }
    }

    if (state.phase === 'judging') {
      const judge = state.players.find((p) => p.id === state.judgeId)
      if (!judge?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      const pick = state.submissions[Math.floor(Math.random() * state.submissions.length)]
      return {
        ok: true,
        state: reduceSF(state, {
          type: 'JUDGE_PICK',
          playerId: judge.id,
          card: pick.card,
          now: Date.now(),
        }),
      }
    }

    if (state.phase === 'reveal') {
      const actorId = currentSFActorId(state)
      const actor = state.players.find((p) => p.id === actorId)
      if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      return {
        ok: true,
        state: reduceSF(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }

    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof SFEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
