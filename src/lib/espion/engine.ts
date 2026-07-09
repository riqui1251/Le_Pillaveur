import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * QUI EST L'ESPION ? (Spyfall apéro) — moteur PUR, serveur-autoritaire.
 *
 * Un lieu secret est tiré : tous les joueurs le connaissent SAUF l'espion,
 * qui ne voit rien. Discussion libre au vocal (aucune action moteur ne
 * structure les tours). À tout moment, un joueur peut accuser un autre :
 * ouvre une fenêtre de soutien PUBLIQUE de 15 s ; majorité atteinte →
 * révélation immédiate. L'espion peut à tout moment deviner le lieu (un
 * seul essai). Timer principal écoulé sans résolution → l'espion gagne par
 * défaut (règle classique Spyfall).
 *
 * Contrairement au vote secret de l'Imposteur, l'accusation reste PUBLIQUE
 * en temps réel — cohérent avec une partie qui se joue à voix haute.
 */

export const ESPION_MIN_PLAYERS = 3
export const ESPION_MAX_PLAYERS = 8
/** Compte à rebours d'échauffement au lancement. */
export const ESPION_COUNTDOWN_MS = 5_000
/** Fenêtre de soutien à une accusation. */
export const ESPION_ACCUSATION_WINDOW_MS = 15_000
/** Options de durée de discussion proposées au lobby (minutes). */
export const ESPION_DISCUSSION_MINUTES_OPTIONS = [3, 5, 7] as const
export const ESPION_DEFAULT_DISCUSSION_MS = 5 * 60_000
/** Options de manches à gagner proposées au lobby. */
export const ESPION_ROUNDS_TO_WIN_OPTIONS = [3, 5, 7] as const
export const ESPION_DEFAULT_ROUNDS_TO_WIN = 3

export type EspionRole = 'spy' | 'crew'

export type EspionPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** SECRET — 'spy' ou 'crew', jamais exposé avant le reveal (même au joueur lui-même : `isSpy` couvre ce besoin côté vue). */
  role: EspionRole
}

/** Accusation en cours — PUBLIQUE par design (transparence, cohérent avec une partie parlée). */
export type EspionAccusation = {
  accuserId: string
  targetId: string
  supporters: string[]
  endsAt: number
}

export type EspionRoundOutcome = 'spy-caught' | 'accusation-failed' | 'spy-guessed-right' | 'spy-guessed-wrong' | 'timeout'

export type EspionRoundResult = {
  round: number
  location: string
  spyId: string
  outcome: EspionRoundOutcome
  winner: EspionRole
}

export type EspionPhase = 'countdown' | 'discussion' | 'reveal' | 'finished'

export type EspionState = TimedPhaseState & {
  version: number
  phase: EspionPhase
  players: EspionPlayer[]
  /** SECRET pour l'espion — le vrai lieu de la manche courante. */
  location: string
  /** Pool complet de lieux de la partie (pour retirage sans répétition). */
  allLocations: string[]
  /** File de tirage courante (sans répétition tant qu'elle n'est pas épuisée). */
  remainingLocations: string[]
  round: number
  discussionMs: number
  roundsToWin: number
  /** PUBLIQUE — contrairement au vote secret des autres jeux. */
  activeAccusation: EspionAccusation | null
  roundWins: { spy: number; crew: number }
  lastReveal: EspionRoundResult | null
  rematchVotes: string[]
  winnerTeam: EspionRole | null
  /** SECRET serveur. */
  rngState: number
}

export type EspionAction =
  | { type: 'ACCUSE'; playerId: string; targetId: string; now: number }
  | { type: 'SUPPORT'; playerId: string; now: number }
  | { type: 'GUESS_LOCATION'; playerId: string; location: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class EspionEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'EspionEngineError'
  }
}

