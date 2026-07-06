import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * LOUP-GAROU PILLAVEUR — moteur PUR, serveur-autoritaire.
 *
 * Machine à états nuit/jour : révélation des rôles → nuit (Voyante sonde,
 * Loups votent leur victime, Sorcière potionne) → aube (morts + gorgées,
 * tir du Chasseur) → débat AU VOCAL → vote secret (revote sur égalité) →
 * nuit suivante… Victoire : plus de loups → Village ; loups ≥ autres → Loups.
 *
 * ANTI-TRICHE — trois niveaux de vue (voir `toLGClientView`) :
 *  1. vivant non-loup : son rôle seul + infos publiques ;
 *  2. loup vivant     : + identité des loups + votes loups pendant la nuit ;
 *  3. mort            : vue OMNISCIENTE (fantôme 👻 — il ne peut plus tricher).
 * La TV (spectateur neutre) ne voit que le public. `currentActorId` ne doit
 * JAMAIS désigner un vivant pendant la nuit (le champ `currentTurnUserId` de
 * la salle est public et trahirait la Voyante/Sorcière).
 *
 * ANTI-LEAK DE TIMING : les sous-phases de nuit durent leur temps PLEIN même
 * si l'acteur a déjà joué (les actions sont bufferisées, résolues à
 * l'échéance) — sinon la vitesse d'enchaînement trahit les rôles. Seules les
 * phases dont l'acteur est PUBLIQUEMENT mort sont sautées.
 */

export const LG_MIN_PLAYERS = 4
export const LG_MAX_PLAYERS = 12
export const LG_REVEAL_MS = 10_000
export const LG_SEER_MS = 30_000
export const LG_WOLVES_MS = 45_000
export const LG_WITCH_MS = 30_000
export const LG_DAWN_MS = 10_000
export const LG_HUNTER_MS = 20_000
export const LG_DEBATE_DEFAULT_MS = 180_000
export const LG_DEBATE_CHOICES_MIN = [1, 2, 3, 4, 5] as const
export const LG_VOTE_MS = 60_000
export const LG_REVOTE_MS = 45_000
/** Gorgées : mourir / lyncher un innocent (tous les vivants) / loup lynché (chaque loup) / potion. */
export const LG_SIPS_DEATH = 3
export const LG_SIPS_BAD_LYNCH = 2
export const LG_SIPS_WOLF_LYNCHED = 3
export const LG_SIPS_POTION = 1

export type LGRole = 'loup' | 'voyante' | 'sorciere' | 'chasseur' | 'villageois'
export type LGTeam = 'village' | 'loups'

export type LGPhase =
  | 'reveal-role'
  | 'night-seer'
  | 'night-wolves'
  | 'night-witch'
  | 'dawn'
  | 'hunter-shot'
  | 'day-debate'
  | 'day-vote'
  | 'day-revote'
  | 'finished'

export type LGPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** SECRET tant que le joueur est vivant (sauf entre loups). */
  role: LGRole
  alive: boolean
  /** Gorgées cumulées (compteur fun). */
  sips: number
}

export type LGDeathCause = 'loups' | 'sorciere' | 'vote' | 'chasseur'

/** Mort PUBLIQUE : le rôle est révélé à l'annonce. */
export type LGDeath = { playerId: string; role: LGRole; cause: LGDeathCause; round: number }

/**
 * Prise de parole PUBLIQUE au débat (utilisée par les bots — les humains
 * parlent au vocal). Structurée pour être localisée côté client.
 */
export type LGDebateSpeech = {
  playerId: string
  kind: 'suspect' | 'defend' | 'ally'
  targetId: string | null
  round: number
}

export type LGVoteResult = {
  round: number
  tally: Record<string, number>
  eliminatedId: string | null
  /** Égalité non départagée (après revote éventuel). */
  tie: boolean
  role: LGRole | null
}

