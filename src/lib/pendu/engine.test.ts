import { describe, expect, it } from 'vitest'
import { parseLocalGameSave } from '@/lib/game-session'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  advancePenduGame,
  applyPenduHint,
  availableDifficulties,
  createPenduGame,
  DIFFICULTY_CONFIG,
  drawPenduWord,
  evaluatePenduRound,
  expirePenduTimer,
  guessPenduLetter,
  PENDU_ALPHABET,
  PENDU_CATEGORIES,
  PENDU_SAVE_VERSION,
  penduDisplayWord,
  penduErrorCount,
  penduHangmanStage,
  penduRoundDrinks,
  penduUnreachableLetters,
  penduWinner,
  pickPenduWord,
  restorePenduSave,
  TIMEOUT_MARK,
  toPenduSave,
  WORD_CATEGORIES,
  type PenduDifficulty,
  type PenduState,
} from './engine'

const TABLE = ['alice', 'bob', 'chloe']

/** Suite de tirages imposée (puis 0). */
function sequence(...values: number[]): () => number {
  let i = 0
  return () => (i < values.length ? values[i++] : 0)
}

/** Mot en cours posé à la main pour alice, niveau normal (6 erreurs, ×1,5, +15). */
function withWord(word: string, overrides: Partial<PenduState> = {}): PenduState {
  return {
    ...createPenduGame({ difficulty: 'normal', playerIds: TABLE, random: () => 0 }),
    currentWord: word,
    currentCategory: 'animaux',
    ...overrides,
  }
}

function guessAll(state: PenduState, letters: string): PenduState {
  let s = state
  for (const letter of letters) s = evaluatePenduRound(guessPenduLetter(s, letter)).state
  return s
}

describe('choix du mot', () => {
  it('niveaux accessibles : le sien et les inférieurs', () => {
    expect(availableDifficulties('facile')).toEqual(['facile'])
    expect(availableDifficulties('normal')).toEqual(['facile', 'normal'])
    expect(availableDifficulties('difficile')).toEqual(['facile', 'normal', 'difficile'])
    expect(availableDifficulties('extreme')).toEqual(['facile', 'normal', 'difficile', 'extreme'])
  })

  it('deux tirages : la catégorie (ordre historique), puis le mot', () => {
    expect(PENDU_CATEGORIES).toEqual([
      'animaux', 'objets', 'nourriture', 'lieux', 'metiers', 'sports', 'pays', 'couleurs', 'emotions',
    ])
    // 5,5/9 → index 5, sports ; puis premier mot de la liste facile.
    expect(pickPenduWord('facile', sequence(5.5 / 9, 0))).toEqual({ word: 'FOOT', category: 'sports' })
    // Dernier mot : les listes accessibles sont mises bout à bout (facile puis normal).
    const pays = [...WORD_CATEGORIES.pays.facile, ...WORD_CATEGORIES.pays.normal]
    expect(pickPenduWord('normal', sequence(6.5 / 9, 0.9999))).toEqual({ word: pays[pays.length - 1], category: 'pays' })
  })

  it('un niveau facile ne tire jamais un mot d’un niveau supérieur', () => {
    const rng = createRng('facile')
    for (let i = 0; i < 300; i++) {
      const { word, category } = pickPenduWord('facile', rng.next)
      expect(WORD_CATEGORIES[category].facile).toContain(word)
    }
  })

  it('même graine → même partie', () => {
    const a = createPenduGame({ difficulty: 'extreme', playerIds: TABLE, random: createRng(7).next })
    const b = createPenduGame({ difficulty: 'extreme', playerIds: TABLE, random: createRng(7).next })
    expect(a).toEqual(b)
    expect(a.players).toEqual(TABLE.map((id) => ({ id, score: 0, drinks: 0, wins: 0 })))
    expect(a.round).toBe(1)
    expect(a.currentPlayerIndex).toBe(0)
    expect(a.gameState).toBe('playing')
  })
})

