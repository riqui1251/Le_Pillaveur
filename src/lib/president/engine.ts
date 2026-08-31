import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import { personaForBotName } from '@/lib/online/bot-personas'

/**
 * PRÉSIDENT — moteur PUR, serveur-autoritaire.
 *
 * Le jeu de cartes des cours de récré : 52 cartes distribuées, on pose des
 * combos (simple, paire, brelan, carré) strictement plus forts, le 2 coupe
 * le pli. Premier à vider sa main = Président, dernier = Trou. Entre les
 * manches, l'échange est AUTOMATIQUE : le Trou donne ses 2 meilleures
 * cartes, le Président rend ses 2 pires.
 *
 * Cartes : entier 0..51 — rang = floor(c/4) dans l'ordre Président
 * (0='3' … 11='A', 12='2'), couleur = c%4.
 */

export const PRE_MIN_PLAYERS = 4
export const PRE_MAX_PLAYERS = 8
export const PRE_COUNTDOWN_MS = 5_000
/** Temps par tour (timeout = passe, ou pose la plus petite carte si on mène). */
export const PRE_TURN_MS = 30_000
/** Écran de fin de manche (classement + échange) avant la manche suivante. */
export const PRE_INTERLUDE_MS = 15_000
export const PRE_MANCHE_OPTIONS = [1, 3, 5] as const
export const PRE_DEFAULT_MANCHES = 3

/** Rangs dans l'ordre Président : le 3 est le plus faible, le 2 le plus fort. */
export const PRE_RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A', '2'] as const
export const PRE_SUITS = ['♠', '♥', '♦', '♣'] as const
/** Index de rang du 2 (la coupe). */
export const PRE_TWO = 12

export function preRankOf(card: number): number {
  return Math.floor(card / 4)
}

export function preSuitOf(card: number): number {
  return card % 4
}

export type PrePlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  hand: number[]
  /** Rôle hérité de la manche PRÉCÉDENTE (pilote l'échange). */
  role: 'president' | 'trou' | null
}

export type PrePhase = 'countdown' | 'playing' | 'interlude' | 'finished'

export type PreLastPlay = {
  playerId: string
  cards: number[]
}

export type PreExchange = {
  /** Cartes données par le Trou au Président (ses 2 meilleures). */
  fromTrou: number[]
  /** Cartes rendues par le Président (ses 2 pires). */
  fromPresident: number[]
  trouId: string
  presidentId: string
}

export type PreState = TimedPhaseState & {
  version: number
  phase: PrePhase
  players: PrePlayer[]
  manche: number
  totalManches: number
  /** Joueur dont c'est le tour (phase playing). */
  currentTurnId: string | null
  /** Dernier combo posé du pli courant (null = pli libre, on mène). */
  lastPlay: PreLastPlay | null
  /** Joueurs ayant passé depuis la dernière pose. */
  passedIds: string[]
  /** Ordre de sortie de la manche courante (premier = Président). */
  outOrder: string[]
  /** Classement complet de la manche CLOSE (affiché en interlude/finished). */
  lastRanking: string[] | null
  /** Échange automatique appliqué au début de la manche courante. */
  lastExchange: PreExchange | null
  rematchVotes: string[]
  rngState: number
}

export type PreAction =
  | { type: 'PLAY'; playerId: string; cards: number[]; now: number }
  | { type: 'PASS'; playerId: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class PreEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'PreEngineError'
  }
}

export type PreInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function preActive(state: PreState): PrePlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

/** Joueurs encore en course dans la manche (actifs ET avec des cartes). */
function inRace(state: PreState): PrePlayer[] {
  return preActive(state).filter((p) => p.hand.length > 0)
}

function playerById(state: PreState, id: string | null): PrePlayer | null {
  return state.players.find((p) => p.id === id) ?? null
}

/** Prochain joueur en course dans l'ordre de table, à partir de `fromId` (exclu). */
function nextInRace(state: PreState, fromId: string): string | null {
  const order = state.players.map((p) => p.id)
  const start = order.indexOf(fromId)
  if (start === -1) return null
  for (let step = 1; step <= order.length; step += 1) {
    const candidate = state.players[(start + step) % order.length]
    if (!candidate.leftAt && candidate.hand.length > 0) return candidate.id
  }
  return null
}

