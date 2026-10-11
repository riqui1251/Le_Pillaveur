import {
  createLGState,
  currentLGActorId,
  lgAlive,
  lgBotHunterTarget,
  lgBotWitchAction,
  lgBotWolfTarget,
  lgMostSuspect,
  lgSuspicion,
  reduceLG,
  toLGClientView,
  toLGSpectatorView,
  LGEngineError,
  LG_DEBATE_DEFAULT_MS,
  LG_MIN_PLAYERS,
  LG_MAX_PLAYERS,
  type LGDebateSpeech,
  type LGState,
} from './engine'
import { lgBotDebateMove } from './bot-debate'
import { botDisplayName, botTraitsFor, pickBotPersonas } from '@/lib/online/bot-personas'
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

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte (réglage lobby). Filet de sécurité : on complète quand même
 * jusqu'au minimum du moteur (rematch après départs — leçon Menteur).
 */
export function buildLGState(
  members: LGRoomMember[],
  debateMs: number = LG_DEBATE_DEFAULT_MS,
  botsCount: number = 0,
  seed?: string | number,
  extraWolf: boolean = false
): LGState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const botPersonas = pickBotPersonas(LG_MAX_PLAYERS)
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, LG_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < LG_MIN_PLAYERS) addBot()
  return createLGState(players, seed ?? randomSeed(), debateMs, Date.now(), extraWolf)
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
      mayorId: raw.mayorId ?? null,
      mayorVotes: raw.mayorVotes ?? {},
      dayVotes: raw.dayVotes ?? {},
      debateSkips: raw.debateSkips ?? [],
      debateSpeech: raw.debateSpeech ?? [],
      seerPeeks: raw.seerPeeks ?? [],
      // Parties sérialisées avant l'arrivée du Salvateur/Corbeau/Ancien.
      guardProtectedId: raw.guardProtectedId ?? null,
      guardLastProtectedId: raw.guardLastProtectedId ?? null,
      ravenTargetId: raw.ravenTargetId ?? null,
      elderLifeUsed: raw.elderLifeUsed ?? false,
      elderAttackedRound: raw.elderAttackedRound ?? null,
    }
  } catch {
    return null
  }
}

/** Paroles qu'un HUMAIN peut émettre par les boutons du débat. */
export const LG_SPEAK_KINDS = ['suspect', 'defend', 'ally'] as const satisfies readonly LGDebateSpeech['kind'][]
export type LGSpeakKind = (typeof LG_SPEAK_KINDS)[number]