describe('lettres', () => {
  it('lettre juste ou fausse', () => {
    const s = guessPenduLetter(guessPenduLetter(withWord('CHAT'), 'A'), 'Z')
    expect(s.guessedLetters).toEqual(['A'])
    expect(s.wrongLetters).toEqual(['Z'])
    expect(penduDisplayWord(s.currentWord, s.guessedLetters)).toBe('_ _ A _')
  })

  it('doublons ignorés : une lettre déjà jouée ne compte pas deux fois', () => {
    const once = guessPenduLetter(withWord('CHAT'), 'Z')
    expect(guessPenduLetter(once, 'Z')).toBe(once)
    const right = guessPenduLetter(once, 'C')
    expect(guessPenduLetter(right, 'C')).toBe(right)
    expect(penduErrorCount(right)).toBe(1)
  })

  it('aucune lettre hors d’un mot en cours', () => {
    const won = withWord('CHAT', { gameState: 'won' })
    expect(guessPenduLetter(won, 'C')).toBe(won)
  })

  it('aucune normalisation : « E » ne découvre pas « É », le tiret reste caché', () => {
    const s = guessAll(withWord('GELÉE'), 'GEL')
    expect(penduDisplayWord(s.currentWord, s.guessedLetters)).toBe('G E L _ E')
    expect(s.gameState).toBe('playing')
    expect(penduUnreachableLetters('GELÉE')).toEqual(['É'])
    expect(penduUnreachableLetters('LION-DE-MER')).toEqual(['-'])
    expect(penduUnreachableLetters('RANCŒUR')).toEqual(['Œ'])
    expect(penduUnreachableLetters('CHAT')).toEqual([])
    expect(PENDU_ALPHABET).toHaveLength(26)
  })
})

describe('victoire et défaite', () => {
  it('toutes les lettres distinctes trouvées : gagné, bonus du niveau et une victoire', () => {
    const s = guessAll(withWord('BANANE', { currentPlayerIndex: 1 }), 'BANE')
    expect(s.gameState).toBe('won')
    expect(s.players[1]).toEqual({ id: 'bob', score: 15, drinks: 0, wins: 1 })
    expect(s.players[0].score).toBe(0)
    expect(penduRoundDrinks(s)).toBe(0)
  })

  it('verdict rendu une seule fois', () => {
    const won = guessAll(withWord('OIE'), 'OIE')
    expect(evaluatePenduRound(won)).toEqual({ state: won, outcome: null })
  })

  it('pendu au maximum d’erreurs du niveau (normal : 6)', () => {
    let s = guessAll(withWord('CHAT'), 'ZXWVU')
    expect(s.gameState).toBe('playing')
    const last = evaluatePenduRound(guessPenduLetter(s, 'Q'))
    expect(last.outcome).toBe('lost')
    s = last.state
    expect(s.gameState).toBe('lost')
    expect(s.drinksPenaltyApplied).toBe(true)
    // Aucune gorgée tant qu'on ne passe pas au joueur suivant.
    expect(s.players[0].drinks).toBe(0)
  })

  it.each<[PenduDifficulty, number]>([
    ['facile', 2],
    ['normal', 3],
    ['difficile', 4],
    ['extreme', 6],
  ])('gorgées d’un pendu en %s : ⌈multiplicateur × 2⌉ = %i', (difficulty, drinks) => {
    const { maxErrors } = DIFFICULTY_CONFIG[difficulty]
    const letters = 'ZXWVQJKMP'.slice(0, maxErrors)
    const s = guessAll(withWord('CHAT', { difficulty }), letters)
    expect(s.gameState).toBe('lost')
    expect(penduRoundDrinks(s)).toBe(drinks)
  })

  it('le minuteur écoulé n’est pas une erreur, et coûte 3 gorgées à la place du pendu', () => {
    const s = expirePenduTimer(guessAll(withWord('CHAT'), 'ZX'))
    expect(s.gameState).toBe('lost')
    expect(s.wrongLetters).toEqual(['Z', 'X', TIMEOUT_MARK])
    expect(penduErrorCount(s)).toBe(2)
    expect(s.showCompleteHangman).toBe(true)
    expect(penduRoundDrinks(s)).toBe(3)
    // Deux fois écoulé : un seul symbole.
    expect(expirePenduTimer(s).wrongLetters).toBe(s.wrongLetters)
  })
})