export type LGState = TimedPhaseState & {
  version: number
  phase: LGPhase
  players: LGPlayer[]
  /** Numéro de nuit/jour (1 = première nuit). */
  round: number
  debateMs: number
  // ── Nuit courante (SECRETS) ────────────────────────────────────────────
  /** Votes des loups (visibles ENTRE loups). */
  wolfVotes: Record<string, string>
  /** Visions de la Voyante — privées (elle seule + les morts). */
  seerPeeks: { round: number; targetId: string; team: LGTeam }[]
  witchSaveUsed: boolean
  witchKillUsed: boolean
  /** La Sorcière a agi cette nuit (une action par nuit). */
  witchActed: boolean
  /** Victime désignée par les loups (résolue à la fin de leur phase). */
  nightVictimId: string | null
  witchSavedId: string | null
  witchKillId: string | null
  // ── Jour ───────────────────────────────────────────────────────────────
  /** SECRET — votes du jour. */
  dayVotes: Record<string, string>
  /** Public — joueurs voulant passer au vote. */
  debateSkips: string[]
  /** Public — paroles du débat (bots : accusations, défenses, alliances). */
  debateSpeech: LGDebateSpeech[]
  /** Revote : seuls ces candidats sont votables. */
  revoteCandidates: string[] | null
  /** Chasseur mort qui doit tirer (public — sa mort est annoncée). */
  pendingHunterId: string | null
  /** Après le tir : retour au jour (mort de nuit) ou à la nuit (mort au vote). */
  afterHunter: 'day' | 'night' | null
  // ── Public ─────────────────────────────────────────────────────────────
  lastNightDeaths: LGDeath[]
  lastVoteResult: LGVoteResult | null
  deaths: LGDeath[]
  winnerTeam: LGTeam | null
  rematchVotes: string[]
  /** SECRET serveur. */
  rngState: number
}

export type LGAction =
  | { type: 'SEER_PEEK'; playerId: string; targetId: string }
  | { type: 'WOLF_VOTE'; playerId: string; targetId: string }
  | { type: 'WITCH_ACTION'; playerId: string; action: 'save' | 'kill' | 'none'; targetId?: string }
  | { type: 'HUNTER_SHOT'; playerId: string; targetId: string; now: number }
  | { type: 'DEBATE_SKIP'; playerId: string; now: number }
  | {
      type: 'DEBATE_SPEAK'
      playerId: string
      kind: LGDebateSpeech['kind']
      targetId: string | null
    }
  | { type: 'DAY_VOTE'; playerId: string; targetId: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class LGEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'LGEngineError'
  }
}

export type LGInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Rôles selon l'effectif ──────────────────────────────────────────────────

/**
 * Composition avec ROULEMENT : loups selon la taille + Voyante toujours,
 * puis la Sorcière et le Chasseur tournent d'une partie à l'autre (tirage
 * seedé) — même à 4 joueurs, on ne retombe pas toujours sur la même table.
 */
export function lgRolesFor(count: number, rng: SeededRng): LGRole[] {
  const roles: LGRole[] = []
  const wolves = count >= 11 ? 3 : count >= 7 ? 2 : 1
  for (let i = 0; i < wolves; i += 1) roles.push('loup')
  roles.push('voyante')
  // Rôles spéciaux en rotation (ordre et présence tirés au sort).
  for (const special of rng.shuffle(['sorciere', 'chasseur'] as const)) {
    if (roles.length >= count) break
    if (rng.chance(0.65)) roles.push(special)
  }
  while (roles.length < count) roles.push('villageois')
  return roles
}

