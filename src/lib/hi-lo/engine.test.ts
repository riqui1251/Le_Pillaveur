import { describe, expect, it } from 'vitest'
import { isSameLocalTable, parseLocalGameSave } from '@/lib/game-session'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  acknowledgeHiLoMiss,
  advanceHiLoTurn,
  createDeck,
  currentHiLoPlayerId,
  DECK_SIZE,
  HI_LO_SAVE_VERSION,
  hiLoCardsPlayed,
  hiLoFinalResults,
  isGuessCorrect,
  resolveHiLoGuess,
  restoreHiLoSave,
  shuffleDeck,
  startHiLoGame,
  toHiLoSave,
  traverseeTarget,
  type CardSuit,
  type CardValue,
  type HiLoCard,
  type HiLoGuess,
  type HiLoState,
} from './engine'

const card = (value: CardValue, suit: CardSuit = '♠'): HiLoCard => ({
  value,
  suit,
  color: suit === '♥' || suit === '♦' ? 'red' : 'black',
})

const TABLE = ['alice', 'bob', 'chloe']

/** Partie standard posée à la main : alice au tour, un 7 visible, un paquet choisi. */
function standard(overrides: Partial<HiLoState> = {}): HiLoState {
  return {
    ...startHiLoGame({ mode: 'standard', playerIds: TABLE, random: () => 0 }),
    currentPlayerIndex: 0,
    currentCard: card('7'),
    deck: [card('9', '♥'), card('2', '♣'), card('5', '♦')],
    ...overrides,
  }
}

function traversee(overrides: Partial<HiLoState> = {}): HiLoState {
  return {
    ...startHiLoGame({ mode: 'traversee', playerIds: TABLE }),
    currentCard: card('7'),
    deck: [card('9', '♥'), card('2', '♣'), card('5', '♦')],
    ...overrides,
  }
}

/** Joue un coup complet : tirage, verdict, fenêtre fermée par « Compris », tour suivant. */
function play(state: HiLoState, guess: HiLoGuess, random: () => number = Math.random): HiLoState {
  const outcome = resolveHiLoGuess(state, guess, random)
  if (!outcome) throw new Error('coup refusé')
  let next = outcome.resolved
  if (outcome.missDialog) next = acknowledgeHiLoMiss(next)
  return advanceHiLoTurn(next).state
}

describe('paquet', () => {
  it('52 cartes distinctes, rouges à cœur et carreau', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(DECK_SIZE)
    expect(new Set(deck.map((c) => `${c.value}-${c.suit}`)).size).toBe(52)
    expect(deck.filter((c) => c.color === 'red').every((c) => c.suit === '♥' || c.suit === '♦')).toBe(true)
    expect(deck[0]).toEqual(card('2', '♠'))
    expect(deck[51]).toEqual(card('A', '♣'))
  })

  it('mélange reproductible : même suite aléatoire → même paquet, entrée intacte', () => {
    const deck = createDeck()
    const a = shuffleDeck(deck, createRng('soirée').next)
    const b = shuffleDeck(deck, createRng('soirée').next)
    expect(a).toEqual(b)
    expect(a).not.toEqual(deck)
    expect(deck).toEqual(createDeck())
    expect([...a].sort((x, y) => `${x.value}${x.suit}`.localeCompare(`${y.value}${y.suit}`))).toEqual(
      [...deck].sort((x, y) => `${x.value}${x.suit}`.localeCompare(`${y.value}${y.suit}`))
    )
  })

  it('Fisher-Yates historique : un tirage par carte sauf la dernière (51)', () => {
    let calls = 0
    shuffleDeck(createDeck(), () => {
      calls += 1
      return 0.5
    })
    expect(calls).toBe(51)
  })
})