describe('indices', () => {
  it('1er : une voyelle manquante, tirée parmi les occurrences', () => {
    // BANANE : voyelles A, A, E → 0,8 × 3 → 2 → E ; 0,5 × 3 → 1 → A
    const hint = applyPenduHint(withWord('BANANE'), 50, sequence(0.8))!
    expect(hint.timeCost).toBe(10)
    expect(hint.state.guessedLetters).toEqual(['E'])
    expect(hint.state.hintsUsed).toBe(1)
    expect(applyPenduHint(withWord('BANANE'), 50, sequence(0.5))!.state.guessedLetters).toEqual(['A'])
  })

  it('2e : la première lettre ; 3e : une « consonne », tiret et accents compris', () => {
    const second = applyPenduHint(withWord('LION-DE-MER', { hintsUsed: 1 }), 50)!
    expect(second.state.guessedLetters).toEqual(['L'])
    // « Consonnes » non trouvées : N, -, D, -, M, R → 0,2 × 6 → 1 → '-'
    const third = applyPenduHint({ ...second.state }, 50, sequence(0.2))!
    expect(third.state.guessedLetters).toEqual(['L', '-'])
    expect(third.state.hintsUsed).toBe(3)
  })

  it('consommé même sans rien révéler', () => {
    const hint = applyPenduHint(withWord('CHAT', { guessedLetters: ['A'] }), 50, () => {
      throw new Error('aucun tirage attendu')
    })!
    expect(hint.state.guessedLetters).toEqual(['A'])
    expect(hint.state.hintsUsed).toBe(1)
  })

  it('refusé à 10 s ou moins, après 3 indices, ou hors d’un mot en cours', () => {
    expect(applyPenduHint(withWord('CHAT'), 10)).toBeNull()
    expect(applyPenduHint(withWord('CHAT'), 11)).not.toBeNull()
    expect(applyPenduHint(withWord('CHAT', { hintsUsed: 3 }), 50)).toBeNull()
    expect(applyPenduHint(withWord('CHAT', { gameState: 'lost' }), 50)).toBeNull()
  })

  it('un indice qui complète le mot le fait gagner', () => {
    const s = guessAll(withWord('OIE'), 'OI')
    const hint = applyPenduHint(s, 50)!
    expect(evaluatePenduRound(hint.state).outcome).toBe('won')
  })
})

describe('joueur suivant et fin de partie', () => {
  it('gorgées attribuées au joueur au tour, puis nouveau mot pour le suivant', () => {
    const lost = expirePenduTimer(withWord('CHAT'))
    const { state, ended } = advancePenduGame(lost, createRng('suivant').next)
    expect(ended).toBe(false)
    expect(state.players[0].drinks).toBe(3)
    expect(state.timeoutDrinksToAdd).toBe(0)
    expect(state.currentPlayerIndex).toBe(1)
    expect(state.round).toBe(1)
    expect(state.gameState).toBe('playing')
    expect(state.guessedLetters).toEqual([])
    expect(state.wrongLetters).toEqual([])
    expect(state.hintsUsed).toBe(0)
    expect(state.showCompleteHangman).toBe(false)
    expect(state).toEqual(
      drawPenduWord({ ...lost, timeoutDrinksToAdd: 0, players: state.players, currentPlayerIndex: 1 }, createRng('suivant').next)
    )
  })

  it('2 joueurs : chacun joue un mot, puis fin sur le dernier joueur', () => {
    let s = createPenduGame({ difficulty: 'normal', playerIds: ['alice', 'bob'], random: createRng(1).next })
    let r = advancePenduGame(s)
    expect(r.ended).toBe(false)
    s = expirePenduTimer(r.state)
    r = advancePenduGame(s)
    expect(r.ended).toBe(true)
    expect(r.state.gameState).toBe('ended')
    expect(r.state.currentPlayerIndex).toBe(1)
    expect(r.state.players[1].drinks).toBe(3)
  })

  it('3 joueurs : 2 tours de table (règle historique : N joueurs → N−1 manches)', () => {
    let s = createPenduGame({ difficulty: 'normal', playerIds: TABLE, random: createRng(2).next })
    let words = 1
    for (;;) {
      const r = advancePenduGame(s, createRng(words).next)
      if (r.ended) break
      s = r.state
      words += 1
    }
    expect(words).toBe(6)
    expect(s.round).toBe(2)
  })

  it('gagnant : le plus de points, le premier de la table à égalité', () => {
    const s = withWord('CHAT', {
      players: [
        { id: 'alice', score: 15, drinks: 0, wins: 1 },
        { id: 'bob', score: 25, drinks: 0, wins: 1 },
        { id: 'chloe', score: 25, drinks: 0, wins: 1 },
      ],
    })
    expect(penduWinner(s)?.id).toBe('bob')
    expect(penduWinner({ players: [] })).toBeNull()
  })
})

