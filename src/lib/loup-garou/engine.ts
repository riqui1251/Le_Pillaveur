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
export const LG_MAYOR_MS = 30_000
export const LG_GUARD_MS = 25_000
export const LG_SEER_MS = 30_000
export const LG_RAVEN_MS = 25_000
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
/** Voix ajoutées contre le marqué du Corbeau au vote du jour. */
export const LG_RAVEN_EXTRA_VOTES = 2

export type LGRole =
  | 'loup'
  | 'voyante'
  | 'sorciere'
  | 'chasseur'
  | 'salvateur'
  | 'corbeau'
  | 'ancien'
  | 'villageois'
export type LGTeam = 'village' | 'loups'

export type LGPhase =
  | 'reveal-role'
  | 'mayor-election'
  | 'night-guard'
  | 'night-seer'
  | 'night-raven'
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
  /** SECRET — protégé du Salvateur cette nuit (immunisé contre les loups). */
  guardProtectedId: string | null
  /** SECRET Salvateur — protégé de la nuit précédente (interdit 2× de suite). */
  guardLastProtectedId: string | null
  /** Marque du Corbeau : secrète la nuit, PUBLIQUE au jour (+2 voix au vote). */
  ravenTargetId: string | null
  /** L'Ancien a déjà encaissé (et survécu à) une attaque des loups. */
  elderLifeUsed: boolean
  // ── Maire (élu une fois, avant la première nuit) ───────────────────────
  /** Maire élu — PUBLIC une fois connu ; son vote compte double au lynchage. */
  mayorId: string | null
  /** SECRET — votes de l'élection du maire (en cours). */
  mayorVotes: Record<string, string>
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
  | { type: 'MAYOR_VOTE'; playerId: string; targetId: string; now: number }
  | { type: 'GUARD_PROTECT'; playerId: string; targetId: string }
  | { type: 'RAVEN_MARK'; playerId: string; targetId: string }
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

/** Rôles spéciaux qui tournent d'une partie à l'autre (hors Voyante, fixe). */
export const LG_SPECIAL_ROLES = [
  'sorciere',
  'chasseur',
  'salvateur',
  'corbeau',
  'ancien',
] as const

/**
 * Composition avec ROULEMENT : loups selon la taille + Voyante toujours,
 * puis les rôles spéciaux (Sorcière, Chasseur, Salvateur, Corbeau, Ancien)
 * tournent d'une partie à l'autre (tirage seedé) — même à 4 joueurs, on ne
 * retombe pas toujours sur la même table. Leur nombre est plafonné selon
 * l'effectif pour garder des villageois « simples ».
 */