describe('comparaison', () => {
  it('plus haut / plus bas selon la valeur, As fort', () => {
    expect(isGuessCorrect('higher', card('7'), card('8'))).toBe(true)
    expect(isGuessCorrect('higher', card('7'), card('6'))).toBe(false)
    expect(isGuessCorrect('lower', card('7'), card('6'))).toBe(true)
    expect(isGuessCorrect('higher', card('R'), card('A'))).toBe(true)
    expect(isGuessCorrect('lower', card('A'), card('2'))).toBe(true)
    expect(isGuessCorrect('higher', card('10'), card('V'))).toBe(true)
  })

  it('égalité : ne se gagne qu’en l’annonçant, la couleur ne compte pas', () => {
    expect(isGuessCorrect('equal', card('7', '♠'), card('7', '♥'))).toBe(true)
    expect(isGuessCorrect('higher', card('7', '♠'), card('7', '♥'))).toBe(false)
    expect(isGuessCorrect('lower', card('7', '♠'), card('7', '♥'))).toBe(false)
    expect(isGuessCorrect('equal', card('7'), card('8'))).toBe(false)
  })

  it('objectif de la traversée : 5 à deux, +2 par joueur en plus', () => {
    expect(traverseeTarget(2)).toBe(5)
    expect(traverseeTarget(3)).toBe(7)
    expect(traverseeTarget(6)).toBe(13)
    expect(traverseeTarget(1)).toBe(5)
  })
})

describe('début de partie', () => {
  it('standard : mélange (51 tirages) PUIS premier joueur au hasard', () => {
    const draws: number[] = []
    const random = () => {
      const value = draws.length === 51 ? 0.7 : 0.3
      draws.push(value)
      return value
    }
    const state = startHiLoGame({ mode: 'standard', playerIds: TABLE, random })
    expect(draws).toHaveLength(52)
    expect(state.currentPlayerIndex).toBe(Math.floor(0.7 * 3))
    expect(state.deck).toHaveLength(51)
    expect(state.currentCard).not.toBeNull()
    expect(state.drinkCounter).toBe(1)
    expect(state.activePlayerIds).toEqual([])
    expect(hiLoCardsPlayed(state)).toBe(0)
  })

  it('traversée : premier joueur, toute la table en jeu, objectif selon la table', () => {
    const state = startHiLoGame({ mode: 'traversee', playerIds: TABLE, random: createRng('x').next })
    expect(state.currentPlayerIndex).toBe(0)
    expect(state.activePlayerIds).toEqual(TABLE)
    expect(state.targetGuesses).toBe(7)
    expect(state.correctGuessesInRow).toBe(0)
  })

  it('même graine → même partie (paquet, carte visible, premier joueur)', () => {
    const a = startHiLoGame({ mode: 'standard', playerIds: TABLE, random: createRng(42).next })
    const b = startHiLoGame({ mode: 'standard', playerIds: TABLE, random: createRng(42).next })
    expect(a).toEqual(b)
  })
})

