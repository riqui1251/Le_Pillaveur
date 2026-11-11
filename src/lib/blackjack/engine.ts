import { hashSeed, rngFromState, type RngState } from '@/lib/petit-buveur/rng'

/**
 * Moteur pur du Black Jack — partagé par le jeu local (un téléphone posé sur
 * la table) et la table en ligne (SERVEUR-AUTORITAIRE).
 *
 * Chaque joueur affronte le croupier. Une manche : chacun mise 1 à 3 gorgées,
 * deux cartes chacun, le croupier en montre une. Tour à tour, chaque main
 * tire, reste, double ou se sépare. Le croupier tire jusqu'à 17 (il reste sur
 * 17 souple). Main perdue : on boit sa mise ; main gagnée : on la distribue ;
 * Black Jack naturel : on distribue une fois et demie la mise (arrondie au-dessus).
 */

export type BjSuit = '♠' | '♥' | '♦' | '♣'
export type BjRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'V' | 'D' | 'R'
export type BjCard = { rank: BjRank; suit: BjSuit }

export type BjHand = {
  cards: BjCard[]
  /** Mise de base de la main (la mise du joueur, recopiée à la séparation). */
  stake: number
  doubled: boolean
  stood: boolean
  /** Née d'une séparation : un 21 en deux cartes n'y est pas un Black Jack. */
  fromSplit: boolean
}

export type BjOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust'

export type BjHandResult = {
  outcome: BjOutcome
  total: number
  /** Gorgées à boire par le joueur pour cette main. */
  drink: number
  /** Gorgées que le joueur distribue pour cette main. */
  give: number
}

export type BjPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** Mise de la manche en cours ; null = pas encore misé (ou assis dehors). */
  stake: number | null
  hands: BjHand[]
  results: BjHandResult[]
}

export type BjTally = { drunk: number; given: number; wins: number; blackjacks: number; hands: number }

export type BjPhase = 'betting' | 'playing' | 'results' | 'finished'

export interface BjState {
  version: number
  rngState: RngState
  players: BjPlayer[]
  phase: BjPhase
  round: number
  shoe: BjCard[]
  dealer: BjCard[]
  /** Main au tour pendant `playing` ; null sinon. */
  turn: { player: number; hand: number } | null
  /** Le croupier avait un Black Jack d'entrée : la manche s'est jouée sans tour. */
  dealerBlackjack: boolean
  totals: Record<string, BjTally>
  rematchVotes: string[]
}

export type BjAction =
  | { type: 'BET'; playerId: string; stake: number }
  | { type: 'HIT'; playerId: string }
  | { type: 'STAND'; playerId: string }
  | { type: 'DOUBLE'; playerId: string }
  | { type: 'SPLIT'; playerId: string }
  | { type: 'NEXT_ROUND'; playerId: string }
  | { type: 'END'; playerId: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class BjEngineError extends Error {}

export const BJ_MIN_PLAYERS = 1
export const BJ_MAX_PLAYERS = 7
export const BJ_STAKES = [1, 2, 3] as const
/** Deux paquets dans le sabot, remélangés quand il en reste moins que ça. */
export const BJ_DECKS = 2
export const BJ_RESHUFFLE_BELOW = 26
export const BJ_MAX_HANDS = 4

const RANKS: BjRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R']
const SUITS: BjSuit[] = ['♠', '♥', '♦', '♣']

export function freshShoe(): BjCard[] {
  const cards: BjCard[] = []
  for (let d = 0; d < BJ_DECKS; d += 1) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit })
  }
  return cards
}

export function cardValue(card: BjCard): number {
  if (card.rank === 'A') return 11
  if (card.rank === 'V' || card.rank === 'D' || card.rank === 'R') return 10
  return Number(card.rank)
}

export function isRedSuit(suit: BjSuit): boolean {
  return suit === '♥' || suit === '♦'
}