describe('dessin', () => {
  it('étape proportionnelle aux erreurs permises, bornée à 1-8', () => {
    expect(penduHangmanStage(0, 6)).toBe(0)
    expect(penduHangmanStage(1, 8)).toBe(1)
    expect(penduHangmanStage(1, 6)).toBe(2)
    expect(penduHangmanStage(3, 6)).toBe(4)
    expect(penduHangmanStage(6, 6)).toBe(8)
    // Le symbole du minuteur compte dans le dessin (comportement historique).
    expect(penduHangmanStage(9, 8)).toBe(8)
  })
})

describe('reprise (useResumableLocalGame)', () => {
  const now = 1_790_000_000_000

  it('aller-retour par l’enveloppe de stockage : partie et minuteur retrouvés', () => {
    const state = guessAll(withWord('CHAT', { currentPlayerIndex: 2, round: 1, hintsUsed: 1 }), 'CZ')
    const raw = JSON.stringify({ version: PENDU_SAVE_VERSION, savedAt: now, state: toPenduSave(state, 37) })
    const save = parseLocalGameSave<unknown>(raw, PENDU_SAVE_VERSION, now)
    const restored = restorePenduSave(save, TABLE)
    expect(restored).toEqual({ state, timeLeft: 37 })
  })

  it('la sauvegarde ne recopie aucun profil : identifiants et compteurs seulement', () => {
    const save = toPenduSave(withWord('CHAT'), 20)
    expect(save.playerIds).toEqual(TABLE)
    expect(Object.keys(save.players[0]).sort()).toEqual(['drinks', 'id', 'score', 'wins'])
  })

  it('un mot fini (gagné ou perdu) se reprend sur sa fenêtre de résultat', () => {
    const lost = expirePenduTimer(withWord('CHAT'))
    expect(restorePenduSave(toPenduSave(lost, 0), TABLE)?.state.timeoutDrinksToAdd).toBe(3)
  })

  it('minuteur ramené dans ses bornes', () => {
    expect(restorePenduSave(toPenduSave(withWord('CHAT'), 999), TABLE)?.timeLeft).toBe(50)
    expect(restorePenduSave(toPenduSave(withWord('CHAT'), -4), TABLE)?.timeLeft).toBe(0)
  })

  it('partie terminée, autre table ou sauvegarde abîmée → null', () => {
    const base = toPenduSave(withWord('CHAT'), 30)
    expect(restorePenduSave({ ...base, gameState: 'ended' }, TABLE)).toBeNull()
    expect(restorePenduSave(base, ['alice', 'bob'])).toBeNull()
    expect(restorePenduSave(null, TABLE)).toBeNull()
    expect(restorePenduSave('texte', TABLE)).toBeNull()
    expect(restorePenduSave({ ...base, difficulty: 'cauchemar' }, TABLE)).toBeNull()
    expect(restorePenduSave({ ...base, currentPlayerIndex: 3 }, TABLE)).toBeNull()
    expect(restorePenduSave({ ...base, players: [] }, TABLE)).toBeNull()
    expect(restorePenduSave({ ...base, guessedLetters: 'A' }, TABLE)).toBeNull()
    expect(restorePenduSave({ ...base, timeLeft: '30' }, TABLE)).toBeNull()
    expect(restorePenduSave({ ...base, currentWord: '' }, TABLE)).toBeNull()
  })
})
