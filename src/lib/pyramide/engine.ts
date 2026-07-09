/**
 * Moteur pur du jeu Pyramide (mode local uniquement).
 * Aucune dépendance React/Next — fonctions déterministes ou paramétrées par RNG injectable.
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Value = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  suit: Suit
  value: Value
  faceUp: boolean
  position: { row: number; col: number }
}

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
export const VALUES: Value[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export const CARD_VALUES: Record<Value, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
}

/** Convertit A/J/Q/K en 10 pts, sinon valeur numérique */
export function valueToPoints(v: Value): number {
  if (v === 'A' || v === 'J' || v === 'Q' || v === 'K') return 10
  return parseInt(v, 10)
}

/** Rang de la carte pour les comparaisons du prélude (As = haut) */
export function rankValue(v: Value): number {
  return v === 'A' ? 14 : CARD_VALUES[v]
}

/** Crée un jeu de cartes (1 ou 2 paquets) */
export function createDeck(deckCount: number): Card[] {
  const deck: Card[] = []
  for (let i = 0; i < deckCount; i++) {
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value, faceUp: false, position: { row: 0, col: 0 } })
      }
    }
  }
  return deck
}

/** Mélange Fisher-Yates ; rng injectable pour des tests déterministes */
export function shuffleDeck<T>(deck: T[], rng: () => number = Math.random): T[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/** Construit la pyramide (triangle) à partir du deck, ligne par ligne */
export function createPyramid(deck: Card[], rows: number): { pyramidCards: Card[][]; remainingDeck: Card[] } {
  const pyramidCards: Card[][] = []
  let deckIndex = 0

  for (let row = 0; row < rows; row++) {
    const rowCards: Card[] = []
    for (let col = 0; col <= row; col++) {
      if (deckIndex < deck.length) {
        rowCards.push({ ...deck[deckIndex], faceUp: false, position: { row, col } })
        deckIndex++
      }
    }
    pyramidCards.push(rowCards)
  }

  return {
    pyramidCards,
    remainingDeck: deck.slice(deckIndex)
  }
}

/** Nombre total de cartes pour une pyramide de N lignes (somme triangulaire) */
export function totalCardsForHeight(rows: number): number {
  let total = 0
  for (let i = 0; i < rows; i++) total += i + 1
  return total
}

/** Prochaine carte à retourner : même ligne (colonne suivante), sinon ligne du dessus, sinon fin */
export function findNextCardToFlip(
  pyramid: Card[][],
  currentRow: number,
  currentCol: number
): { row: number; col: number } | null {
  if (currentCol + 1 < pyramid[currentRow].length) {
    return { row: currentRow, col: currentCol + 1 }
  }
  if (currentRow > 0) {
    return { row: currentRow - 1, col: 0 }
  }
  return null
}

// ── Prélude (mode classique) — prédictions en 4 étapes ─────────────────────

export type PreludeStep = 'color' | 'higherLower' | 'insideOutside' | 'suit'

export interface PreludeResult {
  step: PreludeStep
  choice: string
  card: Card
  success: boolean
}

export interface PreludeEvaluation {
  success: boolean
  penalty: number
}

/**
 * Évalue un choix de prélude. `revealedSoFar` = cartes déjà révélées pour ce
 * joueur AVANT la carte courante (ne contient pas `revealed`).
 */
export function evaluatePreludeChoice(
  step: PreludeStep,
  choice: string,
  revealed: Card,
  revealedSoFar: Card[]
): PreludeEvaluation {
  if (step === 'color') {
    const isRed = revealed.suit === 'hearts' || revealed.suit === 'diamonds'
    const success = (choice === 'red' && isRed) || (choice === 'black' && !isRed)
    return { success, penalty: 1 }
  }

  if (step === 'higherLower') {
    const first = revealedSoFar[0]
    let success = false
    if (first) {
      const cmp = rankValue(revealed.value) - rankValue(first.value)
      success = (choice === 'higher' && cmp > 0) || (choice === 'lower' && cmp < 0)
    }
    return { success, penalty: 2 }
  }

  if (step === 'insideOutside') {
    const a = revealedSoFar[0]
    const b = revealedSoFar[1]
    let success = false
    if (a && b) {
      const minV = Math.min(rankValue(a.value), rankValue(b.value))
      const maxV = Math.max(rankValue(a.value), rankValue(b.value))
      const r = rankValue(revealed.value)
      const isInside = r > minV && r < maxV
      success = (choice === 'inside' && isInside) || (choice === 'outside' && !isInside)
    }
    return { success, penalty: 3 }
  }

  // suit
  return { success: choice === revealed.suit, penalty: 4 }
}

/** Somme des points (valeur des cartes) obtenus par chaque joueur au prélude */
export function computeTotalsByPlayer(
  playerIds: string[],
  resultsByPlayer: Record<string, PreludeResult[]>
): Record<string, number> {
  const totals: Record<string, number> = {}
  playerIds.forEach(id => {
    const res = resultsByPlayer[id] || []
    totals[id] = res.reduce((acc, r) => acc + valueToPoints(r.card.value), 0)
  })
  return totals
}

export interface ScoreSummary {
  scores: Record<string, number>
  minPlayerId: string
  minScore: number
  maxPlayerId: string
  maxScore: number
}

/** Résumé min/max des scores (premier joueur trouvé gagne les égalités, comme Object.entries) */
export function computeScoreSummary(
  playerIds: string[],
  resultsByPlayer: Record<string, PreludeResult[]>
): ScoreSummary | null {
  const scores = computeTotalsByPlayer(playerIds, resultsByPlayer)
  const entries = Object.entries(scores)
  if (entries.length === 0) return null

  let min = entries[0]
  let max = entries[0]
  for (const e of entries) {
    if (e[1] < min[1]) min = e
    if (e[1] > max[1]) max = e
  }

  return { scores, minPlayerId: min[0], minScore: min[1], maxPlayerId: max[0], maxScore: max[1] }
}

// ── Pyramide du mode classique (exclut les cartes mémorisées) ──────────────

/**
 * Construit la pyramide du mode classique à partir du deck complet, en
 * excluant, valeur par valeur, autant de cartes que les joueurs en ont
 * mémorisé (pas les objets exacts : la valeur — cf. comportement d'origine).
 */
export function buildClassicPyramid(
  fullDeck: Card[],
  selectedCards: Card[],
  pyramidHeight: number,
  rng: () => number = Math.random
): Card[][] {
  const cardCounts: Record<Value, number> = {
    'A': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0,
    '8': 0, '9': 0, '10': 0, 'J': 0, 'Q': 0, 'K': 0
  }
  selectedCards.forEach(card => { cardCounts[card.value]++ })

  const shuffled = shuffleDeck(fullDeck, rng)

  const pyramidCards: Card[][] = []
  let cardIndex = 0

  for (let row = 0; row < pyramidHeight; row++) {
    const rowCards: Card[] = []

    for (let col = 0; col <= row; col++) {
      let validCard: Card | null = null

      while (cardIndex < shuffled.length && !validCard) {
        const current = shuffled[cardIndex]
        if (cardCounts[current.value] <= 0) {
          validCard = { ...current, position: { row, col }, faceUp: false }
          cardIndex++
        } else {
          cardCounts[current.value]--
          cardIndex++
        }
      }

      if (validCard) {
        rowCards.push(validCard)
      } else {
        console.error('Plus de cartes disponibles pour la pyramide!')
        rowCards.push({ suit: 'hearts', value: 'A', faceUp: false, position: { row, col } })
      }
    }

    pyramidCards.push(rowCards)
  }

  return pyramidCards
}