/** Total d'une main ; `soft` = un as y compte encore 11. */
export function handTotal(cards: readonly BjCard[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardValue(c)
    if (c.rank === 'A') aces += 1
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return { total, soft: aces > 0 }
}

export function isNatural(cards: readonly BjCard[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21
}

export function handIsBlackjack(hand: BjHand): boolean {
  return !hand.fromSplit && isNatural(hand.cards)
}

export function effectiveStake(hand: BjHand): number {
  return hand.doubled ? hand.stake * 2 : hand.stake
}

export function canDouble(hand: BjHand): boolean {
  return !hand.stood && hand.cards.length === 2 && !hand.doubled
}

export function canSplit(player: BjPlayer, hand: BjHand): boolean {
  return (
    !hand.stood &&
    hand.cards.length === 2 &&
    player.hands.length < BJ_MAX_HANDS &&
    cardValue(hand.cards[0]) === cardValue(hand.cards[1])
  )
}

function emptyTally(): BjTally {
  return { drunk: 0, given: 0, wins: 0, blackjacks: 0, hands: 0 }
}

export function createBjState(
  players: { id: string; name: string; isBot?: boolean }[],
  seed: string | number
): BjState {
  const rng = rngFromState(hashSeed(seed))
  const base: BjState = {
    version: 1,
    rngState: rng.getState(),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      leftAt: null,
      stake: null,
      hands: [],
      results: [],
    })),
    phase: 'betting',
    round: 0,
    shoe: rng.shuffle(freshShoe()),
    dealer: [],
    turn: null,
    dealerBlackjack: false,
    totals: Object.fromEntries(players.map((p) => [p.id, emptyTally()])),
    rematchVotes: [],
  }
  base.rngState = rng.getState()
  return startRound(base)
}

/** Nouvelle manche : mises remises à zéro, les bots misent d'office. */
function startRound(state: BjState): BjState {
  const rng = rngFromState(state.rngState)
  let shoe = state.shoe
  if (shoe.length < BJ_RESHUFFLE_BELOW) shoe = rng.shuffle(freshShoe())
  const players = state.players.map((p) => ({
    ...p,
    stake: p.isBot && !p.leftAt ? BJ_STAKES[rng.pickIndex(BJ_STAKES.length)] : null,
    hands: [],
    results: [],
  }))
  const next: BjState = {
    ...state,
    rngState: rng.getState(),
    players,
    phase: 'betting',
    round: state.round + 1,
    shoe,
    dealer: [],
    turn: null,
    dealerBlackjack: false,
    rematchVotes: [],
  }
  return maybeDeal(next)
}

/** Tous les joueurs présents ont misé : on distribue. */
function maybeDeal(state: BjState): BjState {
  const present = state.players.filter((p) => !p.leftAt)
  if (present.length === 0 || present.some((p) => p.stake === null)) return state
  return deal(state)
}

function draw(state: { shoe: BjCard[]; rngState: RngState }): BjCard {
  if (state.shoe.length === 0) {
    const rng = rngFromState(state.rngState)
    state.shoe = rng.shuffle(freshShoe())
    state.rngState = rng.getState()
  }
  return state.shoe.shift() as BjCard
}

function deal(state: BjState): BjState {
  const work = { shoe: [...state.shoe], rngState: state.rngState }
  const players = state.players.map((p) => ({
    ...p,
    hands: p.stake !== null && !p.leftAt ? [{ cards: [] as BjCard[], stake: p.stake, doubled: false, stood: false, fromSplit: false }] : [],
  }))
  const dealer: BjCard[] = []
  for (let pass = 0; pass < 2; pass += 1) {
    for (const p of players) if (p.hands[0]) p.hands[0].cards.push(draw(work))
    dealer.push(draw(work))
  }
  const dealerBlackjack = isNatural(dealer)
  for (const p of players) {
    for (const h of p.hands) if (dealerBlackjack || handTotal(h.cards).total === 21) h.stood = true
  }
  const next: BjState = {
    ...state,
    shoe: work.shoe,
    rngState: work.rngState,
    players,
    dealer,
    dealerBlackjack,
    phase: 'playing',
    turn: null,
  }
  return advanceTurn(next, { player: 0, hand: -1 })
}