export function lgTeamOf(role: LGRole): LGTeam {
  return role === 'loup' ? 'loups' : 'village'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function lgAlive(state: LGState): LGPlayer[] {
  return state.players.filter((p) => p.alive)
}

function aliveWithRole(state: LGState, role: LGRole): LGPlayer[] {
  return state.players.filter((p) => p.alive && p.role === role)
}

function playerOf(state: LGState, id: string): LGPlayer | undefined {
  return state.players.find((p) => p.id === id)
}

function bumpSips(players: LGPlayer[], ids: Set<string>, sips: number): LGPlayer[] {
  return players.map((p) => (ids.has(p.id) ? { ...p, sips: p.sips + sips } : p))
}

/** Victoire ? Plus de loups → village ; loups ≥ autres vivants → loups. */
function winnerOf(players: LGPlayer[]): LGTeam | null {
  const alive = players.filter((p) => p.alive)
  const wolves = alive.filter((p) => p.role === 'loup').length
  if (wolves === 0) return 'village'
  if (wolves >= alive.length - wolves) return 'loups'
  return null
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createLGState(
  players: LGInitialPlayer[],
  seed: string | number,
  debateMs: number = LG_DEBATE_DEFAULT_MS,
  now: number = Date.now()
): LGState {
  if (players.length < LG_MIN_PLAYERS) throw new LGEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > LG_MAX_PLAYERS) throw new LGEngineError('TOO_MANY_PLAYERS')

  const rng = createRng(seed)
  const roles = rng.shuffle(lgRolesFor(players.length, rng))

  return {
    version: 1,
    ...enterPhase(0, 'reveal-role', LG_REVEAL_MS, now),
    phase: 'reveal-role',
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      leftAt: null,
      role: roles[i],
      alive: true,
      sips: 0,
    })),
    round: 0,
    debateMs,
    wolfVotes: {},
    seerPeeks: [],
    witchSaveUsed: false,
    witchKillUsed: false,
    witchActed: false,
    nightVictimId: null,
    witchSavedId: null,
    witchKillId: null,
    dayVotes: {},
    debateSkips: [],
    debateSpeech: [],
    revoteCandidates: null,
    pendingHunterId: null,
    afterHunter: null,
    lastNightDeaths: [],
    lastVoteResult: null,
    deaths: [],
    winnerTeam: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions ─────────────────────────────────────────────────────────────

function toPhase(state: LGState, phase: LGPhase, durationMs: number | null, now: number): LGState {
  return { ...state, ...enterPhase(state.phaseSeq, phase, durationMs, now), phase }
}

function finish(state: LGState, winner: LGTeam, now: number): LGState {
  return {
    ...toPhase(state, 'finished', null, now),
    winnerTeam: winner,
    version: state.version + 1,
  }
}

/**
 * Nouvelle nuit : remise à zéro des buffers, saut des rôles morts.
 * `lastVoteResult` PERSISTE (bannière « X a été lynché » pendant la nuit) —
 * il est remplacé au prochain dépouillement.
 */
function startNight(state: LGState, now: number): LGState {
  const next: LGState = {
    ...state,
    round: state.round + 1,
    wolfVotes: {},
    witchActed: false,
    nightVictimId: null,
    witchSavedId: null,
    witchKillId: null,
    dayVotes: {},
    debateSkips: [],
    debateSpeech: [],
    revoteCandidates: null,
    pendingHunterId: null,
    afterHunter: null,
  }
  // Voyante vivante → sa phase ; sinon directement les loups (sa mort est publique).
  if (aliveWithRole(next, 'voyante').length > 0) {
    return { ...toPhase(next, 'night-seer', LG_SEER_MS, now), version: state.version + 1 }
  }
  return { ...toPhase(next, 'night-wolves', LG_WOLVES_MS, now), version: state.version + 1 }
}

/** Fin de la phase des loups : victime = cible majoritaire (égalité → RNG). */
function resolveWolves(state: LGState, now: number): LGState {
  const tally: Record<string, number> = {}
  for (const targetId of Object.values(state.wolfVotes)) {
    tally[targetId] = (tally[targetId] ?? 0) + 1
  }
  let victimId: string | null = null
  let best = 0
  let tied: string[] = []
  for (const [id, count] of Object.entries(tally)) {
    if (count > best) {
      best = count
      tied = [id]
    } else if (count === best) {
      tied.push(id)
    }
  }
  let rngState = state.rngState
  if (tied.length === 1) victimId = tied[0]
  else if (tied.length > 1) {
    const rng = rngFromState(rngState)
    victimId = rng.pick(tied)
    rngState = rng.getState()
  }

  const next = { ...state, nightVictimId: victimId, rngState }
  // Sorcière vivante → sa phase (durée fixe) ; sinon résolution directe.
  if (aliveWithRole(next, 'sorciere').length > 0) {
    return { ...toPhase(next, 'night-witch', LG_WITCH_MS, now), version: state.version + 1 }
  }
  return resolveNight(next, now)
}

