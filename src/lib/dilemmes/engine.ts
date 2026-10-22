import { createRng, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import type { BotSpeech } from '@/lib/online/bot-speech'

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

/**
 * Parole PUBLIQUE d'un bot (`botSay.<kind>` sous games.dilemmes.game), portée
 * par son vote et née dans la MÊME réduction. Le kind est le seul message, et
 * il ne dit JAMAIS ce que le bot a voté — le vote reste secret jusqu'à la
 * révélation, comme celui des humains :
 *   • easy (« facile, celle-là ») et tough (« dur de choisir ») ;
 *   • confess, sur un « Je n'ai jamais » : il taquine un humain (« avoue ! »).
 * outvoted, teaseMinority, twin, spill, designated et called sont les
 * réactions à la révélation : dérivées de la vue publique
 * (reveal-reactions.ts), jamais écrites ici.
 */
export type DilSpeechKind =
  | 'easy'
  | 'tough'
  | 'confess'
  | 'outvoted'
  | 'teaseMinority'
  | 'twin'
  | 'spill'
  | 'designated'
  | 'called'
export type DilSpeech = BotSpeech<DilSpeechKind>

export const DIL_SPEECH_KINDS = [
  'easy',
  'tough',
  'confess',
  'outvoted',
  'teaseMinority',
  'twin',
  'spill',
  'designated',
  'called',
] as const satisfies readonly DilSpeechKind[]

/** Paroles max par bot et par manche, réactions comprises ; le bavardage du persona borne en dessous. */
export const DIL_SPEECH_CAP = 2

/** Les kinds qu'un vote peut porter ; les réactions de la révélation n'y sont jamais. */
export const DIL_SAY_KINDS: readonly DilSpeechKind[] = ['easy', 'tough', 'confess']

/** La parole jointe à un vote : son kind et le joueur qu'elle nomme. */
export type DilSay = { kind: DilSpeechKind; targetId: string }

/** Codes d'un `say` refusé : le vote, lui, reste valable sans parole. */
export const DIL_SAY_ERRORS: readonly string[] = ['INVALID_KIND', 'INVALID_TARGET', 'ALREADY_SPOKE']

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
  /**
   * PUBLIC — paroles des bots de la manche en cours (`round`), vidées à la
   * carte suivante. Optionnel : un état sérialisé avant leur arrivée n'en a
   * pas (parseDilState complète).
   */
  speech?: DilSpeech[]
}

export type DilAction =
  | { type: 'VOTE'; playerId: string; choice: string; now: number; say?: DilSay }
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

/**
 * Le fil après un vote qui porte `say`, ou tel quel sans parole. Seul un bot
 * parle (l'adaptateur HTTP ne lit jamais `say`), vers un autre joueur encore
 * là ; confess n'existe que sur un « Je n'ai jamais ». Un kind de réaction,
 * une cible refusée ou un plafond atteint refusent le vote — l'adaptateur le
 * rejoue alors sans parole.
 */
function withSay(state: DilState, actor: DilPlayer, card: DilCard, say: DilSay | undefined): DilSpeech[] {
  const speech = state.speech ?? []
  if (!say) return speech
  if (!actor.isBot || !DIL_SAY_KINDS.includes(say.kind)) throw new DilEngineError('INVALID_KIND')
  if (say.kind === 'confess' && card.kind !== 'never') throw new DilEngineError('INVALID_KIND')
  const target = state.players.find((p) => p.id === say.targetId)
  if (!target || target.id === actor.id || target.leftAt) throw new DilEngineError('INVALID_TARGET')
  const mine = speech.filter((sp) => sp.playerId === actor.id && sp.round === state.round)
  if (mine.length >= DIL_SPEECH_CAP) throw new DilEngineError('ALREADY_SPOKE')
  return [...speech, { playerId: actor.id, kind: say.kind, targetId: target.id, round: state.round }]
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
    speech: [],
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/**
 * Entre en phase vote : personne n'a encore voté. Les bots votent UN PAR UN
 * au fil des ticks (applyDilBotAction), selon leur persona — la fin anticipée
 * « tout le monde a voté » arrive donc via les ticks, comme pour les humains.
 */
function enterVote(state: DilState, now: number): DilState {
  return {
    ...state,
    votes: {},
    lastReveal: null,
    speech: [],
    ...enterPhase(state.phaseSeq, 'vote', DIL_VOTE_MS, now),
    phase: 'vote',
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
      const speech = withSay(state, actor, card, action.say)
      const votes = { ...state.votes, [actor.id]: action.choice }
      const next = { ...state, votes, speech, version: state.version + 1 }
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
          speech: [],
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