/** Prochaine main à jouer après `from` ; s'il n'y en a plus, le croupier joue. */
function advanceTurn(state: BjState, from: { player: number; hand: number }): BjState {
  const players = state.players.map((p) => ({ ...p, hands: p.hands.map((h) => ({ ...h })) }))
  let pi = from.player
  let hi = from.hand + 1
  while (pi < players.length) {
    const p = players[pi]
    while (hi < p.hands.length) {
      const h = p.hands[hi]
      if (!h.stood) {
        if (p.leftAt) {
          h.stood = true
        } else {
          return { ...state, players, turn: { player: pi, hand: hi } }
        }
      }
      hi += 1
    }
    pi += 1
    hi = 0
  }
  return resolveRound({ ...state, players, turn: null })
}

function resolveRound(state: BjState): BjState {
  const work = { shoe: [...state.shoe], rngState: state.rngState }
  const dealer = [...state.dealer]
  const hands = state.players.flatMap((p) => p.hands)
  const someoneStanding = hands.some((h) => handTotal(h.cards).total <= 21 && !handIsBlackjack(h))
  if (!state.dealerBlackjack && someoneStanding) {
    while (handTotal(dealer).total < 17) dealer.push(draw(work))
  }
  const dealerTotal = handTotal(dealer).total
  const dealerBj = state.dealerBlackjack
  const totals = { ...state.totals }
  const players = state.players.map((p) => {
    const results = p.hands.map((h): BjHandResult => {
      const total = handTotal(h.cards).total
      const stake = effectiveStake(h)
      const lose = (outcome: BjOutcome): BjHandResult => ({ outcome, total, drink: stake, give: 0 })
      if (total > 21) return lose('bust')
      if (handIsBlackjack(h)) {
        if (dealerBj) return { outcome: 'push', total, drink: 0, give: 0 }
        return { outcome: 'blackjack', total, drink: 0, give: Math.ceil((stake * 3) / 2) }
      }
      if (dealerBj) return lose('lose')
      if (dealerTotal > 21 || total > dealerTotal) return { outcome: 'win', total, drink: 0, give: stake }
      if (total === dealerTotal) return { outcome: 'push', total, drink: 0, give: 0 }
      return lose('lose')
    })
    if (results.length > 0) {
      const prev = totals[p.id] ?? emptyTally()
      totals[p.id] = {
        drunk: prev.drunk + results.reduce((s, r) => s + r.drink, 0),
        given: prev.given + results.reduce((s, r) => s + r.give, 0),
        wins: prev.wins + results.filter((r) => r.outcome === 'win' || r.outcome === 'blackjack').length,
        blackjacks: prev.blackjacks + results.filter((r) => r.outcome === 'blackjack').length,
        hands: prev.hands + results.length,
      }
    }
    return { ...p, results }
  })
  return { ...state, shoe: work.shoe, rngState: work.rngState, dealer, players, totals, phase: 'results', turn: null }
}

export function currentBjHand(state: BjState): { player: BjPlayer; hand: BjHand } | null {
  if (state.phase !== 'playing' || !state.turn) return null
  const player = state.players[state.turn.player]
  const hand = player?.hands[state.turn.hand]
  return player && hand ? { player, hand } : null
}

/**
 * Joueur « au tour » : celui qui joue sa main, ou, pendant les mises, le
 * premier humain présent qui n'a pas misé (c'est lui que l'inactivité vise).
 */
export function currentBjActorId(state: BjState): string | null {
  if (state.phase === 'playing') return currentBjHand(state)?.player.id ?? null
  if (state.phase === 'betting') {
    return state.players.find((p) => !p.leftAt && p.stake === null)?.id ?? null
  }
  return null
}