describe('mode standard', () => {
  it('bonne réponse : la mise monte de 1, personne ne boit, pas de fenêtre', () => {
    const outcome = resolveHiLoGuess(standard(), 'higher')!
    expect(outcome.drawn.nextCard).toEqual(card('9', '♥'))
    expect(outcome.drawn.isCorrect).toBeNull()
    expect(outcome.resolved.isCorrect).toBe(true)
    expect(outcome.resolved.showResult).toBe(true)
    expect(outcome.resolved.drinkCounter).toBe(2)
    expect(outcome.resolved.gameResults).toEqual({})
    expect(outcome.missDialog).toBe(false)
    expect(outcome.end).toBeNull()
  })

  it('égalité annoncée et juste : +3 à la mise', () => {
    const state = standard({ deck: [card('7', '♦'), card('2')] })
    expect(resolveHiLoGuess(state, 'equal')!.resolved.drinkCounter).toBe(4)
  })

  it('mauvaise réponse : le joueur boit la mise, qui repart à 1 à la fermeture', () => {
    const state = standard({ drinkCounter: 4 })
    const outcome = resolveHiLoGuess(state, 'lower')!
    expect(outcome.resolved.gameResults).toEqual({ alice: 4 })
    expect(outcome.missDialog).toBe(true)
    // Le compteur reste affiché tant que la fenêtre est ouverte…
    expect(outcome.resolved.drinkCounter).toBe(4)
    // …et repart à 1 quand on la ferme.
    expect(acknowledgeHiLoMiss(outcome.resolved).drinkCounter).toBe(1)
  })

  it('égalité non annoncée : c’est une erreur', () => {
    const state = standard({ deck: [card('7', '♥'), card('2')], drinkCounter: 3 })
    const outcome = resolveHiLoGuess(state, 'higher')!
    expect(outcome.resolved.isCorrect).toBe(false)
    expect(outcome.resolved.isUnguessedEqual).toBe(true)
    expect(outcome.resolved.gameResults).toEqual({ alice: 3 })
  })

  it('tour suivant : la carte tirée devient visible, la main passe, gorgées cumulées', () => {
    let state = standard({ drinkCounter: 2 })
    state = play(state, 'higher') // 7 → 9 : juste, mise 3
    expect(currentHiLoPlayerId(state)).toBe('bob')
    expect(state.currentCard).toEqual(card('9', '♥'))
    expect(state.nextCard).toBeNull()
    expect(state.showResult).toBe(false)
    expect(state.drinkCounter).toBe(3)
    state = play(state, 'higher') // 9 → 2 : faux, bob boit 3
    expect(state.gameResults).toEqual({ bob: 3 })
    expect(state.drinkCounter).toBe(1)
    expect(currentHiLoPlayerId(state)).toBe('chloe')
    state = play(state, 'higher') // 2 → 5 : juste
    expect(currentHiLoPlayerId(state)).toBe('alice')
    expect(state.drinkCounter).toBe(2)
  })

  it('fenêtre fermée d’un geste (sans « Compris ») : la mise repart à 1 au tour suivant', () => {
    const outcome = resolveHiLoGuess(standard({ drinkCounter: 5 }), 'lower')!
    const next = advanceHiLoTurn(outcome.resolved, false).state
    expect(next.drinkCounter).toBe(1)
    // Fenêtre encore ouverte : rien n'est remis à zéro ici.
    expect(advanceHiLoTurn(outcome.resolved, true).state.drinkCounter).toBe(5)
  })

  it('refuse de tirer sans carte visible ou après la fin', () => {
    expect(resolveHiLoGuess(standard({ currentCard: null }), 'higher')).toBeNull()
    expect(resolveHiLoGuess(standard({ gameOver: true }), 'higher')).toBeNull()
  })
})

describe('fin de paquet', () => {
  it('dernière carte : sous 2 cartes, un paquet NEUF de 52 est mélangé (l’ancienne est abandonnée)', () => {
    const state = standard({ deck: [card('9', '♥')] })
    const random = createRng('paquet-neuf').next
    const outcome = resolveHiLoGuess(state, 'higher', random)!
    const expected = shuffleDeck(createDeck(), createRng('paquet-neuf').next)
    expect(outcome.drawn.nextCard).toEqual(expected[0])
    expect(outcome.drawn.deck).toEqual(expected.slice(1))
    expect(outcome.drawn.deck).toHaveLength(51)
  })

  it('paquet vide : même chose', () => {
    const outcome = resolveHiLoGuess(standard({ deck: [] }), 'higher', createRng(1).next)!
    expect(outcome.drawn.deck).toHaveLength(51)
    expect(outcome.drawn.nextCard).not.toBeNull()
  })

  it('deux cartes restantes : on tire encore dans l’ancien paquet', () => {
    const outcome = resolveHiLoGuess(standard({ deck: [card('9', '♥'), card('3')] }), 'higher', () => {
      throw new Error('aucun mélange attendu')
    })!
    expect(outcome.drawn.nextCard).toEqual(card('9', '♥'))
    expect(outcome.drawn.deck).toEqual([card('3')])
  })

  it('cinquième tirage de la même carte : fin de partie, le joueur au tour boit la mise', () => {
    const state = standard({
      drinkCounter: 3,
      gameResults: { bob: 2, chloe: 5 },
      deck: [card('9', '♥'), card('2')],
      sameCardCount: { '9-♥': 4 },
    })
    const outcome = resolveHiLoGuess(state, 'higher')!
    expect(outcome.resolved.gameOver).toBe(true)
    expect(outcome.missDialog).toBe(true)
    expect(outcome.resolved.gameResults).toEqual({ bob: 2, chloe: 5, alice: 3 })
    // Lecture d'avant le tirage (comportement historique) : le bilan crédité
    // aux statistiques ignore cette dernière mise.
    expect(outcome.end).toEqual({
      winnerId: 'bob',
      results: [
        { playerId: 'alice', drinks: 0, won: false },
        { playerId: 'bob', drinks: 2, won: true },
        { playerId: 'chloe', drinks: 5, won: false },
      ],
    })
    // Partie finie : plus de tour suivant.
    expect(advanceHiLoTurn(outcome.resolved)).toEqual({ state: outcome.resolved, advanced: false, end: null })
  })

  it('fin sans aucune gorgée bue : le dernier de la table gagne', () => {
    expect(hiLoFinalResults(standard()).winnerId).toBe('chloe')
  })

  it('le gagnant se choisit parmi ceux qui ont bu (premier trouvé à égalité)', () => {
    expect(hiLoFinalResults(standard({ gameResults: { chloe: 2, bob: 2, alice: 4 } })).winnerId).toBe('chloe')
  })
})

