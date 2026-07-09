import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  buildClassicPyramid,
  computeScoreSummary,
  computeTotalsByPlayer,
  createDeck,
  createPyramid,
  evaluatePreludeChoice,
  findNextCardToFlip,
  rankValue,
  shuffleDeck,
  totalCardsForHeight,
  valueToPoints,
  type Card,
  type PreludeResult,
  type Value,
} from './engine'

const card = (value: Value, suit: Card['suit'] = 'spades'): Card => ({
  suit,
  value,
  faceUp: false,
  position: { row: 0, col: 0 },
})

describe('valueToPoints', () => {
  it('donne 10 points pour A/J/Q/K', () => {
    expect(valueToPoints('A')).toBe(10)
    expect(valueToPoints('J')).toBe(10)
    expect(valueToPoints('Q')).toBe(10)
    expect(valueToPoints('K')).toBe(10)
  })

  it('donne la valeur numérique sinon', () => {
    expect(valueToPoints('2')).toBe(2)
    expect(valueToPoints('10')).toBe(10)
    expect(valueToPoints('7')).toBe(7)
  })
})

describe('rankValue', () => {
  it("place l'As au-dessus du Roi", () => {
    expect(rankValue('A')).toBe(14)
    expect(rankValue('K')).toBe(13)
    expect(rankValue('A')).toBeGreaterThan(rankValue('K'))
  })
})

describe('createDeck', () => {
  it('crée 52 cartes pour 1 paquet', () => {
    const deck = createDeck(1)
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map(c => `${c.value}-${c.suit}`)).size).toBe(52)
  })

  it('crée 104 cartes pour 2 paquets (doublons attendus)', () => {
    const deck = createDeck(2)
    expect(deck).toHaveLength(104)
  })
})

describe('shuffleDeck', () => {
  it('préserve la longueur et le contenu (permutation)', () => {
    const deck = createDeck(1)
    const shuffled = shuffleDeck(deck)
    expect(shuffled).toHaveLength(deck.length)
    expect(shuffled.map(c => `${c.value}-${c.suit}`).sort()).toEqual(
      deck.map(c => `${c.value}-${c.suit}`).sort()
    )
  })

  it('ne mute pas le tableau original', () => {
    const deck = createDeck(1)
    const original = [...deck]
    shuffleDeck(deck)
    expect(deck).toEqual(original)
  })

  it('est déterministe avec un rng injecté', () => {
    const deck = [card('A'), card('2'), card('3'), card('4')]
    const rng = () => 0.42
    const shuffledA = shuffleDeck(deck, rng)
    const shuffledB = shuffleDeck(deck, rng)
    expect(shuffledA.map(c => c.value)).toEqual(shuffledB.map(c => c.value))
  })
})

describe('createPyramid', () => {
  it('construit une pyramide triangulaire correcte', () => {
    const deck = createDeck(1)
    const { pyramidCards, remainingDeck } = createPyramid(deck, 4)
    expect(pyramidCards).toHaveLength(4)
    pyramidCards.forEach((row, i) => expect(row).toHaveLength(i + 1))
    expect(remainingDeck).toHaveLength(52 - (1 + 2 + 3 + 4))
  })

  it('assigne position {row,col} correcte à chaque carte', () => {
    const deck = createDeck(1)
    const { pyramidCards } = createPyramid(deck, 3)
    pyramidCards.forEach((row, r) => {
      row.forEach((c, colIdx) => {
        expect(c.position).toEqual({ row: r, col: colIdx })
        expect(c.faceUp).toBe(false)
      })
    })
  })
})

describe('totalCardsForHeight', () => {
  it('calcule la somme triangulaire', () => {
    expect(totalCardsForHeight(3)).toBe(6)
    expect(totalCardsForHeight(5)).toBe(15)
    expect(totalCardsForHeight(6)).toBe(21)
  })
})

describe('findNextCardToFlip', () => {
  const pyramid: Card[][] = [
    [card('A')],
    [card('2'), card('3')],
    [card('4'), card('5'), card('6')],
  ]

  it('passe à la colonne suivante dans la même rangée', () => {
    expect(findNextCardToFlip(pyramid, 2, 0)).toEqual({ row: 2, col: 1 })
  })

  it('remonte à la rangée du dessus en fin de rangée', () => {
    expect(findNextCardToFlip(pyramid, 2, 2)).toEqual({ row: 1, col: 0 })
    expect(findNextCardToFlip(pyramid, 1, 1)).toEqual({ row: 0, col: 0 })
  })

  it('retourne null une fois la pointe atteinte', () => {
    expect(findNextCardToFlip(pyramid, 0, 0)).toBeNull()
  })
})

