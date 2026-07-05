import {
  createLGState,
  currentLGActorId,
  lgAlive,
  reduceLG,
  toLGClientView,
  toLGSpectatorView,
  LGEngineError,
  LG_DEBATE_DEFAULT_MS,
  LG_MIN_PLAYERS,
  type LGState,
} from './engine'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Loup-Garou : sérialisation, mapping HTTP → actions
 * moteur, bots, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 *
 * ⚠️ Les BOTS agissent via le tick générique `bot` : le client arbitre ne
 * connaît PAS les rôles, il envoie le tick « au cas où » pendant les phases —
 * le serveur (qui sait tout) fait agir les bots concernés, ou répond
 * NOT_BOT_TURN sans rien changer.
 */

export interface LGRoomMember {
  userId: string
  user: { displayName: string }
}

const LG_BOT_NAMES = ['Barnabé 🤖', 'Gépéto 🤖', 'Raoul 🤖', 'Suzette 🤖', 'Marcel 🤖']

/**
 * Construit l'état initial. Le lobby exige 5 joueurs (la déduction sociale a
 * besoin d'humains) ; un REMATCH après des départs est complété par des bots
 * (leçon Menteur : tout launch doit tolérer peu de membres).
 */
export function buildLGState(
  members: LGRoomMember[],
  debateMs: number = LG_DEBATE_DEFAULT_MS,
  seed?: string | number
): LGState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  while (players.length < LG_MIN_PLAYERS) {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: LG_BOT_NAMES[botIndex % LG_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  return createLGState(players, seed ?? randomSeed(), debateMs)
}

export function serializeLGState(state: LGState): string {
  return JSON.stringify(state)
}

export function parseLGState(json: string | null): LGState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as LGState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      wolfVotes: raw.wolfVotes ?? {},
      dayVotes: raw.dayVotes ?? {},
      debateSkips: raw.debateSkips ?? [],
      seerPeeks: raw.seerPeeks ?? [],
    }
  } catch {
    return null
  }
}

export type LGRoomActionInput =
  | { type: 'seer-peek'; targetId: string }
  | { type: 'wolf-vote'; targetId: string }
  | { type: 'witch'; witchAction: 'save' | 'kill' | 'none'; targetId?: string }
  | { type: 'hunter-shot'; targetId: string }
  | { type: 'debate-skip' }
  | { type: 'day-vote'; targetId: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type LGRoomActionResult = { ok: true; state: LGState } | { ok: false; error: string }

export function applyLGRoomAction(
  state: LGState,
  userId: string,
  input: LGRoomActionInput
): LGRoomActionResult {
  try {
    switch (input.type) {
      case 'seer-peek':
        return {
          ok: true,
          state: reduceLG(state, { type: 'SEER_PEEK', playerId: userId, targetId: input.targetId }),
        }
      case 'wolf-vote':
        return {
          ok: true,
          state: reduceLG(state, { type: 'WOLF_VOTE', playerId: userId, targetId: input.targetId }),
        }
      case 'witch':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'WITCH_ACTION',
            playerId: userId,
            action: input.witchAction,
            targetId: input.targetId,
          }),
        }
      case 'hunter-shot':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'HUNTER_SHOT',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'debate-skip':
        return {
          ok: true,
          state: reduceLG(state, { type: 'DEBATE_SKIP', playerId: userId, now: Date.now() }),
        }
      case 'day-vote':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'DAY_VOTE',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceLG(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'bot':
        return applyLGBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof LGEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markLGPlayerLeft(state: LGState, playerId: string, at: number): LGState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceLG(state, { type: 'LEAVE', playerId, at })
}

export function rejoinLGPlayer(state: LGState, playerId: string): LGState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceLG(state, { type: 'REJOIN', playerId })
}

export function convertLGPlayerToBot(state: LGState, playerId: string): LGState | null {
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

export function lgClientViewJson(state: LGState, viewerId: string): string {
  return JSON.stringify(toLGClientView(state, viewerId))
}

export function lgSpectatorViewJson(state: LGState): string {
  return JSON.stringify(toLGSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Fait agir TOUS les bots concernés par la phase courante. Volontairement
 * basiques (les bots n'existent qu'en remplacement) : actions plausibles,
 * jamais optimales. Le hasard des choix utilise Math.random (entrée
 * « joueur ») ; les tirages du moteur restent sur le RNG seedé.
 */
export function applyLGBotAction(state: LGState): LGRoomActionResult {
  try {
    let next = state
    let acted = false
    const alive = () => lgAlive(next)

    if (next.phase === 'night-seer') {
      const seer = alive().find((p) => p.isBot && p.role === 'voyante')
      if (seer && !next.seerPeeks.some((pk) => pk.round === next.round)) {
        const targets = alive().filter((p) => p.id !== seer.id)
        next = reduceLG(next, {
          type: 'SEER_PEEK',
          playerId: seer.id,
          targetId: pickRandom(targets).id,
        })
        acted = true
      }
    } else if (next.phase === 'night-wolves') {
      for (const wolf of alive().filter((p) => p.isBot && p.role === 'loup')) {
        if (next.wolfVotes[wolf.id]) continue
        const targets = alive().filter((p) => p.role !== 'loup')
        if (targets.length === 0) break
        next = reduceLG(next, {
          type: 'WOLF_VOTE',
          playerId: wolf.id,
          targetId: pickRandom(targets).id,
        })
        acted = true
      }
    } else if (next.phase === 'night-witch') {
      const witch = alive().find((p) => p.isBot && p.role === 'sorciere')
      if (witch && !next.witchActed) {
        next = reduceLG(next, { type: 'WITCH_ACTION', playerId: witch.id, action: 'none' })
        acted = true
      }
    } else if (next.phase === 'hunter-shot') {
      const hunter = next.players.find((p) => p.id === next.pendingHunterId)
      if (hunter?.isBot) {
        const targets = alive()
        if (targets.length > 0) {
          next = reduceLG(next, {
            type: 'HUNTER_SHOT',
            playerId: hunter.id,
            targetId: pickRandom(targets).id,
            now: Date.now(),
          })
          acted = true
        }
      }
    } else if (next.phase === 'day-debate') {
      for (const bot of alive().filter((p) => p.isBot)) {
        if (next.phase !== 'day-debate') break
        if (next.debateSkips.includes(bot.id)) continue
        next = reduceLG(next, { type: 'DEBATE_SKIP', playerId: bot.id, now: Date.now() })
        acted = true
      }
    } else if (next.phase === 'day-vote' || next.phase === 'day-revote') {
      for (const bot of alive().filter((p) => p.isBot)) {
        if (next.phase !== 'day-vote' && next.phase !== 'day-revote') break
        if (next.dayVotes[bot.id]) continue
        const pool = alive().filter(
          (p) =>
            p.id !== bot.id &&
            (!next.revoteCandidates || next.revoteCandidates.includes(p.id))
        )
        if (pool.length === 0) continue
        next = reduceLG(next, {
          type: 'DAY_VOTE',
          playerId: bot.id,
          targetId: pickRandom(pool).id,
          now: Date.now(),
        })
        acted = true
      }
    }

    if (!acted) return { ok: false, error: 'NOT_BOT_TURN' }
    return { ok: true, state: next }
  } catch (e) {
    if (e instanceof LGEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { currentLGActorId }