describe('mode traversée', () => {
  it('bonne réponse : série +1, mise +1, la main passe', () => {
    const outcome = resolveHiLoGuess(traversee(), 'higher')!
    expect(outcome.resolved.correctGuessesInRow).toBe(1)
    expect(outcome.resolved.drinkCounter).toBe(2)
    const next = advanceHiLoTurn(outcome.resolved).state
    expect(currentHiLoPlayerId(next)).toBe('bob')
  })

  it('erreur : tous les joueurs encore en jeu boivent la mise, la série repart de zéro', () => {
    const state = traversee({ drinkCounter: 3, correctGuessesInRow: 2 })
    const outcome = resolveHiLoGuess(state, 'lower')!
    expect(outcome.resolved.gameResults).toEqual({ alice: 3, bob: 3, chloe: 3 })
    expect(outcome.resolved.correctGuessesInRow).toBe(0)
    expect(outcome.missDialog).toBe(true)
    expect(acknowledgeHiLoMiss(outcome.resolved).drinkCounter).toBe(1)
  })

  it('« égal » réussi : le joueur sort de la partie', () => {
    const state = traversee({ deck: [card('7', '♥'), card('2')] })
    const outcome = resolveHiLoGuess(state, 'equal')!
    expect(outcome.resolved.activePlayerIds).toEqual(['bob', 'chloe'])
    expect(outcome.resolved.drinkCounter).toBe(4)
    // Index historique : (0 + 1) % 2 → chloe, bob est sauté.
    expect(currentHiLoPlayerId(advanceHiLoTurn(outcome.resolved).state)).toBe('chloe')
  })

  it('dernier joueur sorti : fin de partie', () => {
    const state = traversee({
      activePlayerIds: ['chloe'],
      currentPlayerIndex: 0,
      gameResults: { alice: 3, bob: 1 },
      deck: [card('7', '♦'), card('2')],
    })
    const outcome = resolveHiLoGuess(state, 'equal')!
    expect(outcome.resolved.gameOver).toBe(true)
    expect(outcome.end?.winnerId).toBe('bob')
  })

  it('objectif atteint : fin de partie (gagnant lu avant le tirage : le moins de gorgées)', () => {
    const state = traversee({ correctGuessesInRow: 6, currentPlayerIndex: 2, gameResults: { alice: 4, bob: 2 } })
    const outcome = resolveHiLoGuess(state, 'higher')!
    expect(outcome.resolved.correctGuessesInRow).toBe(7)
    expect(outcome.resolved.gameOver).toBe(true)
    expect(outcome.end?.winnerId).toBe('bob')
    // Personne n'a bu : aucun gagnant en traversée.
    const clean = traversee({ correctGuessesInRow: 6 })
    expect(resolveHiLoGuess(clean, 'higher')!.end?.winnerId).toBeNull()
  })

  it('gagnant « objectif atteint » quand la série est déjà au but (état relu)', () => {
    const state = traversee({ correctGuessesInRow: 7, currentPlayerIndex: 1, gameResults: { alice: 1 } })
    expect(hiLoFinalResults(state).winnerId).toBe('bob')
  })

  it('égalité non annoncée : payée comme une erreur, mais la mise n’est pas remise à 1', () => {
    const state = traversee({ deck: [card('7', '♥'), card('2')], drinkCounter: 3, correctGuessesInRow: 2 })
    const outcome = resolveHiLoGuess(state, 'higher')!
    expect(outcome.resolved.isUnguessedEqual).toBe(true)
    expect(outcome.resolved.gameResults).toEqual({ alice: 3, bob: 3, chloe: 3 })
    expect(outcome.resolved.correctGuessesInRow).toBe(0)
    const closed = acknowledgeHiLoMiss(outcome.resolved)
    expect(closed.drinkCounter).toBe(3)
    const next = advanceHiLoTurn(closed).state
    expect(next.drinkCounter).toBe(3)
    expect(next.isUnguessedEqual).toBe(false)
  })

  it('drapeau d’égalité hérité (relance en plein résultat) : tout le monde boit 1, série gardée', () => {
    const restarted = startHiLoGame({ mode: 'traversee', playerIds: TABLE, previous: { isUnguessedEqual: true } })
    const state = { ...restarted, currentCard: card('7'), deck: [card('5'), card('2')], correctGuessesInRow: 2 }
    const outcome = resolveHiLoGuess(state, 'higher')!
    expect(outcome.resolved.gameResults).toEqual({ alice: 1, bob: 1, chloe: 1 })
    expect(outcome.resolved.correctGuessesInRow).toBe(2)
  })

  it('table vide au tour suivant : fin de partie sans avancer', () => {
    const state = traversee({ activePlayerIds: [], showResult: true, nextCard: card('9') })
    const advance = advanceHiLoTurn(state)
    expect(advance.advanced).toBe(false)
    expect(advance.state.gameOver).toBe(true)
    expect(advance.end).not.toBeNull()
    expect(advance.state.currentCard).toEqual(card('7'))
  })
})