/** Aube : applique victime des loups (sauf sauvée) + potion de mort. */
function resolveNight(state: LGState, now: number): LGState {
  const deaths: LGDeath[] = []
  const deadIds = new Set<string>()

  if (state.nightVictimId && state.witchSavedId !== state.nightVictimId) {
    const victim = playerOf(state, state.nightVictimId)
    if (victim?.alive) {
      deaths.push({ playerId: victim.id, role: victim.role, cause: 'loups', round: state.round })
      deadIds.add(victim.id)
    }
  }
  if (state.witchKillId) {
    const target = playerOf(state, state.witchKillId)
    if (target?.alive && !deadIds.has(target.id)) {
      deaths.push({ playerId: target.id, role: target.role, cause: 'sorciere', round: state.round })
      deadIds.add(target.id)
    }
  }

  let players = state.players.map((p) => (deadIds.has(p.id) ? { ...p, alive: false } : p))
  players = bumpSips(players, deadIds, LG_SIPS_DEATH)

  const hunter = deaths.find((d) => d.role === 'chasseur')
  const next: LGState = {
    ...state,
    players,
    lastNightDeaths: deaths,
    deaths: [...state.deaths, ...deaths],
    pendingHunterId: hunter?.playerId ?? null,
    afterHunter: hunter ? 'day' : null,
    version: state.version + 1,
  }
  return { ...next, ...enterPhase(state.phaseSeq, 'dawn', LG_DAWN_MS, now), phase: 'dawn' }
}

/** Après l'aube (et l'éventuel tir) : victoire ou débat. */
function afterDawn(state: LGState, now: number): LGState {
  const winner = winnerOf(state.players)
  if (winner) return finish(state, winner, now)
  return { ...toPhase(state, 'day-debate', state.debateMs, now), version: state.version + 1 }
}

/** Dépouillement du vote du jour (ou du revote). */
function resolveDayVote(state: LGState, now: number, isRevote: boolean): LGState {
  const tally: Record<string, number> = {}
  for (const targetId of Object.values(state.dayVotes)) {
    tally[targetId] = (tally[targetId] ?? 0) + 1
  }
  let best = 0
  let tied: string[] = []
  for (const [id, count] of Object.entries(tally)) {
    if (count > best) {
      best = count
      tied = [id]
    } else if (count === best) {
      tied.push(id)
    }
  }

  // Égalité au premier vote → revote entre ex-aequo ; au revote → personne.
  if (!isRevote && tied.length > 1) {
    return {
      ...toPhase({ ...state, dayVotes: {}, revoteCandidates: tied }, 'day-revote', LG_REVOTE_MS, now),
      lastVoteResult: { round: state.round, tally, eliminatedId: null, tie: true, role: null },
      version: state.version + 1,
    }
  }

  const eliminatedId = tied.length === 1 && best > 0 ? tied[0] : null
  let players = state.players
  let role: LGRole | null = null
  let pendingHunterId: string | null = null

  if (eliminatedId) {
    const target = playerOf(state, eliminatedId)
    if (target?.alive) {
      role = target.role
      players = players.map((p) => (p.id === eliminatedId ? { ...p, alive: false } : p))
      players = bumpSips(players, new Set([eliminatedId]), LG_SIPS_DEATH)
      if (target.role === 'loup') {
        // Un loup démasqué : ses complices vivants trinquent.
        const wolves = new Set(players.filter((p) => p.alive && p.role === 'loup').map((p) => p.id))
        players = bumpSips(players, wolves, LG_SIPS_WOLF_LYNCHED)
      } else {
        // Le village a lynché un innocent : tous les vivants boivent.
        const alive = new Set(players.filter((p) => p.alive).map((p) => p.id))
        players = bumpSips(players, alive, LG_SIPS_BAD_LYNCH)
      }
      if (target.role === 'chasseur') pendingHunterId = eliminatedId
    }
  }

  const voteResult: LGVoteResult = {
    round: state.round,
    tally,
    eliminatedId,
    tie: !eliminatedId && tied.length > 1,
    role,
  }
  const deaths = eliminatedId && role
    ? [...state.deaths, { playerId: eliminatedId, role, cause: 'vote' as const, round: state.round }]
    : state.deaths

  let next: LGState = {
    ...state,
    players,
    dayVotes: {},
    revoteCandidates: null,
    lastVoteResult: voteResult,
    deaths,
    pendingHunterId,
    afterHunter: pendingHunterId ? 'night' : null,
    version: state.version + 1,
  }

  if (pendingHunterId) {
    return { ...next, ...enterPhase(state.phaseSeq, 'hunter-shot', LG_HUNTER_MS, now), phase: 'hunter-shot' }
  }
  const winner = winnerOf(next.players)
  if (winner) return finish(next, winner, now)
  return startNight(next, now)
}

