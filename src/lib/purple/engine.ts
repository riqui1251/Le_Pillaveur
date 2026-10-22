import { hashSeed, rngFromState, type RngState } from '@/lib/petit-buveur/rng'
import type { BotSpeech } from '@/lib/online/bot-speech'

/**
 * Moteur pur du Purple en ligne — SERVEUR-AUTORITAIRE.
 *
 * Tour par tour : le joueur actif parie sur la couleur des prochaines
 * cartes. Bonne pioche → la cagnotte (`drinkCounter`) grossit, il peut
 * continuer ou passer la main (la cagnotte suit le tour suivant, façon
 * patate chaude). Mauvaise pioche → il boit toute la cagnotte, le tour
 * passe au joueur suivant.
 */

export type PurpleCardColor = 'red' | 'black'
export type PurpleCard = { value: string; suit: string; color: PurpleCardColor }
export type PurpleBet = 'rouge' | 'double-rouge' | 'noir' | 'double-noir' | 'purple' | 'double-purple'

export const PURPLE_BET_META: Record<PurpleBet, { cards: number; gulps: number }> = {
  rouge: { cards: 1, gulps: 1 },
  'double-rouge': { cards: 2, gulps: 2 },
  noir: { cards: 1, gulps: 1 },
  'double-noir': { cards: 2, gulps: 2 },
  purple: { cards: 2, gulps: 2 },
  'double-purple': { cards: 4, gulps: 4 },
}

export type PurplePlayer = { id: string; name: string; isBot: boolean; leftAt: number | null }

export type PurplePhase = 'playing' | 'finished'

/**
 * Parole PUBLIQUE d'un bot (`botSay.<kind>` sous games.purple), née dans la
 * même écriture que le coup qui la provoque (bot-speech.ts) :
 *   • son coup : panache (pari risqué gagné), dare (il continue, cagnotte
 *     chargée), handOff (il passe la main et la cagnotte) ;
 *   • la mauvaise pioche : lament (le perdant, un bot, se lamente), mock (un
 *     bot chambre celui qui boit).
 * Le kind ne dit que ce que la table a vu : rien sur les prochaines cartes.
 */
export type PurpleSpeechKind = 'panache' | 'dare' | 'handOff' | 'lament' | 'mock'
export type PurpleSpeech = BotSpeech<PurpleSpeechKind>

export const PURPLE_SPEECH_KINDS = [
  'panache',
  'dare',
  'handOff',
  'lament',
  'mock',
] as const satisfies readonly PurpleSpeechKind[]

/** Les kinds dont les phrases parlent de boire : masqués pour qui joue « Sans alcool ». */
export const PURPLE_DRINK_SPEECH_KINDS = ['mock'] as const satisfies readonly PurpleSpeechKind[]

/** Paroles max par bot et par fenêtre de tours ; le bavardage du persona borne en dessous. */
export const PURPLE_SPEECH_CAP = 2
/** Tours minimum d'une fenêtre de paroles (un tour de table au-delà). */
export const PURPLE_SPEECH_WINDOW_MIN = 6

/** Une parole à écrire : son auteur (un bot), son kind, le joueur qu'elle nomme. */
export type PurpleSay = { playerId: string; kind: PurpleSpeechKind; targetId: string }

export interface PurpleState {
  version: number
  rngState: RngState
  players: PurplePlayer[]
  currentPlayer: number
  phase: PurplePhase
  deck: PurpleCard[]
  drinkCounter: number
  gameResults: Record<string, number>
  drawnCards: PurpleCard[]
  lastBet: PurpleBet | null
  isCorrect: boolean | null
  /** Bonne pioche en attente de décision (continuer / passer la main). */
  canContinue: boolean
  /** Mauvaise pioche en attente d'accusé de réception (dialog local). */
  pendingReveal: boolean
  amountToDrink: number
  cardHistory: PurpleCard[]
  totalCardsDrawn: number
  rematchVotes: string[]
  /**
   * Mains passées depuis le début (passe, verdict refermé, départ du joueur
   * au tour) : la fenêtre des paroles se compte en tours. Optionnel : un état
   * sérialisé avant son arrivée part de 0.
   */
  turn?: number
  /** PUBLIC — paroles des bots, fenêtre de tours en cours et précédente (purpleSpeechRound). */
  speech?: PurpleSpeech[]
  /** Paroles déjà élaguées du début du fil : les clés des bulles restent stables. */
  speechBase?: number
}