describe('partie complète', () => {
  function playWholeGame(seed: string): { state: HiLoState; turns: number } {
    const random = createRng(seed).next
    let state = startHiLoGame({ mode: 'standard', playerIds: TABLE, random })
    let turns = 0
    while (!state.gameOver && turns < 5000) {
      const current = state.currentCard!
      const guess: HiLoGuess = ['2', '3', '4', '5', '6', '7', '8'].includes(current.value) ? 'higher' : 'lower'
      const outcome = resolveHiLoGuess(state, guess, random)!
      state = outcome.resolved
      if (outcome.missDialog) state = acknowledgeHiLoMiss(state)
      if (!state.gameOver) state = advanceHiLoTurn(state).state
      turns += 1
    }
    return { state, turns }
  }

  it('se termine à la 5e carte identique, reproductible à graine égale', () => {
    const a = playWholeGame('partie-complète')
    const b = playWholeGame('partie-complète')
    expect(a.state.gameOver).toBe(true)
    expect(a).toEqual(b)
    expect(Math.max(...Object.values(a.state.sameCardCount))).toBe(5)
    // Au moins 4 paquets entiers joués avant de revoir 5 fois la même carte.
    expect(a.turns).toBeGreaterThanOrEqual(4 * (DECK_SIZE - 1))
  })
})

