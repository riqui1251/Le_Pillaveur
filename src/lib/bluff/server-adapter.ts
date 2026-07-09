import {
  createBluffState,
  currentBluffActorId,
  bluffActive,
  reduceBluff,
  toBluffClientView,
  toBluffSpectatorView,
  BluffEngineError,
  BLUFF_DEFAULT_ROUNDS,
  BLUFF_MIN_PLAYERS,
  BLUFF_MAX_PLAYERS,
  type BluffState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { getBluffPrompts } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Grand Bluff : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface BluffRoomMember {
  userId: string
  user: { displayName: string }
}

const BLUFF_BOT_NAMES = [
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
 * (rematch après départs).
 */
export function buildBluffState(
  members: BluffRoomMember[],
  lang: string | null | undefined,
  botsCount: number = 0,
  seed?: string | number,
  roundsCount?: number
): BluffState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: BLUFF_BOT_NAMES[botIndex % BLUFF_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, BLUFF_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < BLUFF_MIN_PLAYERS) addBot()
  return createBluffState(
    players,
    getBluffPrompts(lang),
    seed ?? randomSeed(),
    Date.now(),
    roundsCount ?? BLUFF_DEFAULT_ROUNDS
  )
}

export function serializeBluffState(state: BluffState): string {
  return JSON.stringify(state)
}

export function parseBluffState(json: string | null): BluffState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as BluffState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      pendingFakes: raw.pendingFakes ?? {},
      pendingVotes: raw.pendingVotes ?? {},
      candidates: raw.candidates ?? [],
    }
  } catch {
    return null
  }
}

export type BluffRoomActionInput =
  | { type: 'submit-fake'; text: string }
  | { type: 'vote'; candidateId: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type BluffRoomActionResult =
  | { ok: true; state: BluffState }
  | { ok: false; error: string }

export function applyBluffRoomAction(
  state: BluffState,
  userId: string,
  input: BluffRoomActionInput
): BluffRoomActionResult {
  try {
    switch (input.type) {
      case 'submit-fake':
        return {
          ok: true,
          state: reduceBluff(state, {
            type: 'SUBMIT_FAKE',
            playerId: userId,
            text: input.text,
            now: Date.now(),
          }),
        }
      case 'vote':
        return {
          ok: true,
          state: reduceBluff(state, {
            type: 'VOTE',
            playerId: userId,
            candidateId: input.candidateId,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceBluff(state, {
            type: 'ADVANCE',
            claimedKey: input.phaseKey,
            now: Date.now(),
          }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceBluff(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyBluffBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceBluff(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof BluffEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markBluffPlayerLeft(
  state: BluffState,
  playerId: string,
  at: number
): BluffState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceBluff(state, { type: 'LEAVE', playerId, at })
}

export function rejoinBluffPlayer(state: BluffState, playerId: string): BluffState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceBluff(state, { type: 'REJOIN', playerId })
}

export function convertBluffPlayerToBot(state: BluffState, playerId: string): BluffState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
}

export function bluffClientViewJson(state: BluffState, viewerId: string): string {
  return JSON.stringify(toBluffClientView(state, viewerId))
}

export function bluffSpectatorViewJson(state: BluffState): string {
  return JSON.stringify(toBluffSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Un bot bluffe avec un des mauvais choix ORIGINAUX de la question (garanti
 * plausible) et vote au hasard (hors son propre bluff — jamais pondéré vers
 * la vraie réponse, pour ne pas trahir de secret). Assumé faible — les bots
 * n'existent qu'en REMPLACEMENT d'un joueur parti.
 *
 * Pendant `submit`/`vote` (simultanés), un seul tick fait agir TOUS les bots
 * en attente d'un coup.
 */
export function applyBluffBotAction(state: BluffState): BluffRoomActionResult {
  try {
    if (state.phase === 'submit') {
      const active = bluffActive(state)
      const pendingBots = active.filter((p) => p.isBot && !state.pendingFakes[p.id])
      if (pendingBots.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      const prompt = state.roundPrompts[state.promptIdx]
      let next = state
      for (const bot of pendingBots) {
        if (next.phase !== 'submit') break
        const decoy =
          prompt.decoys[Math.floor(Math.random() * prompt.decoys.length)] ?? prompt.answer
        next = reduceBluff(next, {
          type: 'SUBMIT_FAKE',
          playerId: bot.id,
          text: decoy,
          now: Date.now(),
        })
      }
      return { ok: true, state: next }
    }

    if (state.phase === 'vote') {
      const active = bluffActive(state)
      const pendingBots = active.filter((p) => p.isBot && !state.pendingVotes[p.id])
      if (pendingBots.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      let next = state
      for (const bot of pendingBots) {
        if (next.phase !== 'vote') break
        const options = next.candidates.filter((c) => c.authorId !== bot.id)
        const target = options[Math.floor(Math.random() * options.length)]
        next = reduceBluff(next, {
          type: 'VOTE',
          playerId: bot.id,
          candidateId: target.candidateId,
          now: Date.now(),
        })
      }
      return { ok: true, state: next }
    }

    const actorId = currentBluffActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'reveal') {
      return {
        ok: true,
        state: reduceBluff(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof BluffEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