export type PurpleAction =
  | { type: 'BET'; playerId: string; bet: PurpleBet }
  | { type: 'CONTINUE'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'CLOSE_REVEAL'; playerId: string }
  | { type: 'END'; playerId: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class PurpleEngineError extends Error {}

export const PURPLE_MIN_PLAYERS = 2
export const PURPLE_MAX_PLAYERS = 16
const CARD_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A']
const CARD_SUITS = ['♠', '♥', '♦', '♣']
const HISTORY_LIMIT = 6

function freshDeck(): Omit<PurpleCard, never>[] {
  return CARD_SUITS.flatMap((suit) =>
    CARD_VALUES.map((value) => ({
      value,
      suit,
      color: (suit === '♥' || suit === '♦' ? 'red' : 'black') as PurpleCardColor,
    }))
  )
}

export function checkPurpleBet(bet: PurpleBet, cards: PurpleCard[]): boolean {
  const colors = cards.map((c) => c.color)
  switch (bet) {
    case 'rouge':
      return colors.length === 1 && colors[0] === 'red'
    case 'double-rouge':
      return colors.length === 2 && colors.every((c) => c === 'red')
    case 'noir':
      return colors.length === 1 && colors[0] === 'black'
    case 'double-noir':
      return colors.length === 2 && colors.every((c) => c === 'black')
    case 'purple':
      return colors.length === 2 && colors[0] !== colors[1]
    case 'double-purple':
      return colors.length === 4 && colors[0] !== colors[1] && colors[2] !== colors[3]
    default:
      return false
  }
}

export function createPurpleState(
  players: { id: string; name: string; isBot?: boolean }[],
  seed: string | number
): PurpleState {
  const rng = rngFromState(hashSeed(seed))
  const deck = rng.shuffle(freshDeck())
  return {
    version: 1,
    rngState: rng.getState(),
    players: players.map((p) => ({ id: p.id, name: p.name, isBot: Boolean(p.isBot), leftAt: null })),
    currentPlayer: rng.pickIndex(players.length),
    phase: 'playing',
    deck,
    drinkCounter: 0,
    gameResults: {},
    drawnCards: [],
    lastBet: null,
    isCorrect: null,
    canContinue: false,
    pendingReveal: false,
    amountToDrink: 0,
    cardHistory: [],
    totalCardsDrawn: 0,
    rematchVotes: [],
    turn: 0,
    speech: [],
    speechBase: 0,
  }
}

function activePlayerIds(state: PurpleState): string[] {
  return state.players.filter((p) => !p.leftAt).map((p) => p.id)
}

/** Prochain joueur actif (non parti) après l'index donné, en boucle. */
function nextActiveIndex(state: PurpleState, from: number): number {
  const n = state.players.length
  for (let i = 1; i <= n; i += 1) {
    const idx = (from + i) % n
    if (!state.players[idx].leftAt) return idx
  }
  return from
}

/** La main passe au joueur d'index `idx` : un tour de plus pour la fenêtre des paroles. */
function handTo(state: PurpleState, idx: number): Pick<PurpleState, 'currentPlayer' | 'turn'> {
  return { currentPlayer: idx, turn: (state.turn ?? 0) + 1 }
}

/** Tours d'une fenêtre de paroles : un tour de table, six tours au moins. */
export function purpleSpeechWindowTurns(state: { players: readonly unknown[] }): number {
  return Math.max(PURPLE_SPEECH_WINDOW_MIN, state.players.length)
}

/**
 * La « manche » des paroles d'un jeu sans manches : la fenêtre de tours en
 * cours. Le plafond se compte par fenêtre, et le fil montre la fenêtre en
 * cours et la précédente.
 */
export function purpleSpeechRound(state: { players: readonly unknown[]; turn?: number }): number {
  return Math.floor((state.turn ?? 0) / purpleSpeechWindowTurns(state))
}

/**
 * Les paroles `says` ajoutées au fil, dans la fenêtre courante. Appelé sur
 * l'état qui SORT d'un coup, dans la même écriture : pas de version de plus.
 * Refuse (INVALID_SPEECH, ALREADY_SPOKE) un kind inconnu, un auteur qui n'est
 * pas un bot à table, une cible absente ou soi-même, un plafond atteint. Le
 * fil ne garde que la fenêtre courante et la précédente ; `speechBase` compte
 * ce qui en est sorti, pour des clés de bulles stables à l'écran.
 */
export function withPurpleSpeech(state: PurpleState, says: readonly PurpleSay[]): PurpleState {
  if (says.length === 0) return state
  const round = purpleSpeechRound(state)
  const all = state.speech ?? []
  let speech = all.filter((sp) => sp.round >= round - 1)
  const speechBase = (state.speechBase ?? 0) + (all.length - speech.length)
  for (const say of says) {
    if (!(PURPLE_SPEECH_KINDS as readonly string[]).includes(say.kind)) throw new PurpleEngineError('INVALID_SPEECH')
    const author = state.players.find((p) => p.id === say.playerId)
    if (!author || !author.isBot || author.leftAt) throw new PurpleEngineError('INVALID_SPEECH')
    const target = state.players.find((p) => p.id === say.targetId)
    if (!target || target.id === author.id) throw new PurpleEngineError('INVALID_SPEECH')
    const said = speech.filter((sp) => sp.playerId === author.id && sp.round === round).length
    if (said >= PURPLE_SPEECH_CAP) throw new PurpleEngineError('ALREADY_SPOKE')
    speech = [...speech, { playerId: author.id, kind: say.kind, targetId: target.id, round }]
  }
  return { ...state, speech, speechBase }
}

export function currentPurpleActorId(state: PurpleState): string | null {
  if (state.phase === 'finished') return null
  return state.players[state.currentPlayer]?.id ?? null
}

export function reducePurple(state: PurpleState, action: PurpleAction): PurpleState {
  switch (action.type) {
    case 'BET': {
      if (state.phase === 'finished') throw new PurpleEngineError('GAME_FINISHED')
      if (action.playerId !== currentPurpleActorId(state)) throw new PurpleEngineError('NOT_YOUR_TURN')
      if (state.canContinue || state.pendingReveal) throw new PurpleEngineError('AWAITING_DECISION')
      const meta = PURPLE_BET_META[action.bet]
      if (!meta) throw new PurpleEngineError('INVALID_BET')

      let deck = state.deck
      let rngState = state.rngState
      if (deck.length < meta.cards) {
        const rng = rngFromState(rngState)
        deck = [...deck, ...rng.shuffle(freshDeck())]
        rngState = rng.getState()
      }
      const drawn = deck.slice(0, meta.cards)
      const remaining = deck.slice(meta.cards)
      const correct = checkPurpleBet(action.bet, drawn)
      const cardHistory = [...state.cardHistory, ...drawn].slice(-HISTORY_LIMIT)

      if (correct) {
        return {
          ...state,
          version: state.version + 1,
          rngState,
          deck: remaining,
          drawnCards: drawn,
          lastBet: action.bet,
          isCorrect: true,
          canContinue: true,
          pendingReveal: false,
          drinkCounter: state.drinkCounter + meta.gulps,
          cardHistory,
          totalCardsDrawn: state.totalCardsDrawn + meta.cards,
        }
      }

      const total = state.drinkCounter + meta.gulps
      const playerId = action.playerId
      return {
        ...state,
        version: state.version + 1,
        rngState,
        deck: remaining,
        drawnCards: drawn,
        lastBet: action.bet,
        isCorrect: false,
        canContinue: false,
        pendingReveal: true,
        amountToDrink: total,
        drinkCounter: 0,
        gameResults: { ...state.gameResults, [playerId]: (state.gameResults[playerId] ?? 0) + total },
        cardHistory,
        totalCardsDrawn: state.totalCardsDrawn + meta.cards,
      }
    }

    case 'CONTINUE': {
      if (action.playerId !== currentPurpleActorId(state)) throw new PurpleEngineError('NOT_YOUR_TURN')
      if (!state.canContinue) throw new PurpleEngineError('WRONG_PHASE')
      return {
        ...state,
        version: state.version + 1,
        drawnCards: [],
        lastBet: null,
        isCorrect: null,
        canContinue: false,
      }
    }

    case 'PASS': {
      if (action.playerId !== currentPurpleActorId(state)) throw new PurpleEngineError('NOT_YOUR_TURN')
      if (!state.canContinue) throw new PurpleEngineError('WRONG_PHASE')
      return {
        ...state,
        version: state.version + 1,
        ...handTo(state, nextActiveIndex(state, state.currentPlayer)),
        drawnCards: [],
        lastBet: null,
        isCorrect: null,
        canContinue: false,
      }
    }

    case 'CLOSE_REVEAL': {
      if (action.playerId !== currentPurpleActorId(state)) throw new PurpleEngineError('NOT_YOUR_TURN')
      if (!state.pendingReveal) throw new PurpleEngineError('WRONG_PHASE')
      return {
        ...state,
        version: state.version + 1,
        ...handTo(state, nextActiveIndex(state, state.currentPlayer)),
        drawnCards: [],
        lastBet: null,
        isCorrect: null,
        pendingReveal: false,
        amountToDrink: 0,
      }
    }

    case 'END': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new PurpleEngineError('UNKNOWN_PLAYER')
      if (state.phase === 'finished') throw new PurpleEngineError('GAME_FINISHED')
      return { ...state, version: state.version + 1, phase: 'finished' }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new PurpleEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new PurpleEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      const players = state.players.map((p) => (p.id === action.playerId ? { ...p, leftAt: action.at } : p))
      const next = { ...state, players, version: state.version + 1 }
      // Si c'était le tour du partant, passe la main sans changer la cagnotte.
      if (currentPurpleActorId(state) === action.playerId && activePlayerIds(next).length > 0) {
        return { ...next, ...handTo(next, nextActiveIndex(next, next.currentPlayer)) }
      }
      return next
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new PurpleEngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.playerId ? { ...p, leftAt: null } : p)),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new PurpleEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      return {
        ...state,
        players: state.players.map((p) => (ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p)),
        version: state.version + 1,
      }
    }

    default:
      return state
  }
}

const HIDDEN_CARD: PurpleCard = { value: '', suit: '', color: 'black' }

/**
 * Le paquet restant voyage masqué, et sans la graine qui le rejoue : son ordre
 * donnait les prochaines cartes avant de parier, à tout joueur comme à
 * quiconque lit l'écran TV public avec le code de la table. Seule sa taille
 * s'affiche (« N cartes restantes »).
 */
export function toPurpleClientView(state: PurpleState) {
  const { rngState: _rngState, ...visible } = state
  return { ...visible, deck: state.deck.map(() => HIDDEN_CARD) }
}