function requireTurn(state: BjState, playerId: string) {
  if (state.phase !== 'playing') throw new BjEngineError('WRONG_PHASE')
  const cur = currentBjHand(state)
  if (!cur || cur.player.id !== playerId) throw new BjEngineError('NOT_YOUR_TURN')
  return cur
}

function bump(state: BjState): BjState {
  return { ...state, version: state.version + 1 }
}

/** Remplace la main au tour par `hand` (et d'éventuelles mains ajoutées après). */
function withTurnHands(state: BjState, hands: BjHand[]): BjState {
  const turn = state.turn!
  const players = state.players.map((p, i) => {
    if (i !== turn.player) return p
    const next = [...p.hands]
    next.splice(turn.hand, 1, ...hands)
    return { ...p, hands: next }
  })
  return { ...state, players }
}

export function reduceBj(state: BjState, action: BjAction): BjState {
  switch (action.type) {
    case 'BET': {
      if (state.phase !== 'betting') throw new BjEngineError('WRONG_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new BjEngineError('UNKNOWN_PLAYER')
      if (player.stake !== null) throw new BjEngineError('ALREADY_BET')
      if (!(BJ_STAKES as readonly number[]).includes(action.stake)) throw new BjEngineError('INVALID_STAKE')
      const players = state.players.map((p) => (p.id === action.playerId ? { ...p, stake: action.stake } : p))
      return bump(maybeDeal({ ...state, players }))
    }

    case 'HIT': {
      const { hand } = requireTurn(state, action.playerId)
      const work = { shoe: [...state.shoe], rngState: state.rngState }
      const cards = [...hand.cards, draw(work)]
      const total = handTotal(cards).total
      const next = withTurnHands({ ...state, ...work }, [{ ...hand, cards, stood: total >= 21 }])
      return bump(total >= 21 ? advanceTurn(next, next.turn!) : next)
    }

    case 'STAND': {
      const { hand } = requireTurn(state, action.playerId)
      const next = withTurnHands(state, [{ ...hand, stood: true }])
      return bump(advanceTurn(next, next.turn!))
    }

    case 'DOUBLE': {
      const { hand } = requireTurn(state, action.playerId)
      if (!canDouble(hand)) throw new BjEngineError('CANNOT_DOUBLE')
      const work = { shoe: [...state.shoe], rngState: state.rngState }
      const cards = [...hand.cards, draw(work)]
      const next = withTurnHands({ ...state, ...work }, [{ ...hand, cards, doubled: true, stood: true }])
      return bump(advanceTurn(next, next.turn!))
    }

    case 'SPLIT': {
      const { player, hand } = requireTurn(state, action.playerId)
      if (!canSplit(player, hand)) throw new BjEngineError('CANNOT_SPLIT')
      const work = { shoe: [...state.shoe], rngState: state.rngState }
      const aces = hand.cards[0].rank === 'A'
      const make = (card: BjCard): BjHand => {
        const cards = [card, draw(work)]
        // As séparés : une seule carte chacun. Un 21 se joue tout seul.
        return { cards, stake: hand.stake, doubled: false, fromSplit: true, stood: aces || handTotal(cards).total === 21 }
      }
      const first = make(hand.cards[0])
      const second = make(hand.cards[1])
      const next = withTurnHands({ ...state, ...work }, [first, second])
      return bump(first.stood ? advanceTurn(next, next.turn!) : next)
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'results') throw new BjEngineError('WRONG_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new BjEngineError('UNKNOWN_PLAYER')
      return bump(startRound(state))
    }

    case 'END': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new BjEngineError('UNKNOWN_PLAYER')
      if (state.phase === 'finished') throw new BjEngineError('GAME_FINISHED')
      return { ...state, version: state.version + 1, phase: 'finished', turn: null }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new BjEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new BjEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      const players = state.players.map((p) => (p.id === action.playerId ? { ...p, leftAt: action.at } : p))
      let next: BjState = { ...state, players }
      if (state.phase === 'betting') next = maybeDeal(next)
      else if (state.phase === 'playing' && state.turn && state.players[state.turn.player].id === action.playerId) {
        next = advanceTurn(next, { player: state.turn.player, hand: state.turn.hand - 1 })
      }
      return bump(next)
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new BjEngineError('CANNOT_REJOIN')
      return bump({
        ...state,
        players: state.players.map((p) => (p.id === action.playerId ? { ...p, leftAt: null } : p)),
      })
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter((p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs)
      if (expired.length === 0) throw new BjEngineError('NOTHING_TO_REPLACE')
      return bump(convertToBots(state, new Set(expired.map((p) => p.id))))
    }

    default:
      return state
  }
}

/** Joueurs → bots : en pleine mise, le bot mise aussitôt pour ne pas bloquer la donne. */
export function convertToBots(state: BjState, ids: Set<string>): BjState {
  const rng = rngFromState(state.rngState)
  const players = state.players.map((p) => {
    if (!ids.has(p.id)) return p
    const stake =
      state.phase === 'betting' && p.stake === null ? BJ_STAKES[rng.pickIndex(BJ_STAKES.length)] : p.stake
    return { ...p, isBot: true, leftAt: null, stake }
  })
  const next = { ...state, players, rngState: rng.getState() }
  return next.phase === 'betting' ? maybeDeal(next) : next
}

// ─── Bots ──────────────────────────────────────────────────────────────────

export type BjMove = 'hit' | 'stand' | 'double' | 'split'

/** Stratégie de base simplifiée : celle qu'un habitué applique sans réfléchir. */
export function bjBotMove(player: BjPlayer, hand: BjHand, dealerUp: BjCard): BjMove {
  const up = cardValue(dealerUp)
  if (canSplit(player, hand)) {
    const v = cardValue(hand.cards[0])
    if (v === 11 || v === 8) return 'split'
    if ((v === 2 || v === 3 || v === 7) && up <= 7) return 'split'
    if (v === 9 && up <= 9 && up !== 7) return 'split'
  }
  const { total, soft } = handTotal(hand.cards)
  if (canDouble(hand) && !soft && (total === 11 || (total === 10 && up <= 9) || (total === 9 && up >= 3 && up <= 6))) {
    return 'double'
  }
  if (soft) {
    if (total >= 19) return 'stand'
    if (total === 18) return up <= 8 ? 'stand' : 'hit'
    return 'hit'
  }
  if (total >= 17) return 'stand'
  if (total >= 13) return up <= 6 ? 'stand' : 'hit'
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit'
  return 'hit'
}

/** Le coup du bot au tour, ou null si la main au tour n'est pas à un bot. */
export function applyBjBotTurn(state: BjState): BjState | null {
  const cur = currentBjHand(state)
  if (!cur || !cur.player.isBot) return null
  const move = bjBotMove(cur.player, cur.hand, state.dealer[0])
  const type = move === 'hit' ? 'HIT' : move === 'stand' ? 'STAND' : move === 'double' ? 'DOUBLE' : 'SPLIT'
  return reduceBj(state, { type, playerId: cur.player.id })
}

// ─── Vue client ────────────────────────────────────────────────────────────

/** Carte face cachée (carte fermée du croupier). */
export type BjViewCard = BjCard | null

/**
 * Le sabot voyage réduit à sa taille, sans la graine qui le rejoue, et la
 * carte fermée du croupier reste cachée tant que les joueurs n'ont pas fini :
 * l'écran TV public, lui aussi, ne doit rien livrer d'avance.
 */
export function toBjClientView(state: BjState) {
  const { rngState: _rngState, shoe, dealer, ...visible } = state
  const hideHole = state.phase === 'playing' && dealer.length >= 2
  return {
    ...visible,
    shoeCount: shoe.length,
    dealer: dealer.map((c, i): BjViewCard => (hideHole && i === 1 ? null : c)),
  }
}

export type BjClientView = ReturnType<typeof toBjClientView>