describe('evaluatePreludeChoice', () => {
  it('étape couleur : rouge/noir', () => {
    expect(evaluatePreludeChoice('color', 'red', card('5', 'hearts'), [])).toEqual({ success: true, penalty: 1 })
    expect(evaluatePreludeChoice('color', 'red', card('5', 'clubs'), [])).toEqual({ success: false, penalty: 1 })
    expect(evaluatePreludeChoice('color', 'black', card('5', 'spades'), [])).toEqual({ success: true, penalty: 1 })
  })

  it('étape plus haut/plus bas : compare à la première carte révélée', () => {
    const first = card('5')
    expect(evaluatePreludeChoice('higherLower', 'higher', card('9'), [first])).toEqual({ success: true, penalty: 2 })
    expect(evaluatePreludeChoice('higherLower', 'lower', card('2'), [first])).toEqual({ success: true, penalty: 2 })
    expect(evaluatePreludeChoice('higherLower', 'higher', card('2'), [first])).toEqual({ success: false, penalty: 2 })
  })

  it('higher/lower échoue proprement sans carte de référence', () => {
    expect(evaluatePreludeChoice('higherLower', 'higher', card('9'), [])).toEqual({ success: false, penalty: 2 })
  })

  it('étape inside/outside : entre les deux premières cartes', () => {
    const a = card('3')
    const b = card('9')
    expect(evaluatePreludeChoice('insideOutside', 'inside', card('6'), [a, b])).toEqual({ success: true, penalty: 3 })
    expect(evaluatePreludeChoice('insideOutside', 'outside', card('J'), [a, b])).toEqual({ success: true, penalty: 3 })
    expect(evaluatePreludeChoice('insideOutside', 'inside', card('J'), [a, b])).toEqual({ success: false, penalty: 3 })
  })

  it('étape couleur exacte (suit)', () => {
    expect(evaluatePreludeChoice('suit', 'hearts', card('7', 'hearts'), [])).toEqual({ success: true, penalty: 4 })
    expect(evaluatePreludeChoice('suit', 'hearts', card('7', 'clubs'), [])).toEqual({ success: false, penalty: 4 })
  })
})

describe('computeTotalsByPlayer / computeScoreSummary', () => {
  const results: Record<string, PreludeResult[]> = {
    p1: [
      { step: 'color', choice: 'red', card: card('K'), success: true }, // 10 pts
      { step: 'suit', choice: 'hearts', card: card('2'), success: false }, // 2 pts
    ],
    p2: [
      { step: 'color', choice: 'black', card: card('5'), success: true }, // 5 pts
    ],
  }

  it('additionne les points par joueur', () => {
    expect(computeTotalsByPlayer(['p1', 'p2'], results)).toEqual({ p1: 12, p2: 5 })
  })

  it('retourne 0 pour un joueur sans résultat', () => {
    expect(computeTotalsByPlayer(['p3'], results)).toEqual({ p3: 0 })
  })

  it('identifie le min et le max', () => {
    const summary = computeScoreSummary(['p1', 'p2'], results)
    expect(summary).toEqual({
      scores: { p1: 12, p2: 5 },
      minPlayerId: 'p2',
      minScore: 5,
      maxPlayerId: 'p1',
      maxScore: 12,
    })
  })

  it('retourne null sans joueurs', () => {
    expect(computeScoreSummary([], {})).toBeNull()
  })

  it('égalité : le premier joueur de la liste gagne min et max', () => {
    const tied: Record<string, PreludeResult[]> = {
      a: [{ step: 'color', choice: 'red', card: card('5'), success: true }],
      b: [{ step: 'color', choice: 'red', card: card('5'), success: true }],
    }
    const summary = computeScoreSummary(['a', 'b'], tied)
    expect(summary?.minPlayerId).toBe('a')
    expect(summary?.maxPlayerId).toBe('a')
  })
})

describe('buildClassicPyramid', () => {
  afterEach(() => vi.restoreAllMocks())

  it('produit une pyramide de la bonne forme', () => {
    const fullDeck = createDeck(1)
    const selected = [card('K'), card('K')]
    const pyramid = buildClassicPyramid(fullDeck, selected, 4)
    expect(pyramid).toHaveLength(4)
    pyramid.forEach((row, i) => expect(row).toHaveLength(i + 1))
  })

  it('exclut autant de cartes de la valeur sélectionnée que mémorisées, pas plus', () => {
    // Un seul paquet (4 Rois). 2 Rois mémorisés -> il doit rester exactement
    // 2 Rois disponibles pour la pyramide (52 - 2 = 50 cartes restantes, dont 2 Rois).
    const fullDeck = createDeck(1)
    const selected = [card('K', 'hearts'), card('K', 'diamonds')]
    const pyramid = buildClassicPyramid(fullDeck, selected, 6) // 21 cartes
    const flat = pyramid.flat()
    const kingsInPyramid = flat.filter(c => c.value === 'K').length
    expect(kingsInPyramid).toBeLessThanOrEqual(2)
  })

  it('utilise le rng injecté de façon déterministe', () => {
    const fullDeck = createDeck(1)
    const rngA = () => 0.1
    const pyramidA1 = buildClassicPyramid(fullDeck, [], 3, rngA)
    const pyramidA2 = buildClassicPyramid(fullDeck, [], 3, rngA)
    expect(pyramidA1.flat().map(c => `${c.value}-${c.suit}`)).toEqual(
      pyramidA2.flat().map(c => `${c.value}-${c.suit}`)
    )
  })

  it("logue une erreur et pose une carte de secours si le deck est épuisé", () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tinyDeck = [card('2')]
    const pyramid = buildClassicPyramid(tinyDeck, [], 3) // demande 6 cartes, n'en a qu'1
    expect(pyramid.flat()).toHaveLength(6)
    expect(errSpy).toHaveBeenCalled()
  })
})