export type LGRoomActionInput =
  | { type: 'mayor-vote'; targetId: string }
  | { type: 'debate-speak'; kind: LGSpeakKind; targetId: string }
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
      case 'mayor-vote':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'MAYOR_VOTE',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'guard-protect':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'GUARD_PROTECT',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'raven-mark':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'RAVEN_MARK',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'seer-peek':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'SEER_PEEK',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
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
            now: Date.now(),
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
      case 'debate-speak':
        return {
          ok: true,
          state: reduceLG(state, {
            type: 'DEBATE_SPEAK',
            playerId: userId,
            kind: input.kind,
            targetId: input.targetId,
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

function pickRandom<T>(arr: T[], rand: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]
}

/**
 * Part des nuits où la meute des loups bots frappe au hasard plutôt que sur
 * sa cible commune (`lgBotWolfTarget`) : la convergence sur « celui qui a
 * nommé un loup » reste lisible sans devenir une certitude.
 */
export const LG_WOLF_RANDOM_SHARE = 0.25

/**
 * Fait agir les bots concernés par la phase courante. Ils jouent avec ce
 * qu'un joueur verrait : le score de soupçon public (`lgSuspicion`) guide
 * l'accusation, le vote, la potion de mort et le tir du chasseur ; la voyante
 * bot sonde le plus suspect et s'en souvient ; les loups bots convergent sur
 * qui a nommé un loup. Seuls le maire, le Salvateur et le Corbeau restent au
 * hasard (invisibles de l'écran « Le village dort… »). Nuit et votes en un
 * tick, débat UN COUP PAR TICK via `lgBotDebateMove` (./bot-debate). `rand`
 * et `now` sont injectés pour les tests ; en production, Math.random (entrée
 * « joueur ») et l'horloge — les tirages du moteur restent sur le RNG seedé.
 */
export function applyLGBotAction(
  state: LGState,
  rand: () => number = Math.random,
  now: number = Date.now()
): LGRoomActionResult {
  try {
    let next = state
    let acted = false
    const alive = () => lgAlive(next)

    if (next.phase === 'mayor-election') {
      for (const bot of alive().filter((p) => p.isBot)) {
        if (next.mayorVotes[bot.id]) continue
        const candidates = alive()
        if (candidates.length === 0) continue
        next = reduceLG(next, {
          type: 'MAYOR_VOTE',
          playerId: bot.id,
          targetId: pickRandom(candidates, rand).id,
          now,
        })
        acted = true
      }
    } else if (next.phase === 'night-guard') {
      const guard = alive().find((p) => p.isBot && p.role === 'salvateur')
      if (guard && !next.guardProtectedId) {
        // Protège un vivant au hasard (lui compris) — jamais le protégé d'hier.
        const targets = alive().filter((p) => p.id !== next.guardLastProtectedId)
        if (targets.length > 0) {
          next = reduceLG(next, {
            type: 'GUARD_PROTECT',
            playerId: guard.id,
            targetId: pickRandom(targets, rand).id,
            now,
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
            targetId: pickRandom(targets, rand).id,
            now,
          })
          acted = true
        }
      }
    } else if (next.phase === 'night-seer') {
      const seer = alive().find((p) => p.isBot && p.role === 'voyante')
      if (seer && !next.seerPeeks.some((pk) => pk.round === next.round)) {
        // Sonde le plus suspect qu'elle n'a pas encore vu (tous vus : n'importe lequel).
        const seen = new Set(next.seerPeeks.map((pk) => pk.targetId))
        const targets = alive().filter((p) => p.id !== seer.id)
        const fresh = targets.filter((p) => !seen.has(p.id))
        const pool = fresh.length > 0 ? fresh : targets
        const tied = lgMostSuspect(lgSuspicion(next, seer.id), pool.map((p) => p.id))
        next = reduceLG(next, {
          type: 'SEER_PEEK',
          playerId: seer.id,
          targetId: pickRandom(tied, rand),
          now,
        })
        acted = true
      }
    } else if (next.phase === 'night-wolves') {
      const wolves = alive().filter((p) => p.isBot && p.role === 'loup' && !next.wolfVotes[p.id])
      const targets = alive().filter((p) => p.role !== 'loup')
      if (wolves.length > 0 && targets.length > 0) {
        // Une seule cible pour toute la meute du tick : la menace commune, ou
        // une victime au hasard une nuit sur quatre — et quand rien ne la
        // désigne (première nuit, table muette).
        const targetId =
          rand() < LG_WOLF_RANDOM_SHARE
            ? pickRandom(targets, rand).id
            : (lgBotWolfTarget(next) ?? pickRandom(targets, rand).id)
        for (const wolf of wolves) {
          next = reduceLG(next, { type: 'WOLF_VOTE', playerId: wolf.id, targetId })
          acted = true
        }
      }
    } else if (next.phase === 'night-witch') {
      const witch = alive().find((p) => p.isBot && p.role === 'sorciere')
      if (witch && !next.witchActed) {
        // Décision DÉTERMINISTE du moteur (lgBotWitchAction) : une sorcière
        // bot sauve quand ça vaut le coup et n'empoisonne que rarement —
        // avant, elle passait systématiquement son tour (F39).
        const decision = lgBotWitchAction(next, witch.id)
        next = reduceLG(next, {
          type: 'WITCH_ACTION',
          playerId: witch.id,
          action: decision.action,
          targetId: decision.targetId,
          now,
        })
        acted = true
      }
    } else if (next.phase === 'hunter-shot') {
      const hunter = next.players.find((p) => p.id === next.pendingHunterId)
      if (hunter?.isBot) {
        // Le chasseur bot visait au hasard : il vise désormais le joueur que
        // le débat et le vote désignent comme suspect (F39).
        const targetId = lgBotHunterTarget(next, hunter.id)
        if (targetId) {
          next = reduceLG(next, {
            type: 'HUNTER_SHOT',
            playerId: hunter.id,
            targetId,
            now,
          })
          acted = true
        }
      }
    } else if (next.phase === 'day-debate') {
      // Un coup par tick : réaction à l'humain, ouverture, interpellation ou
      // skip groupé — la parole bumpe la version et réarme le tick suivant.
      for (const action of lgBotDebateMove(next, now, rand) ?? []) {
        next = reduceLG(next, action)
        acted = true
      }
    } else if (next.phase === 'day-vote' || next.phase === 'day-revote') {
      // Vote informé par le débat et le caractère (rancune, loyauté) : le
      // plus soupçonné parmi les candidats légaux (un loup évite toujours ses
      // complices), le bot vote TOUJOURS.
      for (const bot of alive().filter((p) => p.isBot)) {
        if (next.phase !== 'day-vote' && next.phase !== 'day-revote') break
        if (next.dayVotes[bot.id]) continue
        const legal = (p: { id: string }) =>
          p.id !== bot.id && (!next.revoteCandidates || next.revoteCandidates.includes(p.id))
        const traits = botTraitsFor(bot.name)
        const score = lgSuspicion(next, bot.id, traits.trait, traits)
        const pool = alive().filter((p) => legal(p) && score.has(p.id))
        const candidates = pool.length > 0 ? pool : alive().filter(legal)
        if (candidates.length === 0) continue
        const tied = lgMostSuspect(score, candidates.map((p) => p.id))
        next = reduceLG(next, {
          type: 'DAY_VOTE',
          playerId: bot.id,
          targetId: tied.length > 0 ? pickRandom(tied, rand) : pickRandom(candidates, rand).id,
          now,
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