/** Trie une main : rang croissant (ordre Président), couleur en second. */
export function preSortHand(hand: number[]): number[] {
  return [...hand].sort((a, b) => preRankOf(a) - preRankOf(b) || a - b)
}

/** Le combo est-il posable sur le pli courant ? */
export function preCanPlay(state: PreState, playerId: string, cards: number[]): string | null {
  const player = playerById(state, playerId)
  if (!player) return 'UNKNOWN_PLAYER'
  if (cards.length < 1 || cards.length > 4) return 'INVALID_COMBO'
  if (new Set(cards).size !== cards.length) return 'INVALID_COMBO'
  if (!cards.every((c) => Number.isInteger(c) && c >= 0 && c < 52)) return 'INVALID_COMBO'
  if (!cards.every((c) => player.hand.includes(c))) return 'NOT_YOUR_CARDS'
  const rank = preRankOf(cards[0])
  if (!cards.every((c) => preRankOf(c) === rank)) return 'MIXED_RANKS'
  if (state.lastPlay) {
    if (cards.length !== state.lastPlay.cards.length) return 'WRONG_SIZE'
    if (rank <= preRankOf(state.lastPlay.cards[0])) return 'TOO_LOW'
  }
  return null
}

// ─── Création / distribution ─────────────────────────────────────────────────

function dealManche(
  state: Omit<PreState, 'phase' | 'phaseSeq' | 'phaseEndsAt'> & Partial<TimedPhaseState>,
  now: number
): PreState {
  const rng = rngFromState(state.rngState)
  const deck = rng.shuffle(Array.from({ length: 52 }, (_, i) => i))
  const active = state.players.filter((p) => !p.leftAt)
  const hands = new Map<string, number[]>(state.players.map((p) => [p.id, []]))
  deck.forEach((card, i) => {
    hands.get(active[i % active.length].id)!.push(card)
  })

  let players = state.players.map((p) => ({
    ...p,
    hand: preSortHand(hands.get(p.id) ?? []),
  }))

  // Échange automatique : les 2 meilleures du Trou contre les 2 pires du Président.
  let lastExchange: PreExchange | null = null
  const trou = players.find((p) => p.role === 'trou' && !p.leftAt)
  const president = players.find((p) => p.role === 'president' && !p.leftAt)
  if (trou && president) {
    const trouSorted = preSortHand(trou.hand)
    const presSorted = preSortHand(president.hand)
    const fromTrou = trouSorted.slice(-2)
    const fromPresident = presSorted.slice(0, 2)
    players = players.map((p) => {
      if (p.id === trou.id) {
        return { ...p, hand: preSortHand([...p.hand.filter((c) => !fromTrou.includes(c)), ...fromPresident]) }
      }
      if (p.id === president.id) {
        return { ...p, hand: preSortHand([...p.hand.filter((c) => !fromPresident.includes(c)), ...fromTrou]) }
      }
      return p
    })
    lastExchange = { fromTrou, fromPresident, trouId: trou.id, presidentId: president.id }
  }

  // Le Trou de la manche précédente mène ; sinon, un joueur actif au hasard.
  const starter =
    trou?.id ??
    active[rng.pickIndex(active.length)]?.id ??
    null

  return {
    ...(state as PreState),
    players,
    currentTurnId: starter,
    lastPlay: null,
    passedIds: [],
    outOrder: [],
    lastExchange,
    rngState: rng.getState(),
    ...enterPhase(state.phaseSeq ?? 0, 'playing', PRE_TURN_MS, now),
    phase: 'playing',
    version: state.version + 1,
  }
}