/** Après le tir du chasseur (ou son silence) : victoire, jour ou nuit. */
function afterHunterShot(state: LGState, now: number): LGState {
  const dest = state.afterHunter
  const cleared: LGState = { ...state, pendingHunterId: null, afterHunter: null }
  const winner = winnerOf(cleared.players)
  if (winner) return finish(cleared, winner, now)
  if (dest === 'day') {
    return { ...toPhase(cleared, 'day-debate', cleared.debateMs, now), version: state.version + 1 }
  }
  return startNight(cleared, now)
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceLG(state: LGState, action: LGAction): LGState {
  switch (action.type) {
    case 'SEER_PEEK': {
      if (state.phase !== 'night-seer') throw new LGEngineError('NOT_SEER_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive || actor.role !== 'voyante') throw new LGEngineError('NOT_SEER')
      if (state.seerPeeks.some((p) => p.round === state.round)) {
        throw new LGEngineError('ALREADY_PEEKED')
      }
      const target = playerOf(state, action.targetId)
      if (!target?.alive || target.id === actor.id) throw new LGEngineError('INVALID_TARGET')
      // Bufferisé : la phase garde sa durée pleine (anti-leak de timing).
      return {
        ...state,
        seerPeeks: [
          ...state.seerPeeks,
          { round: state.round, targetId: target.id, team: lgTeamOf(target.role) },
        ],
        version: state.version + 1,
      }
    }

    case 'WOLF_VOTE': {
      if (state.phase !== 'night-wolves') throw new LGEngineError('NOT_WOLVES_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive || actor.role !== 'loup') throw new LGEngineError('NOT_WOLF')
      const target = playerOf(state, action.targetId)
      if (!target?.alive || target.role === 'loup') throw new LGEngineError('INVALID_TARGET')
      // Modifiable jusqu'à l'échéance : les loups se coordonnent.
      return {
        ...state,
        wolfVotes: { ...state.wolfVotes, [actor.id]: target.id },
        version: state.version + 1,
      }
    }

    case 'WITCH_ACTION': {
      if (state.phase !== 'night-witch') throw new LGEngineError('NOT_WITCH_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive || actor.role !== 'sorciere') throw new LGEngineError('NOT_WITCH')
      if (state.witchActed) throw new LGEngineError('ALREADY_ACTED')
      if (action.action === 'none') {
        return { ...state, witchActed: true, version: state.version + 1 }
      }
      if (action.action === 'save') {
        if (state.witchSaveUsed) throw new LGEngineError('POTION_USED')
        if (!state.nightVictimId) throw new LGEngineError('NO_VICTIM')
        return {
          ...state,
          witchActed: true,
          witchSaveUsed: true,
          witchSavedId: state.nightVictimId,
          players: bumpSips(state.players, new Set([actor.id]), LG_SIPS_POTION),
          version: state.version + 1,
        }
      }
      // kill
      if (state.witchKillUsed) throw new LGEngineError('POTION_USED')
      const target = action.targetId ? playerOf(state, action.targetId) : undefined
      if (!target?.alive || target.id === actor.id) throw new LGEngineError('INVALID_TARGET')
      return {
        ...state,
        witchActed: true,
        witchKillUsed: true,
        witchKillId: target.id,
        players: bumpSips(state.players, new Set([actor.id]), LG_SIPS_POTION),
        version: state.version + 1,
      }
    }

    case 'HUNTER_SHOT': {
      if (state.phase !== 'hunter-shot') throw new LGEngineError('NOT_HUNTER_PHASE')
      if (state.pendingHunterId !== action.playerId) throw new LGEngineError('NOT_HUNTER')
      const target = playerOf(state, action.targetId)
      if (!target?.alive) throw new LGEngineError('INVALID_TARGET')
      let players = state.players.map((p) =>
        p.id === target.id ? { ...p, alive: false } : p
      )
      players = bumpSips(players, new Set([target.id]), LG_SIPS_DEATH)
      const death: LGDeath = {
        playerId: target.id,
        role: target.role,
        cause: 'chasseur',
        round: state.round,
      }
      const next: LGState = {
        ...state,
        players,
        deaths: [...state.deaths, death],
        lastNightDeaths:
          state.afterHunter === 'day' ? [...state.lastNightDeaths, death] : state.lastNightDeaths,
        version: state.version + 1,
      }
      return afterHunterShot(next, action.now)
    }

    case 'DEBATE_SPEAK': {
      if (state.phase !== 'day-debate') throw new LGEngineError('NOT_DEBATE_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive) throw new LGEngineError('NOT_ALIVE')
      if (action.targetId) {
        const target = playerOf(state, action.targetId)
        if (!target?.alive || target.id === actor.id) throw new LGEngineError('INVALID_TARGET')
      }
      // Deux prises de parole max par joueur et par manche (anti-spam).
      const mine = state.debateSpeech.filter(
        (sp) => sp.playerId === actor.id && sp.round === state.round
      )
      if (mine.length >= 2) throw new LGEngineError('ALREADY_SPOKE')
      return {
        ...state,
        debateSpeech: [
          ...state.debateSpeech,
          { playerId: actor.id, kind: action.kind, targetId: action.targetId, round: state.round },
        ],
        version: state.version + 1,
      }
    }

    case 'DEBATE_SKIP': {
      if (state.phase !== 'day-debate') throw new LGEngineError('NOT_DEBATE_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive) throw new LGEngineError('NOT_ALIVE')
      if (state.debateSkips.includes(actor.id)) return state
      const debateSkips = [...state.debateSkips, actor.id]
      const next = { ...state, debateSkips, version: state.version + 1 }
      // Unanimité des vivants → on passe au vote sans attendre (info publique).
      if (lgAlive(state).every((p) => debateSkips.includes(p.id))) {
        return { ...toPhase(next, 'day-vote', LG_VOTE_MS, action.now), debateSkips: [] }
      }
      return next
    }

    case 'DAY_VOTE': {
      if (state.phase !== 'day-vote' && state.phase !== 'day-revote') {
        throw new LGEngineError('NOT_VOTE_PHASE')
      }
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive) throw new LGEngineError('NOT_ALIVE')
      if (state.dayVotes[actor.id]) throw new LGEngineError('ALREADY_VOTED')
      const target = playerOf(state, action.targetId)
      if (!target?.alive || target.id === actor.id) throw new LGEngineError('INVALID_TARGET')
      if (state.revoteCandidates && !state.revoteCandidates.includes(target.id)) {
        throw new LGEngineError('INVALID_TARGET')
      }
      const dayVotes = { ...state.dayVotes, [actor.id]: target.id }
      const next = { ...state, dayVotes, version: state.version + 1 }
      // Tous les vivants ont voté → dépouillement immédiat (fin de journée).
      if (lgAlive(state).every((p) => dayVotes[p.id])) {
        return resolveDayVote(next, action.now, state.phase === 'day-revote')
      }
      return next
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new LGEngineError(check.error)
      const now = action.now
      switch (state.phase) {
        case 'reveal-role':
          return startNight(state, now)
        case 'night-seer':
          return { ...toPhase(state, 'night-wolves', LG_WOLVES_MS, now), version: state.version + 1 }
        case 'night-wolves':
          return resolveWolves(state, now)
        case 'night-witch':
          return resolveNight(state, now)
        case 'dawn':
          if (state.pendingHunterId) {
            return {
              ...toPhase(state, 'hunter-shot', LG_HUNTER_MS, now),
              version: state.version + 1,
            }
          }
          return afterDawn(state, now)
        case 'hunter-shot':
          // Silence du chasseur : pas de tir.
          return afterHunterShot(state, now)
        case 'day-debate':
          return { ...toPhase(state, 'day-vote', LG_VOTE_MS, now), version: state.version + 1 }
        case 'day-vote':
          return resolveDayVote(state, now, false)
        case 'day-revote':
          return resolveDayVote(state, now, true)
        default:
          throw new LGEngineError('NOTHING_TO_ADVANCE')
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new LGEngineError('GAME_FINISHED')
      const player = playerOf(state, action.playerId)
      if (!player || player.isBot) throw new LGEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REJOIN': {
      const player = playerOf(state, action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new LGEngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new LGEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      return {
        ...state,
        players: state.players.map((p) =>
          ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    default: {
      const exhaustive: never = action
      throw new LGEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Acteur courant ──────────────────────────────────────────────────────────

/**
 * `currentTurnUserId` est PUBLIC : pendant la nuit il doit rester null
 * (désigner la Voyante ou la Sorcière trahirait son rôle). Seul le Chasseur
 * (publiquement mort) est désigné pendant son tir.
 */
export function currentLGActorId(state: LGState): string | null {
  if (state.phase === 'hunter-shot') return state.pendingHunterId
  return null
}

// ─── Vues anti-triche (3 niveaux + TV) ───────────────────────────────────────

export type LGPlayerView = Omit<LGPlayer, 'role'> & {
  /** null si le rôle est secret pour CE viewer. */
  role: LGRole | null
}

export type LGClientView = Omit<
  LGState,
  | 'rngState'
  | 'players'
  | 'wolfVotes'
  | 'seerPeeks'
  | 'dayVotes'
  | 'nightVictimId'
  | 'witchSavedId'
  | 'witchKillId'
  | 'witchSaveUsed'
  | 'witchKillUsed'
  | 'witchActed'
> & {
  /** La Sorcière a déjà agi cette nuit — elle seule (+ fantômes). */
  witchActed: boolean | null
  players: LGPlayerView[]
  phaseKey: string
  /** Mon rôle (null pour le spectateur TV). */
  myRole: LGRole | null
  /** Fantôme omniscient ? (mort — il voit tout). */
  ghost: boolean
  /** Votes des loups — loups vivants + fantômes uniquement. */
  wolfVotes: Record<string, string> | null
  /** Visions de la Voyante — elle + fantômes. */
  seerPeeks: { round: number; targetId: string; team: LGTeam }[] | null
  /** Victime de la nuit — Sorcière (sa phase) + fantômes. */
  nightVictimId: string | null
  /** Potions restantes — Sorcière + fantômes. */
  witchPotions: { save: boolean; kill: boolean } | null
  /** Vote du jour : qui a déjà voté (public) + mon vote. */
  hasVoted: Record<string, boolean>
  myVote: string | null
}

export function toLGClientView(state: LGState, viewerId: string): LGClientView {
  const {
    rngState: _rng,
    players,
    wolfVotes,
    seerPeeks,
    dayVotes,
    nightVictimId,
    witchSavedId: _ws,
    witchKillId: _wk,
    witchSaveUsed: _wsu,
    witchKillUsed: _wku,
    witchActed,
    ...rest
  } = state
  void _rng
  void _ws
  void _wk
  void _wsu
  void _wku

  const me = players.find((p) => p.id === viewerId)
  const finished = state.phase === 'finished'
  /** Fantôme = mort : vue omnisciente (il ne peut plus fausser la partie). */
  const ghost = Boolean(me && !me.alive)
  const iAmWolf = Boolean(me?.alive && me.role === 'loup')
  const iAmSeer = Boolean(me?.alive && me.role === 'voyante')
  const iAmWitch = Boolean(me?.alive && me.role === 'sorciere')

  const roleVisible = (p: LGPlayer): boolean =>
    finished ||
    ghost ||
    !p.alive || // les morts sont révélés publiquement
    p.id === viewerId ||
    (iAmWolf && p.role === 'loup') // les loups se connaissent

  const hasVoted: Record<string, boolean> = {}
  if (state.phase === 'day-vote' || state.phase === 'day-revote') {
    for (const p of players) hasVoted[p.id] = Boolean(dayVotes[p.id])
  }

  return {
    ...rest,
    phaseKey: phaseKey(state),
    myRole: me?.role ?? null,
    ghost,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      alive: p.alive,
      sips: p.sips,
      role: roleVisible(p) ? p.role : null,
    })),
    wolfVotes: iAmWolf || ghost || finished ? wolfVotes : null,
    seerPeeks: iAmSeer || ghost || finished ? seerPeeks : null,
    nightVictimId:
      (iAmWitch && state.phase === 'night-witch') || ghost || finished ? nightVictimId : null,
    witchPotions:
      iAmWitch || ghost || finished
        ? { save: !state.witchSaveUsed, kill: !state.witchKillUsed }
        : null,
    witchActed: iAmWitch || ghost || finished ? witchActed : null,
    hasVoted,
    myVote: dayVotes[viewerId] ?? null,
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : uniquement le public — aucun secret de vivant. */
export function toLGSpectatorView(state: LGState): LGClientView {
  return toLGClientView(state, '')
}