describe('reprise (useResumableLocalGame)', () => {
  /** Sauvegarde telle que l'écrivait déjà le composant (version 2). */
  const LEGACY_SAVE = {
    gameMode: 'traversee',
    playerIds: ['chloe', 'alice', 'bob'],
    deck: [
      { value: '9', suit: '♥', color: 'red' },
      { value: 'V', suit: '♣', color: 'black' },
    ],
    currentCard: { value: 'D', suit: '♦', color: 'red' },
    currentPlayerIndex: 1,
    drinkCounter: 3,
    gameResults: { alice: 2, bob: 5 },
    sameCardCount: { '9-♠': 1, 'D-♦': 2 },
    activePlayerIds: ['alice', 'bob', 'chloe'],
    correctGuessesInRow: 2,
    targetGuesses: 7,
  }

  it('lit une sauvegarde déjà présente dans un navigateur (même clé, même version)', () => {
    const now = 1_790_000_000_000
    const raw = JSON.stringify({ version: 2, savedAt: now - 60_000, state: LEGACY_SAVE })
    const save = parseLocalGameSave<unknown>(raw, HI_LO_SAVE_VERSION, now)
    expect(save).not.toBeNull()
    const state = restoreHiLoSave(save, TABLE)!
    expect(state).not.toBeNull()
    expect(state.mode).toBe('traversee')
    expect(state.playerIds).toEqual(TABLE)
    expect(state.currentCard).toEqual(card('D', '♦'))
    expect(state.drinkCounter).toBe(3)
    expect(state.correctGuessesInRow).toBe(2)
    expect(currentHiLoPlayerId(state)).toBe('bob')
    // Rien d'une animation en cours n'est repris.
    expect(state.nextCard).toBeNull()
    expect(state.showResult).toBe(false)
    expect(state.isUnguessedEqual).toBe(false)
    expect(state.gameOver).toBe(false)
  })

  it('toHiLoSave écrit exactement la forme historique, relue à l’identique', () => {
    const state = restoreHiLoSave(LEGACY_SAVE, ['chloe', 'alice', 'bob'])!
    const save = toHiLoSave(state)
    expect(Object.keys(save).sort()).toEqual(Object.keys(LEGACY_SAVE).sort())
    expect(JSON.parse(JSON.stringify(save))).toEqual(LEGACY_SAVE)
  })

  it('la partie reprend là où elle s’était arrêtée', () => {
    const state = restoreHiLoSave(LEGACY_SAVE, TABLE)!
    const outcome = resolveHiLoGuess(state, 'lower')! // D → 9 : juste
    expect(outcome.resolved.correctGuessesInRow).toBe(3)
    expect(outcome.resolved.drinkCounter).toBe(4)
  })

  it('le contrôle de table (appelant) refuse une autre soirée', () => {
    expect(isSameLocalTable(LEGACY_SAVE.playerIds, TABLE.map((id) => ({ id })))).toBe(true)
    expect(isSameLocalTable(LEGACY_SAVE.playerIds, [{ id: 'alice' }, { id: 'bob' }])).toBe(false)
  })

  it('ignore un joueur actif qui n’est plus à la table', () => {
    const state = restoreHiLoSave({ ...LEGACY_SAVE, activePlayerIds: ['alice', 'ghost', 'bob'] }, TABLE)!
    expect(state.activePlayerIds).toEqual(['alice', 'bob'])
  })

  it('sauvegarde illisible → null (partie neuve plutôt qu’un plantage)', () => {
    expect(restoreHiLoSave(null, TABLE)).toBeNull()
    expect(restoreHiLoSave('texte', TABLE)).toBeNull()
    expect(restoreHiLoSave({ ...LEGACY_SAVE, gameMode: 'turbo' }, TABLE)).toBeNull()
    expect(restoreHiLoSave({ ...LEGACY_SAVE, deck: [{ value: '1', suit: '♠', color: 'black' }] }, TABLE)).toBeNull()
    expect(restoreHiLoSave({ ...LEGACY_SAVE, deck: undefined }, TABLE)).toBeNull()
    expect(restoreHiLoSave({ ...LEGACY_SAVE, drinkCounter: '3' }, TABLE)).toBeNull()
    expect(restoreHiLoSave({ ...LEGACY_SAVE, gameResults: { alice: 'deux' } }, TABLE)).toBeNull()
    expect(restoreHiLoSave({ ...LEGACY_SAVE, activePlayerIds: undefined }, TABLE)).toBeNull()
  })

  it('carte visible absente (null) reste acceptée', () => {
    expect(restoreHiLoSave({ ...LEGACY_SAVE, currentCard: null }, TABLE)?.currentCard).toBeNull()
  })
})