export function createPreState(
  players: PreInitialPlayer[],
  seed: string | number,
  now: number = Date.now(),
  manchesCount: number = PRE_DEFAULT_MANCHES
): PreState {
  if (players.length < PRE_MIN_PLAYERS) throw new PreEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > PRE_MAX_PLAYERS) throw new PreEngineError('TOO_MANY_PLAYERS')
  if (!Number.isInteger(manchesCount) || manchesCount < 1) {
    throw new PreEngineError('INVALID_MANCHES_COUNT')
  }

  const rng: SeededRng = createRng(seed)
  return {
    version: 1,
    ...enterPhase(0, 'countdown', PRE_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      leftAt: null,
      hand: [],
      role: null,
    })),
    manche: 0,
    totalManches: manchesCount,
    currentTurnId: null,
    lastPlay: null,
    passedIds: [],
    outOrder: [],
    lastRanking: null,
    lastExchange: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

function nextTurn(state: PreState, turnId: string | null, now: number): PreState {
  return {
    ...state,
    currentTurnId: turnId,
    ...enterPhase(state.phaseSeq, 'playing', PRE_TURN_MS, now),
    phase: 'playing',
    version: state.version + 1,
  }
}

/** Fin de manche : classement, rôles, interlude ou fin de partie. */
function endManche(state: PreState, now: number): PreState {
  const straggler = inRace(state)[0] ?? null
  const ranking = [...state.outOrder, ...(straggler ? [straggler.id] : [])]
  // Les déserteurs (inactifs avec cartes) ferment le classement.
  for (const p of state.players) {
    if (!ranking.includes(p.id)) ranking.push(p.id)
  }
  const presidentId = ranking[0] ?? null
  const trouId = ranking[ranking.length - 1] ?? null
  const players = state.players.map((p) => ({
    ...p,
    role: (p.id === presidentId ? 'president' : p.id === trouId ? 'trou' : null) as PrePlayer['role'],
  }))

  if (state.manche + 1 >= state.totalManches) {
    return {
      ...state,
      players,
      lastRanking: ranking,
      currentTurnId: null,
      lastPlay: null,
      phase: 'finished',
      phaseSeq: state.phaseSeq + 1,
      phaseEndsAt: null,
      version: state.version + 1,
    }
  }
  return {
    ...state,
    players,
    lastRanking: ranking,
    currentTurnId: null,
    lastPlay: null,
    passedIds: [],
    ...enterPhase(state.phaseSeq, 'interlude', PRE_INTERLUDE_MS, now),
    phase: 'interlude',
    version: state.version + 1,
  }
}

function startNextManche(state: PreState, now: number): PreState {
  return dealManche({ ...state, manche: state.manche + 1 }, now)
}

/** Applique une pose valide (cartes déjà vérifiées). */
function applyPlay(state: PreState, playerId: string, cards: number[], now: number): PreState {
  const isCut = preRankOf(cards[0]) === PRE_TWO
  let next: PreState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, hand: p.hand.filter((c) => !cards.includes(c)) } : p
    ),
    lastPlay: { playerId, cards: preSortHand(cards) },
    passedIds: [],
    version: state.version + 1,
  }

  const player = playerById(next, playerId)!
  if (player.hand.length === 0) {
    next = { ...next, outOrder: [...next.outOrder, playerId] }
  }

  // Fin de manche : plus qu'un joueur en course.
  if (inRace(next).length <= 1) return endManche(next, now)

  // Le 2 coupe : pli terminé, celui qui a coupé remène (ou le suivant s'il est sorti).
  if (isCut) {
    const leader = player.hand.length > 0 ? playerId : nextInRace(next, playerId)
    return nextTurn({ ...next, lastPlay: null }, leader, now)
  }

  return nextTurn(next, nextInRace(next, playerId), now)
}

