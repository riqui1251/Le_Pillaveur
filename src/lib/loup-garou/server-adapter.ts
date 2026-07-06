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
  LG_MAX_PLAYERS,
  type LGPlayer,
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
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte (réglage lobby). Filet de sécurité : on complète quand même
 * jusqu'au minimum du moteur (rematch après départs — leçon Menteur).
 */
export function buildLGState(
  members: LGRoomMember[],
  debateMs: number = LG_DEBATE_DEFAULT_MS,
  botsCount: number = 0,
  seed?: string | number
): LGState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: LG_BOT_NAMES[botIndex % LG_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, LG_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < LG_MIN_PLAYERS) addBot()
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
      debateSpeech: raw.debateSpeech ?? [],
      seerPeeks: raw.seerPeeks ?? [],
      // Parties sérialisées avant l'arrivée du Salvateur/Corbeau/Ancien.
      guardProtectedId: raw.guardProtectedId ?? null,
      guardLastProtectedId: raw.guardLastProtectedId ?? null,
      ravenTargetId: raw.ravenTargetId ?? null,
      elderLifeUsed: raw.elderLifeUsed ?? false,
    }
  } catch {
    return null
  }
}

export type LGRoomActionInput =
  | { type: 'guard-protect'; targetId: string }
  | { type: 'raven-mark'; targetId: string }
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
      case 'guard-protect':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'GUARD_PROTECT',
            playerId: userId,
            targetId: input.targetId,
          }),
        }
      case 'raven-mark':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'RAVEN_MARK',
            playerId: userId,
            targetId: input.targetId,
          }),
        }
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

    if (next.phase === 'night-guard') {
      const guard = alive().find((p) => p.isBot && p.role === 'salvateur')
      if (guard && !next.guardProtectedId) {
        // Protège un vivant au hasard (lui compris) — jamais le protégé d'hier.
        const targets = alive().filter((p) => p.id !== next.guardLastProtectedId)
        if (targets.length > 0) {
          next = reduceLG(next, {
            type: 'GUARD_PROTECT',
            playerId: guard.id,
            targetId: pickRandom(targets).id,
          })
          acted = true
        }
      }
    } else if (next.phase === 'night-raven') {
      const raven = alive().find((p) => p.isBot && p.role === 'corbeau')
      if (raven && !next.ravenTargetId) {
        const targets = alive().filter((p) => p.id !== raven.id)
        if (targets.length > 0) {
          next = reduceLG(next, {
            type: 'RAVEN_MARK',
            playerId: raven.id,
            targetId: pickRandom(targets).id,
          })
          acted = true
        }
      }
    } else if (next.phase === 'night-seer') {
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
      // Étape 1 : chaque bot PARLE (se défend s'il est accusé, sinon accuse —
      // les loups détournent les soupçons vers des non-loups — ou propose une
      // alliance). Étape 2 (tick suivant) : quand tous ont parlé, ils passent
      // au vote.
      const bots = alive().filter((p) => p.isBot)
      const spoke = (id: string) =>
        next.debateSpeech.some((sp) => sp.playerId === id && sp.round === next.round)
      const silent = bots.filter((b) => !spoke(b.id))
      if (silent.length > 0) {
        for (const bot of silent) {
          if (next.phase !== 'day-debate') break
          const accusedBy = next.debateSpeech.find(
            (sp) => sp.round === next.round && sp.kind === 'suspect' && sp.targetId === bot.id
          )
          let kind: 'suspect' | 'defend' | 'ally'
          let target: LGPlayer | undefined
          if (accusedBy && accusedBy.playerId !== bot.id) {
            kind = 'defend'
            target = next.players.find((p) => p.id === accusedBy.playerId && p.alive)
          }
          if (!target) {
            kind = Math.random() < 0.3 ? 'ally' : 'suspect'
            const pool = alive().filter(
              (p) => p.id !== bot.id && (bot.role !== 'loup' || p.role !== 'loup')
            )
            if (pool.length === 0) continue
            target = pickRandom(pool)
          }
          next = reduceLG(next, {
            type: 'DEBATE_SPEAK',
            playerId: bot.id,
            kind: kind!,
            targetId: target.id,
          })
          acted = true
        }
      } else {
        for (const bot of bots) {
          if (next.phase !== 'day-debate') break
          if (next.debateSkips.includes(bot.id)) continue
          next = reduceLG(next, { type: 'DEBATE_SKIP', playerId: bot.id, now: Date.now() })
          acted = true
        }
      }
    } else if (next.phase === 'day-vote' || next.phase === 'day-revote') {
      // Vote informé par le débat : cible la plus accusée (les loups évitent
      // toujours leurs complices).
      const tally = new Map<string, number>()
      for (const sp of next.debateSpeech) {
        if (sp.round === next.round && sp.kind === 'suspect' && sp.targetId) {
          tally.set(sp.targetId, (tally.get(sp.targetId) ?? 0) + 1)
        }
      }
      for (const bot of alive().filter((p) => p.isBot)) {
        if (next.phase !== 'day-vote' && next.phase !== 'day-revote') break
        if (next.dayVotes[bot.id]) continue
        const pool = alive().filter(
          (p) =>
            p.id !== bot.id &&
            (bot.role !== 'loup' || p.role !== 'loup') &&
            (!next.revoteCandidates || next.revoteCandidates.includes(p.id))
        )
        const fallback = alive().filter(
          (p) =>
            p.id !== bot.id &&
            (!next.revoteCandidates || next.revoteCandidates.includes(p.id))
        )
        const candidates = pool.length > 0 ? pool : fallback
        if (candidates.length === 0) continue
        const best = [...candidates].sort(
          (a, b) => (tally.get(b.id) ?? 0) - (tally.get(a.id) ?? 0)
        )
        const top = tally.get(best[0].id) ?? 0
        const tied = best.filter((p) => (tally.get(p.id) ?? 0) === top)
        next = reduceLG(next, {
          type: 'DAY_VOTE',
          playerId: bot.id,
          targetId: pickRandom(tied).id,
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
