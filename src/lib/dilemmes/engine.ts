import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * DILEMMES — moteur PUR, serveur-autoritaire.
 *
 * Le brise-glace du Pillaveur : une carte s'affiche (« Tu préfères… »,
 * « Je n'ai jamais… », « Qui de la table… »), chacun vote EN SECRET, tout se
 * révèle d'un coup — et la minorité boit (en mode Apéro). Pas de vainqueur,
 * pas de classement : c'est l'échauffement avant les gros jeux.
 */

export const DIL_MIN_PLAYERS = 3
export const DIL_MAX_PLAYERS = 16
export const DIL_COUNTDOWN_MS = 5_000
/** Temps pour voter (fin anticipée quand tout le monde a voté). */
export const DIL_VOTE_MS = 30_000
export const DIL_ROUND_OPTIONS = [10, 15, 20] as const
export const DIL_DEFAULT_ROUNDS = 10

export type DilCard =
  | { kind: 'prefer'; a: string; b: string }
  | { kind: 'never'; text: string }
  | { kind: 'who'; text: string }

export type DilPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
}

export type DilPhase = 'countdown' | 'vote' | 'reveal' | 'finished'

export type DilRevealEntry = { voterId: string; choice: string }

export type DilState = TimedPhaseState & {
  version: number
  phase: DilPhase
  players: DilPlayer[]
  /** Cartes tirées pour CETTE partie (l'index `round` est la carte courante). */
  cards: DilCard[]
  round: number
  /** SECRET pendant `vote` — playerId → 'A' | 'B' | playerId visé. */
  votes: Record<string, string>
  /** Public en `reveal` : votes de la manche close. */
  lastReveal: DilRevealEntry[] | null
  rematchVotes: string[]
  rngState: number
}

export type DilAction =
  | { type: 'VOTE'; playerId: string; choice: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class DilEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'DilEngineError'
  }
}

export type DilInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function dilActive(state: DilState): DilPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

export function dilCurrentCard(state: DilState): DilCard | null {
  return state.cards[state.round] ?? null
}

function validChoice(state: DilState, card: DilCard, voterId: string, choice: string): boolean {
  if (card.kind === 'who') {
    return state.players.some((p) => p.id === choice && !p.leftAt && p.id !== voterId)
  }
  return choice === 'A' || choice === 'B'
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createDilState(
  players: DilInitialPlayer[],
  cards: DilCard[],
  seed: string | number,
  now: number = Date.now(),
  roundsCount: number = DIL_DEFAULT_ROUNDS
): DilState {
  if (players.length < DIL_MIN_PLAYERS) throw new DilEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > DIL_MAX_PLAYERS) throw new DilEngineError('TOO_MANY_PLAYERS')
  if (cards.length < 1) throw new DilEngineError('NO_CARDS')
  if (!Number.isInteger(roundsCount) || roundsCount < 1) {
    throw new DilEngineError('INVALID_ROUNDS_COUNT')
  }

  const rng: SeededRng = createRng(seed)
  const gameCards = rng.shuffle(cards).slice(0, Math.min(roundsCount, cards.length))

  return {
    version: 1,
    ...enterPhase(0, 'countdown', DIL_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      leftAt: null,
    })),
    cards: gameCards,
    round: 0,
    votes: {},
    lastReveal: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Entre en phase vote : les bots votent immédiatement (reproductible). */
function enterVote(state: DilState, now: number): DilState {
  const rng = rngFromState(state.rngState)
  const card = dilCurrentCard(state)
  const votes: Record<string, string> = {}
  if (card) {
    for (const p of dilActive(state)) {
      if (!p.isBot) continue
      if (card.kind === 'who') {
        const targets = dilActive(state).filter((t) => t.id !== p.id)
        if (targets.length > 0) votes[p.id] = rng.pick(targets).id
      } else {
        votes[p.id] = rng.chance(0.5) ? 'A' : 'B'
      }
    }
  }
  return {
    ...state,
    votes,
    lastReveal: null,
    ...enterPhase(state.phaseSeq, 'vote', DIL_VOTE_MS, now),
    phase: 'vote',
    rngState: rng.getState(),
    version: state.version + 1,
  }
}

function enterReveal(state: DilState, now: number): DilState {
  return {
    ...state,
    lastReveal: Object.entries(state.votes).map(([voterId, choice]) => ({ voterId, choice })),
    ...enterPhase(state.phaseSeq, 'reveal', null, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceDil(state: DilState, action: DilAction): DilState {
  switch (action.type) {
    case 'VOTE': {
      if (state.phase !== 'vote') throw new DilEngineError('NOT_VOTE_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new DilEngineError('UNKNOWN_PLAYER')
      if (state.votes[actor.id]) throw new DilEngineError('ALREADY_VOTED')
      const card = dilCurrentCard(state)
      if (!card || !validChoice(state, card, actor.id, action.choice)) {
        throw new DilEngineError('INVALID_CHOICE')
      }
      const votes = { ...state.votes, [actor.id]: action.choice }
      const next = { ...state, votes, version: state.version + 1 }
      if (dilActive(state).every((p) => votes[p.id])) return enterReveal(next, action.now)
      return next
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new DilEngineError(check.error)
      if (state.phase === 'countdown') return enterVote(state, action.now)
      if (state.phase === 'vote') {
        // Les retardataires s'abstiennent — révélation quand même.
        return enterReveal(state, action.now)
      }
      throw new DilEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new DilEngineError('NOT_REVEAL')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new DilEngineError('UNKNOWN_PLAYER')
      }
      const nextRound = state.round + 1
      if (nextRound >= state.cards.length) {
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          version: state.version + 1,
        }
      }
      return enterVote({ ...state, round: nextRound, votes: {} }, action.now)
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new DilEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new DilEngineError('UNKNOWN_PLAYER')
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
      if (!player || player.isBot || !player.leftAt) throw new DilEngineError('CANNOT_REJOIN')
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
      if (expired.length === 0) throw new DilEngineError('NOTHING_TO_REPLACE')
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
      throw new DilEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Acteur courant ──────────────────────────────────────────────────────────

/** `vote` est simultanée ; en `reveal`, le premier joueur actif mène le « continuer ». */
export function currentDilActorId(state: DilState): string | null {
  if (state.phase === 'reveal') return dilActive(state)[0]?.id ?? null
  return null
}

// ─── Vues ────────────────────────────────────────────────────────────────────

export type DilPlayerView = DilPlayer & { hasVoted: boolean }

export type DilClientView = Omit<DilState, 'rngState' | 'players' | 'cards' | 'votes'> & {
  phaseKey: string
  totalRounds: number
  players: DilPlayerView[]
  /** Carte courante uniquement (jamais les suivantes). */
  card: DilCard | null
  myVote: string | null
}

/** Vue PAR JOUEUR : votes secrets pendant `vote` (juste hasVoted), publics au reveal. */
export function toDilClientView(state: DilState, viewerId: string): DilClientView {
  const { rngState: _rng, players, cards, votes, ...rest } = state
  void _rng
  return {
    ...rest,
    phaseKey: phaseKey(state),
    totalRounds: cards.length,
    card: state.phase === 'countdown' || state.phase === 'finished' ? null : dilCurrentCard(state),
    myVote: votes[viewerId] ?? null,
    players: players.map((p) => ({ ...p, hasVoted: Boolean(votes[p.id]) })),
  }
}

export function toDilSpectatorView(state: DilState): DilClientView {
  return toDilClientView(state, '')
}