/** Applique un passe ; si tout le monde a passé, le pli est gagné. */
function applyPass(state: PreState, playerId: string, now: number): PreState {
  let next: PreState = {
    ...state,
    passedIds: [...state.passedIds, playerId],
    version: state.version + 1,
  }

  const owner = next.lastPlay?.playerId ?? null
  const stillIn = inRace(next).filter(
    (p) => p.id !== owner && !next.passedIds.includes(p.id)
  )
  if (stillIn.length === 0) {
    // Pli gagné par le poseur : il remène (ou le suivant s'il est sorti).
    const ownerPlayer = owner ? playerById(next, owner) : null
    const leader =
      ownerPlayer && !ownerPlayer.leftAt && ownerPlayer.hand.length > 0
        ? owner
        : nextInRace(next, owner ?? playerId)
    return nextTurn({ ...next, lastPlay: null, passedIds: [] }, leader, now)
  }

  return nextTurn(next, nextInRace(next, playerId), now)
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reducePre(state: PreState, action: PreAction): PreState {
  switch (action.type) {
    case 'PLAY': {
      if (state.phase !== 'playing') throw new PreEngineError('NOT_PLAYING')
      if (state.currentTurnId !== action.playerId) throw new PreEngineError('NOT_YOUR_TURN')
      const error = preCanPlay(state, action.playerId, action.cards)
      if (error) throw new PreEngineError(error)
      return applyPlay(state, action.playerId, action.cards, action.now)
    }

    case 'PASS': {
      if (state.phase !== 'playing') throw new PreEngineError('NOT_PLAYING')
      if (state.currentTurnId !== action.playerId) throw new PreEngineError('NOT_YOUR_TURN')
      if (!state.lastPlay) throw new PreEngineError('MUST_LEAD')
      return applyPass(state, action.playerId, action.now)
    }

    case 'CONTINUE': {
      if (state.phase !== 'interlude') throw new PreEngineError('NOT_INTERLUDE')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new PreEngineError('UNKNOWN_PLAYER')
      }
      return startNextManche(state, action.now)
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new PreEngineError(check.error)
      if (state.phase === 'countdown') return dealManche(state, action.now)
      if (state.phase === 'interlude') return startNextManche(state, action.now)
      if (state.phase === 'playing') {
        // Timeout de tour : passe d'office — ou pose la plus petite carte si on mène.
        const actor = playerById(state, state.currentTurnId)
        if (!actor || actor.leftAt || actor.hand.length === 0) {
          return nextTurn(state, nextInRace(state, state.currentTurnId ?? state.players[0].id), action.now)
        }
        if (!state.lastPlay) {
          const lowest = preSortHand(actor.hand)[0]
          return applyPlay(state, actor.id, [lowest], action.now)
        }
        return applyPass(state, actor.id, action.now)
      }
      throw new PreEngineError('NOTHING_TO_ADVANCE')
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new PreEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new PreEngineError('UNKNOWN_PLAYER')
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
      if (!player || player.isBot || !player.leftAt) throw new PreEngineError('CANNOT_REJOIN')
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
      if (expired.length === 0) throw new PreEngineError('NOTHING_TO_REPLACE')
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
      throw new PreEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Acteur courant / bot ────────────────────────────────────────────────────

export function currentPreActorId(state: PreState): string | null {
  if (state.phase === 'playing') return state.currentTurnId
  if (state.phase === 'interlude') return preActive(state)[0]?.id ?? null
  return null
}

/** Rang « haut » (dame et plus) : seuil des passes volontaires du prudent. */
const PRE_HIGH_RANK = 9

/**
 * Stratégie bot, teintée par le persona (retrouvé par le nom — un converti
 * sans persona joue en suiveur) :
 *  - ne casse un brelan/carré qu'en dernier recours (préférence aux groupes
 *    de taille EXACTE, les simples visent d'abord les rangs isolés) ;
 *  - n'ouvre jamais avec les 2 (la coupe se garde) et ne coupe que faute de
 *    mieux — l'agressif coupe plus volontiers ;
 *  - sortie sèche : un combo qui vide la main se joue toujours ;
 *  - farceur : ouvre parfois d'un simple médian pour brouiller les pistes ;
 *  - agressif : surenchérit parfois d'un cran au-dessus du minimum ;
 *  - prudent : lâche les plis trop hauts quand il a de la marge.
 * `rand` injectable pour des tests déterministes ; null = passe.
 */
export function prePickBotPlay(
  state: PreState,
  playerId: string,
  rand: () => number = Math.random
): number[] | null {
  const player = playerById(state, playerId)
  if (!player) return null
  const trait = personaForBotName(player.name)?.trait ?? 'suiveur'
  const byRank = new Map<number, number[]>()
  for (const c of player.hand) {
    const r = preRankOf(c)
    byRank.set(r, [...(byRank.get(r) ?? []), c])
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b)
  if (ranks.length === 0) return null

  if (!state.lastPlay) {
    // Sortie sèche : un seul rang en main → tout poser.
    if (ranks.length === 1) return byRank.get(ranks[0])!
    // Jamais ouvrir avec la coupe tant qu'il reste autre chose.
    const openRanks = ranks.filter((r) => r !== PRE_TWO)
    // Farceur : parfois un simple médian plutôt que le groupe le plus bas.
    if (trait === 'farceur' && openRanks.length >= 3 && rand() < 0.3) {
      const mid = openRanks[Math.floor(openRanks.length / 2)]
      return [byRank.get(mid)![0]]
    }
    return byRank.get(openRanks[0] ?? ranks[0])!
  }

  const size = state.lastPlay.cards.length
  const target = preRankOf(state.lastPlay.cards[0])
  const playable = ranks.filter((r) => r > target && byRank.get(r)!.length >= size)
  if (playable.length === 0) return null

  // Sortie sèche : un candidat qui vide la main se joue sans réfléchir.
  const emptying = playable.find(
    (r) => byRank.get(r)!.length === size && player.hand.length === size
  )
  if (emptying !== undefined) return byRank.get(emptying)!

  // Prudent : lâche un pli déjà haut quand il lui reste de la marge.
  if (trait === 'prudent' && target >= PRE_HIGH_RANK && player.hand.length > size + 2 && rand() < 0.6) {
    return null
  }

  const exact = playable.filter((r) => r !== PRE_TWO && byRank.get(r)!.length === size)
  const breaking = playable.filter((r) => r !== PRE_TWO && byRank.get(r)!.length > size)
  const twos = playable.filter((r) => r === PRE_TWO)

  let pickRank: number | undefined
  if (exact.length > 0) {
    pickRank = exact[0]
    // Agressif : surenchérit d'un cran au-dessus du minimum.
    if (trait === 'agressif' && exact.length > 1 && rand() < 0.4) pickRank = exact[1]
  } else if (breaking.length > 0) {
    // Dernier recours : entamer le plus petit groupe au-dessus — le prudent
    // préfère passer que démonter un brelan tôt dans la manche.
    if (trait === 'prudent' && player.hand.length > 6 && rand() < 0.5) return null
    pickRank = breaking[0]
  } else if (twos.length > 0) {
    // Couper au 2 : l'agressif volontiers, les autres gardent la coupe tant
    // que la main est encore longue.
    const eager = trait === 'agressif' ? 0.8 : 0.35
    if (player.hand.length <= size + 2 || rand() < eager) pickRank = twos[0]
  }
  if (pickRank === undefined) return null
  return byRank.get(pickRank)!.slice(0, size)
}

// ─── Vues ────────────────────────────────────────────────────────────────────

export type PrePlayerView = Omit<PrePlayer, 'hand'> & { handCount: number }

export type PreClientView = Omit<PreState, 'rngState' | 'players'> & {
  phaseKey: string
  players: PrePlayerView[]
  /** Ma main triée (vide pour un spectateur). */
  myHand: number[]
}

/**
 * Vue PAR JOUEUR : les mains adverses sont réduites à un compte, et les
 * cartes de l'échange ne sont visibles que du Président et du Trou concernés
 * (les autres savent qu'un échange a eu lieu, pas son contenu).
 */
export function toPreClientView(state: PreState, viewerId: string): PreClientView {
  const { rngState: _rng, players, ...rest } = state
  void _rng
  const exchange = state.lastExchange
  const seesExchange =
    exchange !== null && (viewerId === exchange.trouId || viewerId === exchange.presidentId)
  return {
    ...rest,
    lastExchange: exchange
      ? seesExchange
        ? exchange
        : { ...exchange, fromTrou: [], fromPresident: [] }
      : null,
    phaseKey: phaseKey(state),
    myHand: preSortHand(players.find((p) => p.id === viewerId)?.hand ?? []),
    players: players.map(({ hand, ...p }) => ({ ...p, handCount: hand.length })),
  }
}

export function toPreSpectatorView(state: PreState): PreClientView {
  return toPreClientView(state, '')
}
