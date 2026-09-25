/**
 * Moteur pur du Hi-Lo LOCAL (un seul téléphone qui tourne autour de la table).
 * Aucune dépendance React/Next : paquet, tirage, comparaison plus haut / plus
 * bas / égal, fin de paquet, gorgées et fin de partie. Le composant ne garde
 * que l'affichage et les délais d'animation.
 *
 * Extrait STRICTEMENT à l'identique du composant historique : mêmes tirages à
 * suite aléatoire égale (`random` injectable), mêmes gorgées, mêmes gagnants —
 * y compris là où l'ancien code lisait des valeurs d'AVANT le tirage (état de
 * rendu figé dans une fermeture). Ces lectures sont signalées « lecture
 * d'avant le tirage » ; les corriger changerait des scores, c'est une décision
 * de règle, pas un refactor.
 */

export type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'V' | 'D' | 'R' | 'A'
export type CardSuit = '♠' | '♥' | '♦' | '♣'

export interface HiLoCard {
  value: CardValue
  suit: CardSuit
  /** 'red' ou 'black' (chaîne libre dans les sauvegardes historiques). */
  color: string
}

export type HiLoMode = 'standard' | 'traversee'
export type HiLoGuess = 'higher' | 'lower' | 'equal'
export type RandomSource = () => number

/** Valeurs des cartes pour la comparaison (As fort). */
export const CARD_RANK: Record<CardValue, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'V': 11, 'D': 12, 'R': 13, 'A': 14,
}