export type EspionInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function espionActive(state: EspionState): EspionPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Tire le prochain lieu sans répétition ; réamorce la file si épuisée. */
function pickLocation(
  rng: SeededRng,
  remaining: string[],
  allLocations: string[]
): { location: string; remaining: string[] } {
  const queue = remaining.length > 0 ? remaining : rng.shuffle(allLocations)
  return { location: queue[0], remaining: queue.slice(1) }
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createEspionState(
  players: EspionInitialPlayer[],
  locations: string[],
  seed: string | number,
  now: number = Date.now(),
  discussionMs: number = ESPION_DEFAULT_DISCUSSION_MS,
  roundsToWin: number = ESPION_DEFAULT_ROUNDS_TO_WIN
): EspionState {
  if (players.length < ESPION_MIN_PLAYERS) throw new EspionEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > ESPION_MAX_PLAYERS) throw new EspionEngineError('TOO_MANY_PLAYERS')
  if (locations.length === 0) throw new EspionEngineError('NO_LOCATIONS')
  if (!Number.isInteger(roundsToWin) || roundsToWin < 1) {
    throw new EspionEngineError('INVALID_ROUNDS_TO_WIN')
  }

  const rng: SeededRng = createRng(seed)
  const shuffled = rng.shuffle(locations)
  const location = shuffled[0]
  const remainingLocations = shuffled.slice(1)
  const spyIdx = rng.pickIndex(players.length)

  const withRoles: EspionPlayer[] = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    role: i === spyIdx ? 'spy' : 'crew',
  }))

  return {
    version: 1,
    // La partie s'ouvre sur un compte à rebours avant la discussion.
    ...enterPhase(0, 'countdown', ESPION_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withRoles,
    location,
    allLocations: locations,
    remainingLocations,
    round: 1,
    discussionMs,
    roundsToWin,
    activeAccusation: null,
    roundWins: { spy: 0, crew: 0 },
    lastReveal: null,
    rematchVotes: [],
    winnerTeam: null,
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

function resolveRound(
  state: EspionState,
  winner: EspionRole,
  outcome: EspionRoundOutcome,
  now: number
): EspionState {
  const roundWins = { ...state.roundWins, [winner]: state.roundWins[winner] + 1 }
  const spy = state.players.find((p) => p.role === 'spy')!
  const lastReveal: EspionRoundResult = {
    round: state.round,
    location: state.location,
    spyId: spy.id,
    outcome,
    winner,
  }
  return {
    ...state,
    roundWins,
    lastReveal,
    activeAccusation: null,
    ...enterPhase(state.phaseSeq, 'reveal', null, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

/** Résout l'accusation courante si la majorité des joueurs actifs la soutient. */
function maybeResolveAccusation(state: EspionState, now: number): EspionState {
  if (!state.activeAccusation) return state
  const active = espionActive(state)
  const majorityNeeded = Math.floor(active.length / 2) + 1
  if (state.activeAccusation.supporters.length < majorityNeeded) return state
  const target = state.players.find((p) => p.id === state.activeAccusation!.targetId)
  if (!target) return state
  const spyCaught = target.role === 'spy'
  return resolveRound(state, spyCaught ? 'crew' : 'spy', spyCaught ? 'spy-caught' : 'accusation-failed', now)
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceEspion(state: EspionState, action: EspionAction): EspionState {
  switch (action.type) {
    case 'ACCUSE': {
      if (state.phase !== 'discussion') throw new EspionEngineError('NOT_DISCUSSION_PHASE')
      if (state.activeAccusation) throw new EspionEngineError('ACCUSATION_IN_PROGRESS')
      const accuser = state.players.find((p) => p.id === action.playerId)
      if (!accuser || accuser.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      const target = state.players.find((p) => p.id === action.targetId)
      if (!target || target.leftAt) throw new EspionEngineError('INVALID_TARGET')
      if (target.id === accuser.id) throw new EspionEngineError('CANNOT_ACCUSE_SELF')
      const activeAccusation: EspionAccusation = {
        accuserId: accuser.id,
        targetId: target.id,
        supporters: [accuser.id],
        endsAt: action.now + ESPION_ACCUSATION_WINDOW_MS,
      }
      return maybeResolveAccusation(
        { ...state, activeAccusation, version: state.version + 1 },
        action.now
      )
    }

    case 'SUPPORT': {
      if (state.phase !== 'discussion' || !state.activeAccusation) {
        throw new EspionEngineError('NO_ACTIVE_ACCUSATION')
      }
      if (action.now >= state.activeAccusation.endsAt) throw new EspionEngineError('ACCUSATION_EXPIRED')
      const supporter = state.players.find((p) => p.id === action.playerId)
      if (!supporter || supporter.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      if (state.activeAccusation.supporters.includes(supporter.id)) {
        throw new EspionEngineError('ALREADY_SUPPORTED')
      }
      const activeAccusation: EspionAccusation = {
        ...state.activeAccusation,
        supporters: [...state.activeAccusation.supporters, supporter.id],
      }
      return maybeResolveAccusation(
        { ...state, activeAccusation, version: state.version + 1 },
        action.now
      )
    }

    case 'GUESS_LOCATION': {
      if (state.phase !== 'discussion') throw new EspionEngineError('NOT_DISCUSSION_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new EspionEngineError('UNKNOWN_PLAYER')
      if (player.role !== 'spy') throw new EspionEngineError('NOT_SPY')
      const correct = normalize(action.location) === normalize(state.location)
      return resolveRound(state, correct ? 'spy' : 'crew', correct ? 'spy-guessed-right' : 'spy-guessed-wrong', action.now)
    }

    case 'ADVANCE': {
      // Une fenêtre d'accusation active et expirée se résout AVANT le timer principal.
      if (
        state.phase === 'discussion' &&
        state.activeAccusation &&
        action.now >= state.activeAccusation.endsAt
      ) {
        return { ...state, activeAccusation: null, version: state.version + 1 }
      }
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new EspionEngineError(check.error)
      if (state.phase === 'countdown') {
        return {
          ...state,
          ...enterPhase(state.phaseSeq, 'discussion', state.discussionMs, action.now),
          phase: 'discussion',
          version: state.version + 1,
        }
      }
      if (state.phase === 'discussion') {
        // Timer principal écoulé sans résolution → l'espion gagne par défaut.
        return resolveRound(state, 'spy', 'timeout', action.now)
      }
      throw new EspionEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new EspionEngineError('NOT_REVEAL')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new EspionEngineError('UNKNOWN_PLAYER')
      }
      if (state.roundWins.spy >= state.roundsToWin || state.roundWins.crew >= state.roundsToWin) {
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          winnerTeam: state.roundWins.spy > state.roundWins.crew ? 'spy' : 'crew',
          version: state.version + 1,
        }
      }
      const rng = rngFromState(state.rngState)
      const { location, remaining } = pickLocation(rng, state.remainingLocations, state.allLocations)
      const spyIdx = rng.pickIndex(state.players.length)
      const players = state.players.map((p, i) => ({ ...p, role: (i === spyIdx ? 'spy' : 'crew') as EspionRole }))
      return {
        ...state,
        players,
        location,
        remainingLocations: remaining,
        round: state.round + 1,
        lastReveal: null,
        ...enterPhase(state.phaseSeq, 'discussion', state.discussionMs, action.now),
        phase: 'discussion',
        rngState: rng.getState(),
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new EspionEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new EspionEngineError('UNKNOWN_PLAYER')
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
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) {
        throw new EspionEngineError('CANNOT_REJOIN')
      }
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
      if (expired.length === 0) throw new EspionEngineError('NOTHING_TO_REPLACE')
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
      throw new EspionEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * `discussion` n'a pas d'acteur unique (le vocal fait tout le travail) →
 * null. En `reveal`, le premier joueur encore en jeu mène le « continuer ».
 */
export function currentEspionActorId(state: EspionState): string | null {
  if (state.phase === 'reveal') return espionActive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type EspionPlayerView = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** null tant que la partie n'est pas terminée — personne ne voit AUCUN rôle avant le reveal. */
  role: EspionRole | null
}

export type EspionClientView = Omit<
  EspionState,
  'rngState' | 'players' | 'location' | 'allLocations' | 'remainingLocations'
> & {
  players: EspionPlayerView[]
  phaseKey: string
  /** true si le viewer est l'espion de la manche courante. */
  isSpy: boolean
  /** Le vrai lieu — null pour l'espion (jusqu'au reveal), toujours visible pour les autres. */
  location: string | null
}

/**
 * Vue PAR JOUEUR : l'espion ne voit jamais le lieu avant le reveal ; les
 * autres le voient toujours. Aucun rôle (le sien inclus) n'est exposé tant
 * que la partie n'est pas finie — `isSpy` couvre le besoin de savoir « suis-je
 * l'espion » sans exposer `role` en clair.
 */
export function toEspionClientView(state: EspionState, viewerId: string): EspionClientView {
  const { rngState: _rng, players, location, allLocations, remainingLocations, ...rest } = state
  void _rng
  void allLocations
  void remainingLocations
  // Le lieu + les rôles deviennent publics dès la révélation du ROUND (pas
  // seulement en fin de match) — cohérent avec `lastReveal` déjà peuplé.
  const revealed = state.phase === 'reveal' || state.phase === 'finished'
  const viewer = players.find((p) => p.id === viewerId)
  const viewerIsSpy = viewer?.role === 'spy'
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isSpy: Boolean(viewerIsSpy),
    location: revealed || !viewerIsSpy ? location : null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      role: revealed ? p.role : null,
    })),
  }
}

/**
 * Vue SPECTATEUR NEUTRE (TV) : jamais le lieu ni les rôles avant la fin —
 * contrairement à un joueur non-espion, le spectateur n'a AUCUN droit de
 * savoir le lieu en cours de partie (dédiée, ne délègue pas à la vue joueur).
 */
export function toEspionSpectatorView(state: EspionState): EspionClientView {
  const { rngState: _rng, players, location, allLocations, remainingLocations, ...rest } = state
  void _rng
  void allLocations
  void remainingLocations
  const revealed = state.phase === 'reveal' || state.phase === 'finished'
  return {
    ...rest,
    phaseKey: phaseKey(state),
    isSpy: false,
    location: revealed ? location : null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      role: revealed ? p.role : null,
    })),
  }
}