export function lgRolesFor(count: number, rng: SeededRng): LGRole[] {
  const roles: LGRole[] = []
  const wolves = count >= 11 ? 3 : count >= 5 ? 2 : 1
  for (let i = 0; i < wolves; i += 1) roles.push('loup')
  roles.push('voyante')
  // À 4-5 joueurs, plafonner à 1 spécial garantit au moins un villageois
  // simple (1 loup + voyante + 1 spécial max < count).
  const maxSpecials = count >= 9 ? 4 : count >= 6 ? 3 : 1
  let specials = 0
  for (const special of rng.shuffle(LG_SPECIAL_ROLES)) {
    if (roles.length >= count || specials >= maxSpecials) break
    if (rng.chance(0.55)) {
      roles.push(special)
      specials += 1
    }
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
    guardProtectedId: null,
    guardLastProtectedId: null,
    ravenTargetId: null,
    elderLifeUsed: false,
    mayorId: null,
    mayorVotes: {},
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
 * Ordre de réveil : Salvateur → Voyante → Corbeau → Loups (→ Sorcière).
 * Chaque phase n'existe que si son rôle est VIVANT (sa mort est publique).
 */
function nightPhaseAfterSeer(state: LGState): { phase: LGPhase; ms: number } {
  if (aliveWithRole(state, 'corbeau').length > 0) {
    return { phase: 'night-raven', ms: LG_RAVEN_MS }
  }
  return { phase: 'night-wolves', ms: LG_WOLVES_MS }
}

function nightPhaseAfterGuard(state: LGState): { phase: LGPhase; ms: number } {
  if (aliveWithRole(state, 'voyante').length > 0) {
    return { phase: 'night-seer', ms: LG_SEER_MS }
  }
  return nightPhaseAfterSeer(state)
}

function firstNightPhase(state: LGState): { phase: LGPhase; ms: number } {
  if (aliveWithRole(state, 'salvateur').length > 0) {
    return { phase: 'night-guard', ms: LG_GUARD_MS }
  }
  return nightPhaseAfterGuard(state)
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
    // Le protégé d'hier devient « interdit » ce soir (jamais 2× de suite).
    guardLastProtectedId: state.guardProtectedId,
    guardProtectedId: null,
    ravenTargetId: null,
    dayVotes: {},
    debateSkips: [],
    debateSpeech: [],
    revoteCandidates: null,
    pendingHunterId: null,
    afterHunter: null,
  }
  const first = firstNightPhase(next)
  return { ...toPhase(next, first.phase, first.ms, now), version: state.version + 1 }
}

/**
 * Dépouillement de l'élection du maire (une fois, avant la première nuit) :
 * majorité simple, égalité départagée par RNG (pas de revote — juste un
 * apéro, pas un vote qui doit être irréprochable).
 */
function resolveMayorElection(state: LGState, now: number): LGState {
  const tally: Record<string, number> = {}
  for (const targetId of Object.values(state.mayorVotes)) {
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
  let mayorId: string | null = null
  let rngState = state.rngState
  if (tied.length === 1) mayorId = tied[0]
  else if (tied.length > 1) {
    const rng = rngFromState(rngState)
    mayorId = rng.pick(tied)
    rngState = rng.getState()
  }
  return startNight({ ...state, mayorId, mayorVotes: {}, rngState, version: state.version + 1 }, now)
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

/**
 * Aube : applique victime des loups (sauf sauvée par la Sorcière, protégée
 * par le Salvateur, ou Ancien à sa première attaque) + potion de mort.
 */
function resolveNight(state: LGState, now: number): LGState {
  const deaths: LGDeath[] = []
  const deadIds = new Set<string>()
  let elderLifeUsed = state.elderLifeUsed

  if (
    state.nightVictimId &&
    state.witchSavedId !== state.nightVictimId &&
    state.guardProtectedId !== state.nightVictimId
  ) {
    const victim = playerOf(state, state.nightVictimId)
    if (victim?.alive) {
      if (victim.role === 'ancien' && !elderLifeUsed) {
        // L'Ancien encaisse la première morsure : personne ne meurt cette nuit.
        elderLifeUsed = true
      } else {
        deaths.push({ playerId: victim.id, role: victim.role, cause: 'loups', round: state.round })
        deadIds.add(victim.id)
      }
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
    elderLifeUsed,
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
  // La marque du Corbeau pèse +2 voix (premier vote du jour uniquement).
  if (!isRevote && state.ravenTargetId) {
    const marked = playerOf(state, state.ravenTargetId)
    if (marked?.alive) tally[marked.id] = LG_RAVEN_EXTRA_VOTES
  }
  // Le maire pèse double au lynchage (élu au tout début de la partie).
  for (const [voterId, targetId] of Object.entries(state.dayVotes)) {
    const weight = voterId === state.mayorId ? 2 : 1
    tally[targetId] = (tally[targetId] ?? 0) + weight
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
    case 'MAYOR_VOTE': {
      if (state.phase !== 'mayor-election') throw new LGEngineError('NOT_MAYOR_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive) throw new LGEngineError('NOT_ALIVE')
      if (state.mayorVotes[actor.id]) throw new LGEngineError('ALREADY_VOTED')
      const target = playerOf(state, action.targetId)
      // Auto-candidature autorisée — contrairement au lynchage.
      if (!target?.alive) throw new LGEngineError('INVALID_TARGET')
      const mayorVotes = { ...state.mayorVotes, [actor.id]: target.id }
      const next = { ...state, mayorVotes, version: state.version + 1 }
      // Tous les vivants ont voté → dépouillement immédiat.
      if (lgAlive(state).every((p) => mayorVotes[p.id])) {
        return resolveMayorElection(next, action.now)
      }
      return next
    }

    case 'GUARD_PROTECT': {
      if (state.phase !== 'night-guard') throw new LGEngineError('NOT_GUARD_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive || actor.role !== 'salvateur') throw new LGEngineError('NOT_GUARD')
      if (state.guardProtectedId) throw new LGEngineError('ALREADY_PROTECTED')
      const target = playerOf(state, action.targetId)
      // Il peut se protéger lui-même — mais jamais la même cible 2 nuits de suite.
      if (!target?.alive) throw new LGEngineError('INVALID_TARGET')
      if (target.id === state.guardLastProtectedId) {
        throw new LGEngineError('SAME_TARGET_TWICE')
      }
      // Bufferisé : la phase garde sa durée pleine (anti-leak de timing).
      return { ...state, guardProtectedId: target.id, version: state.version + 1 }
    }

    case 'RAVEN_MARK': {
      if (state.phase !== 'night-raven') throw new LGEngineError('NOT_RAVEN_PHASE')
      const actor = playerOf(state, action.playerId)
      if (!actor?.alive || actor.role !== 'corbeau') throw new LGEngineError('NOT_RAVEN')
      if (state.ravenTargetId) throw new LGEngineError('ALREADY_MARKED')
      const target = playerOf(state, action.targetId)
      if (!target?.alive || target.id === actor.id) throw new LGEngineError('INVALID_TARGET')
      // Bufferisé : la marque ne devient publique qu'au lever du jour.
      return { ...state, ravenTargetId: target.id, version: state.version + 1 }
    }

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
          return { ...toPhase(state, 'mayor-election', LG_MAYOR_MS, now), version: state.version + 1 }
        case 'mayor-election':
          return resolveMayorElection(state, now)
        case 'night-guard': {
          const after = nightPhaseAfterGuard(state)
          return { ...toPhase(state, after.phase, after.ms, now), version: state.version + 1 }
        }
        case 'night-seer': {
          const after = nightPhaseAfterSeer(state)
          return { ...toPhase(state, after.phase, after.ms, now), version: state.version + 1 }
        }
        case 'night-raven':
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
  | 'mayorVotes'
  | 'dayVotes'
  | 'nightVictimId'
  | 'witchSavedId'
  | 'witchKillId'
  | 'witchSaveUsed'
  | 'witchKillUsed'
  | 'witchActed'
  | 'guardProtectedId'
  | 'guardLastProtectedId'
  | 'ravenTargetId'
  | 'elderLifeUsed'
> & {
  /** Protégé du Salvateur cette nuit — lui seul (+ fantômes). */
  guardProtectedId: string | null
  /** Cible interdite ce soir (protégée hier) — Salvateur seul (+ fantômes). */
  guardLastProtectedId: string | null
  /** Marque du Corbeau : Corbeau la nuit ; PUBLIQUE le jour (+2 voix). */
  ravenTargetId: string | null
  /** L'Ancien a déjà servi de bouclier — fantômes/fin de partie uniquement. */
  elderLifeUsed: boolean | null
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
  /** Élection du maire : qui a déjà voté (public) + mon vote. */
  hasVotedMayor: Record<string, boolean>
  myMayorVote: string | null
}

export function toLGClientView(state: LGState, viewerId: string): LGClientView {
  const {
    rngState: _rng,
    players,
    wolfVotes,
    seerPeeks,
    mayorVotes,
    dayVotes,
    nightVictimId,
    witchSavedId: _ws,
    witchKillId: _wk,
    witchSaveUsed: _wsu,
    witchKillUsed: _wku,
    witchActed,
    guardProtectedId,
    guardLastProtectedId,
    ravenTargetId,
    elderLifeUsed,
    ...rest
  } = state
  void _rng
  void _ws
  void _wk
  void _wsu
  void _wku

  const me = players.find((p) => p.id === viewerId)
  const finished = state.phase === 'finished'
  /**
   * Fantôme = mort : vue omnisciente (il ne peut plus fausser la partie).
   * Exception : le chasseur en train de choisir sa cible reste mort dans
   * `players` (`alive: false` posé dès `resolveNight`/`resolveDayVote`) mais
   * ne doit PAS voir les rôles secrets (loups compris) avant de tirer —
   * sinon son tir devient une certitude au lieu d'un pari.
   */
  const isPendingHunter = viewerId === state.pendingHunterId
  const ghost = Boolean(me && !me.alive) && !isPendingHunter
  const iAmWolf = Boolean(me?.alive && me.role === 'loup')
  const iAmSeer = Boolean(me?.alive && me.role === 'voyante')
  const iAmWitch = Boolean(me?.alive && me.role === 'sorciere')
  const iAmGuard = Boolean(me?.alive && me.role === 'salvateur')
  const iAmRaven = Boolean(me?.alive && me.role === 'corbeau')
  /** La marque du Corbeau devient publique au lever du jour. */
  const dayPhases: LGPhase[] = ['dawn', 'hunter-shot', 'day-debate', 'day-vote', 'day-revote']
  const ravenPublic = dayPhases.includes(state.phase)

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
  const hasVotedMayor: Record<string, boolean> = {}
  if (state.phase === 'mayor-election') {
    for (const p of players) hasVotedMayor[p.id] = Boolean(mayorVotes[p.id])
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
    guardProtectedId: iAmGuard || ghost || finished ? guardProtectedId : null,
    guardLastProtectedId: iAmGuard || ghost || finished ? guardLastProtectedId : null,
    ravenTargetId: iAmRaven || ravenPublic || ghost || finished ? ravenTargetId : null,
    elderLifeUsed: ghost || finished ? elderLifeUsed : null,
    hasVoted,
    myVote: dayVotes[viewerId] ?? null,
    hasVotedMayor,
    myMayorVote: mayorVotes[viewerId] ?? null,
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : uniquement le public — aucun secret de vivant. */
export function toLGSpectatorView(state: LGState): LGClientView {
  return toLGClientView(state, '')
}