export const CARD_VALUES: CardValue[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A']
export const CARD_SUITS: CardSuit[] = ['♠', '♥', '♦', '♣']
export const DECK_SIZE = CARD_SUITS.length * CARD_VALUES.length

/** Au-delà de 4 tirages d'une MÊME carte (5 paquets consommés), la partie s'arrête. */
export const MAX_SAME_CARD_DRAWS = 4

/** Jeu complet de 52 cartes, couleur par couleur (♠, ♥, ♦, ♣), du 2 à l'As. */
export function createDeck(): HiLoCard[] {
  const deck: HiLoCard[] = []
  for (const suit of CARD_SUITS) {
    for (const value of CARD_VALUES) {
      deck.push({ value, suit, color: suit === '♥' || suit === '♦' ? 'red' : 'black' })
    }
  }
  return deck
}

/** Mélange Fisher-Yates (51 tirages pour 52 cartes) ; `random` injectable pour les tests. */
export function shuffleDeck(deck: HiLoCard[], random: RandomSource = Math.random): HiLoCard[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/** La prédiction est-elle juste ? L'égalité ne se gagne qu'en l'annonçant. */
export function isGuessCorrect(guess: HiLoGuess, current: HiLoCard, next: HiLoCard): boolean {
  const currentValue = CARD_RANK[current.value]
  const nextValue = CARD_RANK[next.value]
  if (guess === 'higher') return nextValue > currentValue
  if (guess === 'lower') return nextValue < currentValue
  return nextValue === currentValue
}

/** Traversée : 5 bonnes réponses d'affilée à 2 joueurs, +2 par joueur supplémentaire. */
export function traverseeTarget(playerCount: number): number {
  return 5 + Math.max(0, playerCount - 2) * 2
}

export type HiLoState = {
  mode: HiLoMode
  /** Table, dans l'ordre de la prop `players` : l'ordre de passage du mode standard. */
  playerIds: string[]
  deck: HiLoCard[]
  currentCard: HiLoCard | null
  /** Carte tirée pour le tour en cours (null entre deux tours). */
  nextCard: HiLoCard | null
  /** Index dans `playerIds` (standard) ou dans `activePlayerIds` (traversée). */
  currentPlayerIndex: number
  drinkCounter: number
  gameResults: Record<string, number>
  /** Tirages par carte exacte (« 7-♠ ») depuis le début de la partie. */
  sameCardCount: Record<string, number>
  /** Traversée : joueurs encore en jeu (un « égal » réussi fait sortir). */
  activePlayerIds: string[]
  correctGuessesInRow: number
  targetGuesses: number
  lastGuess: HiLoGuess | null
  /** Verdict du dernier tirage, null tant qu'il n'est pas révélé. */
  isCorrect: boolean | null
  /** Carte révélée, en attente du tour suivant. */
  showResult: boolean
  /** Le dernier tirage était une égalité que le joueur n'a pas annoncée. */
  isUnguessedEqual: boolean
  gameOver: boolean
}

export type HiLoPlayerResult = { playerId: string; drinks: number; won: boolean }

/** Fin de partie : gagnant et bilan par joueur, dans l'ordre de la table. */
export type HiLoEnd = { winnerId: string | null; results: HiLoPlayerResult[] }

/** Joueur au tour : dans la table (standard) ou parmi les joueurs encore en jeu (traversée). */
export function currentHiLoPlayerId(state: HiLoState): string | null {
  const ids = state.mode === 'traversee' ? state.activePlayerIds : state.playerIds
  return ids[state.currentPlayerIndex] ?? null
}

/**
 * Nouvelle partie. Ordre des tirages : le mélange (51), puis — en standard
 * seulement — le premier joueur. La traversée commence toujours au premier.
 * `previous` : partie qu'on relance (bouton « Rejouer »). Comme l'ancien
 * composant, la relance ne remet PAS à zéro le drapeau d'égalité non annoncée
 * (lu au tirage suivant, voir resolveHiLoGuess).
 */
export function startHiLoGame(options: {
  mode: HiLoMode
  playerIds: string[]
  random?: RandomSource
  previous?: Pick<HiLoState, 'isUnguessedEqual'> | null
}): HiLoState {
  const { mode, playerIds, random = Math.random, previous } = options
  const shuffled = shuffleDeck(createDeck(), random)
  const currentPlayerIndex = mode === 'standard' ? Math.floor(random() * playerIds.length) : 0
  const traversee = mode === 'traversee'
  return {
    mode,
    playerIds: [...playerIds],
    deck: shuffled.slice(1),
    currentCard: shuffled[0],
    nextCard: null,
    currentPlayerIndex,
    drinkCounter: 1,
    gameResults: {},
    sameCardCount: {},
    activePlayerIds: traversee ? [...playerIds] : [],
    correctGuessesInRow: 0,
    targetGuesses: traversee ? traverseeTarget(playerIds.length) : 5,
    lastGuess: null,
    isCorrect: null,
    showResult: false,
    isUnguessedEqual: previous?.isUnguessedEqual ?? false,
    gameOver: false,
  }
}

function addDrinks(results: Record<string, number>, playerIds: string[], drinks: number): Record<string, number> {
  const next = { ...results }
  for (const id of playerIds) next[id] = (next[id] || 0) + drinks
  return next
}

/**
 * Celui qui a bu le moins PARMI ceux qui ont bu (premier trouvé à égalité) :
 * un joueur resté à 0 gorgée n'apparaît pas dans les résultats et n'est donc
 * pas candidat — comportement historique.
 */
function leastDrinker(results: Record<string, number>): string | null {
  let winnerId: string | null = null
  let minDrinks = Infinity
  for (const playerId in results) {
    if (results[playerId] < minDrinks) {
      minDrinks = results[playerId]
      winnerId = playerId
    }
  }
  return winnerId
}

/**
 * Gagnant et bilan d'une partie qui s'arrête sur `state`.
 * - Standard : le moins de gorgées ; personne n'a bu → le dernier de la table.
 * - Traversée : objectif atteint → le joueur au tour ; sinon le moins de gorgées.
 */
export function hiLoFinalResults(state: HiLoState): HiLoEnd {
  let winnerId: string | null
  if (state.mode === 'standard') {
    winnerId = leastDrinker(state.gameResults)
    if (winnerId === null && state.playerIds.length > 0) winnerId = state.playerIds[state.playerIds.length - 1]
  } else if (state.correctGuessesInRow >= state.targetGuesses) {
    winnerId = state.activePlayerIds[state.currentPlayerIndex] ?? null
  } else {
    winnerId = leastDrinker(state.gameResults)
  }
  return {
    winnerId,
    results: state.playerIds.map((playerId) => ({
      playerId,
      drinks: state.gameResults[playerId] || 0,
      won: playerId === winnerId,
    })),
  }
}

export type HiLoGuessOutcome = {
  /** Pendant le retournement : carte tirée, paquet entamé, rien de révélé. */
  drawn: HiLoState
  /** Après le retournement : verdict, gorgées, éventuelle fin de partie. */
  resolved: HiLoState
  /** Afficher la fenêtre « mauvais choix » (aussi à la 5e carte identique). */
  missDialog: boolean
  /** Fin de partie déclenchée par ce tirage, sinon null. */
  end: HiLoEnd | null
}

/**
 * Tire la carte suivante et juge la prédiction. Null si aucune carte en jeu
 * ou partie finie.
 *
 * Fin de paquet : sous 2 cartes restantes, un paquet NEUF de 52 est mélangé
 * (la dernière carte de l'ancien est abandonnée).
 *
 * Lectures d'avant le tirage (fidélité au composant historique) :
 * - la fin de partie (gagnant, gorgées créditées aux statistiques) est calculée
 *   sur l'état d'AVANT ce tirage : à la 5e carte identique, la mise que boit
 *   le perdant s'affiche mais n'entre pas dans ses statistiques ; en traversée,
 *   l'objectif atteint désigne le gagnant « au moins de gorgées » ;
 * - en traversée, la branche « égalité non annoncée : tout le monde boit 1,
 *   série conservée » lit le drapeau du tirage PRÉCÉDENT (remis à faux à chaque
 *   tour) : une égalité non annoncée se paie donc comme une erreur ordinaire.
 */
export function resolveHiLoGuess(
  state: HiLoState,
  guess: HiLoGuess,
  random: RandomSource = Math.random
): HiLoGuessOutcome | null {
  const current = state.currentCard
  if (!current || state.gameOver) return null

  const source = state.deck.length < 2 ? shuffleDeck(createDeck(), random) : state.deck
  const next = source[0]
  const correct = isGuessCorrect(guess, current, next)
  const unguessedEqual = CARD_RANK[next.value] === CARD_RANK[current.value] && guess !== 'equal'
  const cardKey = `${next.value}-${next.suit}`
  const sameCardCount = { ...state.sameCardCount, [cardKey]: (state.sameCardCount[cardKey] || 0) + 1 }

  const drawn: HiLoState = {
    ...state,
    deck: source.slice(1),
    nextCard: next,
    lastGuess: guess,
    isUnguessedEqual: unguessedEqual,
    sameCardCount,
  }
  const resolved: HiLoState = { ...drawn, isCorrect: correct, showResult: true }

  // Cinq tirages de la même carte : le joueur au tour boit la mise, fin de partie.
  if (sameCardCount[cardKey] > MAX_SAME_CARD_DRAWS) {
    const loserId = currentHiLoPlayerId(state)
    if (loserId) resolved.gameResults = addDrinks(state.gameResults, [loserId], state.drinkCounter)
    resolved.gameOver = true
    return { drawn, resolved, missDialog: true, end: hiLoFinalResults(state) }
  }

  const bonus = guess === 'equal' ? 3 : 1

  if (state.mode === 'standard') {
    if (correct) {
      resolved.drinkCounter = state.drinkCounter + bonus
      return { drawn, resolved, missDialog: false, end: null }
    }
    // Le joueur boit le cumul ; la mise repart à 1 à la fermeture de la fenêtre.
    const loserId = state.playerIds[state.currentPlayerIndex]
    if (loserId) resolved.gameResults = addDrinks(state.gameResults, [loserId], state.drinkCounter)
    return { drawn, resolved, missDialog: true, end: null }
  }

  // Traversée
  if (correct) {
    resolved.correctGuessesInRow = state.correctGuessesInRow + 1
    resolved.drinkCounter = state.drinkCounter + bonus
    if (guess === 'equal') {
      // Un « égal » réussi fait sortir le joueur de la partie.
      resolved.activePlayerIds = state.activePlayerIds.filter((_, index) => index !== state.currentPlayerIndex)
      if (resolved.activePlayerIds.length === 0) {
        resolved.gameOver = true
        return { drawn, resolved, missDialog: false, end: hiLoFinalResults(state) }
      }
    }
    if (state.correctGuessesInRow + 1 >= state.targetGuesses) {
      resolved.gameOver = true
      return { drawn, resolved, missDialog: false, end: hiLoFinalResults(state) }
    }
    return { drawn, resolved, missDialog: false, end: null }
  }

  if (state.isUnguessedEqual) {
    // Lecture d'avant le tirage (voir plus haut) : tout le monde boit 1, cumul et série gardés.
    resolved.gameResults = addDrinks(state.gameResults, state.activePlayerIds, 1)
    return { drawn, resolved, missDialog: true, end: null }
  }

  // Erreur : tous les joueurs encore en jeu boivent la mise, la série repart de zéro.
  resolved.gameResults = addDrinks(state.gameResults, state.activePlayerIds, state.drinkCounter)
  resolved.correctGuessesInRow = 0
  return { drawn, resolved, missDialog: true, end: null }
}

/**
 * Fermeture de la fenêtre « mauvais choix » : la mise repart à 1, sauf après
 * une égalité non annoncée en traversée (le cumul y est conservé).
 */
export function acknowledgeHiLoMiss(state: HiLoState): HiLoState {
  if (state.isCorrect || (state.isUnguessedEqual && state.mode === 'traversee')) return state
  return state.drinkCounter === 1 ? state : { ...state, drinkCounter: 1 }
}

export type HiLoTurnAdvance = {
  state: HiLoState
  /** Faux quand rien n'a bougé (partie finie) ou que la table vidée a clos la partie. */
  advanced: boolean
  end: HiLoEnd | null
}

/**
 * Tour suivant : la carte tirée devient la carte visible, la main passe au
 * suivant (standard : toute la table ; traversée : les joueurs encore en jeu).
 * `missDialogOpen` : la fenêtre « mauvais choix » est encore ouverte — la mise
 * n'est alors pas remise à 1 ici (elle le sera à sa fermeture).
 */
export function advanceHiLoTurn(state: HiLoState, missDialogOpen = false): HiLoTurnAdvance {
  if (state.gameOver) return { state, advanced: false, end: null }

  let currentPlayerIndex: number
  let drinkCounter = state.drinkCounter
  if (state.mode === 'standard') {
    currentPlayerIndex = (state.currentPlayerIndex + 1) % state.playerIds.length
    if (!state.isCorrect && !missDialogOpen) drinkCounter = 1
  } else {
    if (state.activePlayerIds.length === 0) {
      return { state: { ...state, gameOver: true }, advanced: false, end: hiLoFinalResults(state) }
    }
    currentPlayerIndex = (state.currentPlayerIndex + 1) % state.activePlayerIds.length
    if (!state.isCorrect && !missDialogOpen && !state.isUnguessedEqual) drinkCounter = 1
  }

  return {
    state: {
      ...state,
      currentPlayerIndex,
      drinkCounter,
      currentCard: state.nextCard,
      nextCard: null,
      showResult: false,
      lastGuess: null,
      isCorrect: null,
      isUnguessedEqual: false,
    },
    advanced: true,
    end: null,
  }
}

/** Cartes déjà jouées (retournées), sur un paquet de 52. */
export function hiLoCardsPlayed(state: Pick<HiLoState, 'deck' | 'currentCard' | 'nextCard'>): number {
  return DECK_SIZE - state.deck.length - (state.currentCard ? 1 : 0) - (state.nextCard ? 1 : 0)
}

// ─── Reprise de partie (useResumableLocalGame) ───────────────────────────────

export const HI_LO_SAVE_ID = 'hi-lo'
/**
 * Version 2 : la sauvegarde ne porte plus que des identifiants de joueurs
 * (plus aucun profil recopié), les anciennes entrées sont donc jetées. La
 * forme ci-dessous est celle qu'écrivait déjà le composant : les parties en
 * cours dans les navigateurs se reprennent telles quelles.
 */
export const HI_LO_SAVE_VERSION = 2

export type HiLoSave = {
  gameMode: HiLoMode
  /** Table de la sauvegarde : sans ce contrôle, on reprendrait la soirée d'hier. */
  playerIds: string[]
  deck: HiLoCard[]
  currentCard: HiLoCard | null
  currentPlayerIndex: number
  drinkCounter: number
  gameResults: Record<string, number>
  sameCardCount: Record<string, number>
  /** Uniquement des identifiants : les profils sont réhydratés depuis la table. */
  activePlayerIds: string[]
  correctGuessesInRow: number
  targetGuesses: number
}

/**
 * Ce qu'on sauvegarde : paquet, carte visible et compteurs suffisent à
 * reprendre la main là où la table s'est arrêtée. La carte en cours de
 * retournement n'en fait pas partie (état d'animation).
 */
export function toHiLoSave(state: HiLoState): HiLoSave {
  return {
    gameMode: state.mode,
    playerIds: state.playerIds,
    deck: state.deck,
    currentCard: state.currentCard,
    currentPlayerIndex: state.currentPlayerIndex,
    drinkCounter: state.drinkCounter,
    gameResults: state.gameResults,
    sameCardCount: state.sameCardCount,
    activePlayerIds: state.activePlayerIds,
    correctGuessesInRow: state.correctGuessesInRow,
    targetGuesses: state.targetGuesses,
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function isCard(value: unknown): value is HiLoCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  return (
    typeof card.value === 'string' &&
    card.value in CARD_RANK &&
    CARD_SUITS.includes(card.suit as CardSuit) &&
    typeof card.color === 'string'
  )
}

function isCountMap(value: unknown): value is Record<string, number> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(isFiniteNumber)
  )
}

/**
 * Sauvegarde → état de jeu, pour la table ACTUELLE (`playerIds`, ordre de la
 * prop). Les joueurs actifs sont réhydratés depuis la table (un identifiant
 * inconnu est ignoré). Null si la sauvegarde est illisible : on repart alors
 * sur une partie neuve au lieu de planter. Le contrôle « même mode, même
 * table » reste à l'appelant (il décide de jeter la sauvegarde).
 */
export function restoreHiLoSave(save: unknown, playerIds: string[]): HiLoState | null {
  if (!save || typeof save !== 'object') return null
  const s = save as Record<string, unknown>
  if (s.gameMode !== 'standard' && s.gameMode !== 'traversee') return null
  if (!Array.isArray(s.deck) || !s.deck.every(isCard)) return null
  if (s.currentCard !== null && !isCard(s.currentCard)) return null
  if (!isFiniteNumber(s.currentPlayerIndex) || !isFiniteNumber(s.drinkCounter)) return null
  if (!isFiniteNumber(s.correctGuessesInRow) || !isFiniteNumber(s.targetGuesses)) return null
  if (!isCountMap(s.gameResults) || !isCountMap(s.sameCardCount)) return null
  if (!Array.isArray(s.activePlayerIds)) return null

  return {
    mode: s.gameMode,
    playerIds: [...playerIds],
    deck: s.deck,
    currentCard: s.currentCard as HiLoCard | null,
    nextCard: null,
    currentPlayerIndex: s.currentPlayerIndex,
    drinkCounter: s.drinkCounter,
    gameResults: s.gameResults,
    sameCardCount: s.sameCardCount,
    activePlayerIds: s.activePlayerIds.filter((id): id is string => typeof id === 'string' && playerIds.includes(id)),
    correctGuessesInRow: s.correctGuessesInRow,
    targetGuesses: s.targetGuesses,
    lastGuess: null,
    isCorrect: null,
    showResult: false,
    isUnguessedEqual: false,
    gameOver: false,
  }
}
