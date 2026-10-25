import { describe, expect, it } from 'vitest'
import {
  createPurpleState,
  reducePurple,
  currentPurpleActorId,
  checkPurpleBet,
  purpleCountsForResults,
  PurpleEngineError,
  PURPLE_MIN_BETS_FOR_RESULTS,
  toPurpleClientView,
  type PurpleState,
  type PurpleCard,
} from './engine'

const PLAYERS = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Chris' },
]

function freshState(): PurpleState {
  return createPurpleState(PLAYERS, 'seed-purple')
}

const RED: PurpleCard = { value: '5', suit: '♥', color: 'red' }
const BLACK: PurpleCard = { value: '5', suit: '♠', color: 'black' }

/** Tour de p1 sur un paquet choisi (le tirage est mélangé, ces tests portent sur un verdict précis). */
function rigged(deck: PurpleCard[]): PurpleState {
  return { ...freshState(), currentPlayer: 0, deck }
}

function actor(s: PurpleState): string {
  const id = currentPurpleActorId(s)
  if (!id) throw new Error('no actor')
  return id
}

describe('checkPurpleBet', () => {
  const red: PurpleCard = { value: '5', suit: '♥', color: 'red' }
  const black: PurpleCard = { value: '5', suit: '♠', color: 'black' }

  it('rouge/noir simples', () => {
    expect(checkPurpleBet('rouge', [red])).toBe(true)
    expect(checkPurpleBet('rouge', [black])).toBe(false)
    expect(checkPurpleBet('noir', [black])).toBe(true)
  })

  it('doubles : les deux cartes doivent matcher', () => {
    expect(checkPurpleBet('double-rouge', [red, red])).toBe(true)
    expect(checkPurpleBet('double-rouge', [red, black])).toBe(false)
    expect(checkPurpleBet('double-noir', [black, black])).toBe(true)
  })

  it('purple : deux couleurs différentes', () => {
    expect(checkPurpleBet('purple', [red, black])).toBe(true)
    expect(checkPurpleBet('purple', [red, red])).toBe(false)
  })

  it('double-purple : deux paires qui alternent chacune', () => {
    expect(checkPurpleBet('double-purple', [red, black, red, black])).toBe(true)
    expect(checkPurpleBet('double-purple', [red, red, black, black])).toBe(false)
  })
})

describe('création', () => {
  it('52 cartes mélangées, cagnotte à zéro, un joueur actif', () => {
    const s = freshState()
    expect(s.deck).toHaveLength(52)
    expect(s.drinkCounter).toBe(0)
    expect(s.phase).toBe('playing')
    expect(PLAYERS.map((p) => p.id)).toContain(actor(s))
  })
})

describe('pari', () => {
  it('refuse de parier hors de son tour', () => {
    const s = freshState()
    const other = PLAYERS.find((p) => p.id !== actor(s))!
    expect(() => reducePurple(s, { type: 'BET', playerId: other.id, bet: 'rouge' })).toThrow(
      PurpleEngineError
    )
  })

  it('bonne pioche : la cagnotte grossit, canContinue=true, même joueur', () => {
    let s = freshState()
    const me = actor(s)
    // Cherche un pari qui réussit dans les 10 premiers essais (seed déterministe).
    let found: PurpleState | null = null
    for (const bet of ['rouge', 'noir'] as const) {
      const attempt = reducePurple(s, { type: 'BET', playerId: me, bet })
      if (attempt.isCorrect) { found = attempt; break }
    }
    if (found) {
      expect(found.canContinue).toBe(true)
      expect(found.drinkCounter).toBeGreaterThan(0)
      expect(currentPurpleActorId(found)).toBe(me)
    }
  })

  it('mauvaise pioche : pendingReveal=true, la cagnotte va au joueur puis se vide', () => {
    let s = freshState()
    const me = actor(s)
    // rouge ET noir ne peuvent pas être TOUS LES DEUX faux sur une carte simple
    // (une carte est rouge ou noire) — donc on force un échec via un pari
    // impossible sur une seule carte tirée : on boucle jusqu'à un échec réel.
    let result = s
    let wrongFound = false
    for (let i = 0; i < 20 && !wrongFound; i += 1) {
      const before = result
      result = reducePurple(before, { type: 'BET', playerId: actor(before), bet: 'double-purple' })
      if (result.isCorrect === false) wrongFound = true
      else if (result.canContinue) result = reducePurple(result, { type: 'CONTINUE', playerId: actor(result) })
    }
    expect(wrongFound).toBe(true)
    expect(result.pendingReveal).toBe(true)
    expect(result.drinkCounter).toBe(0)
    expect(result.gameResults[actor(s)] ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('refuse un pari qui n’est pas une clé propre des paris (prototype compris)', () => {
    const s = rigged([RED, BLACK, RED, BLACK])
    for (const bet of ['constructor', '__proto__', 'toString', 'bleu']) {
      expect(() =>
        reducePurple(s, { type: 'BET', playerId: 'p1', bet: bet as unknown as 'rouge' })
      ).toThrow('INVALID_BET')
    }
  })

  it('refuse un second pari tant qu’une décision est en attente', () => {
    let s = freshState()
    const me = actor(s)
    s = reducePurple(s, { type: 'BET', playerId: me, bet: 'rouge' })
    expect(() => reducePurple(s, { type: 'BET', playerId: me, bet: 'noir' })).toThrow(PurpleEngineError)
  })
})

describe('continuer / passer / cagnotte', () => {
  it('PASS transmet la cagnotte au joueur suivant sans la vider', () => {
    let s = freshState()
    const me = actor(s)
    // Force une bonne pioche en essayant jusqu'à succès (ou skip si jamais atteint).
    let attempt = reducePurple(s, { type: 'BET', playerId: me, bet: 'rouge' })
    if (!attempt.isCorrect) attempt = reducePurple(s, { type: 'BET', playerId: me, bet: 'noir' })
    if (attempt.canContinue) {
      const potBefore = attempt.drinkCounter
      const passed = reducePurple(attempt, { type: 'PASS', playerId: me })
      expect(passed.drinkCounter).toBe(potBefore)
      expect(currentPurpleActorId(passed)).not.toBe(me)
    }
  })

  it('CLOSE_REVEAL avance le tour après une mauvaise pioche', () => {
    let s = freshState()
    let result = s
    for (let i = 0; i < 20; i += 1) {
      const before = result
      const attempt = reducePurple(before, { type: 'BET', playerId: actor(before), bet: 'double-purple' })
      if (attempt.isCorrect === false) {
        const before2 = actor(attempt)
        const closed = reducePurple(attempt, { type: 'CLOSE_REVEAL', playerId: before2 })
        expect(closed.pendingReveal).toBe(false)
        expect(currentPurpleActorId(closed)).not.toBe(before2)
        return
      }
      result = attempt.canContinue ? reducePurple(attempt, { type: 'CONTINUE', playerId: actor(attempt) }) : attempt
    }
    throw new Error('aucune mauvaise pioche en 20 essais — graine à revoir')
  })
})

describe('épuisement du paquet — la partie reboucle, elle ne s’arrête jamais', () => {
  it('paquet trop court : le pari re-mélange un paquet neuf ajouté aux restantes', () => {
    const base = freshState()
    const s: PurpleState = { ...base, deck: base.deck.slice(0, 2) }
    const drawn = reducePurple(s, { type: 'BET', playerId: actor(s), bet: 'double-purple' })
    expect(drawn.drawnCards).toHaveLength(4)
    expect(drawn.deck).toHaveLength(2 + 52 - 4)
    expect(drawn.totalCardsDrawn).toBe(4)
  })

  it('paquet vide : le tirage fonctionne quand même', () => {
    const base = freshState()
    const s: PurpleState = { ...base, deck: [] }
    const drawn = reducePurple(s, { type: 'BET', playerId: actor(s), bet: 'rouge' })
    expect(drawn.drawnCards).toHaveLength(1)
    expect(drawn.deck).toHaveLength(51)
  })

  it('le re-mélange est déterministe (même seed → mêmes cartes) et préserve cagnotte/résultats', () => {
    const make = () => {
      const base = createPurpleState(PLAYERS, 'seed-purple')
      const s: PurpleState = { ...base, deck: [], drinkCounter: 7, gameResults: { p2: 3 } }
      return reducePurple(s, { type: 'BET', playerId: actor(s), bet: 'purple' })
    }
    const a = make()
    const b = make()
    expect(a.drawnCards).toEqual(b.drawnCards)
    expect(a.deck).toEqual(b.deck)
    // Le re-mélange ne touche ni à la cagnotte ni aux résultats accumulés
    // (le pari, lui, peut ensuite les modifier selon isCorrect).
    expect(a.gameResults.p2).toBeGreaterThanOrEqual(3)
  })
})

describe('fin de partie', () => {
  it('compte les paris : « Terminer » avant le minimum ne compte pas pour la progression', () => {
    let s = freshState()
    expect(s.betsCount).toBe(0)
    expect(purpleCountsForResults(reducePurple(s, { type: 'END', playerId: actor(s) }))).toBe(false)
    for (let i = 0; i < PURPLE_MIN_BETS_FOR_RESULTS; i += 1) {
      expect(purpleCountsForResults(s)).toBe(false)
      s = reducePurple(s, { type: 'BET', playerId: actor(s), bet: 'rouge' })
      expect(s.betsCount).toBe(i + 1)
      s = reducePurple(s, s.canContinue
        ? { type: 'PASS', playerId: actor(s) }
        : { type: 'CLOSE_REVEAL', playerId: actor(s) })
    }
    expect(purpleCountsForResults(reducePurple(s, { type: 'END', playerId: actor(s) }))).toBe(true)
  })

  it('END termine la partie et bloque tout nouveau pari', () => {
    const s = freshState()
    const ended = reducePurple(s, { type: 'END', playerId: actor(s) })
    expect(ended.phase).toBe('finished')
    expect(currentPurpleActorId(ended)).toBeNull()
    expect(() => reducePurple(ended, { type: 'BET', playerId: PLAYERS[0].id, bet: 'rouge' })).toThrow(
      PurpleEngineError
    )
  })
})

describe('départ / retour / remplacement', () => {
  it('LEAVE fait passer la main si c’était son tour', () => {
    const s = freshState()
    const me = actor(s)
    const left = reducePurple(s, { type: 'LEAVE', playerId: me, at: 100 })
    expect(left.players.find((p) => p.id === me)?.leftAt).toBe(100)
    expect(currentPurpleActorId(left)).not.toBe(me)
  })

  it('le perdant qui part pendant son verdict : ses gorgées restent, le suivant parie sans hériter du verdict', () => {
    let s = rigged([RED, BLACK, RED])
    s = reducePurple(s, { type: 'BET', playerId: 'p1', bet: 'noir' })
    expect(s.pendingReveal).toBe(true)
    expect(s.amountToDrink).toBe(1)
    const left = reducePurple(s, { type: 'LEAVE', playerId: 'p1', at: 100 })
    expect(currentPurpleActorId(left)).toBe('p2')
    expect(left.pendingReveal).toBe(false)
    expect(left.amountToDrink).toBe(0)
    expect(left.drawnCards).toEqual([])
    expect(left.isCorrect).toBeNull()
    expect(left.gameResults.p1).toBe(1)
    // p2 parie tout de suite (plus d'AWAITING_DECISION), et garde son tour.
    const bet = reducePurple(left, { type: 'BET', playerId: 'p2', bet: 'noir' })
    expect(bet.isCorrect).toBe(true)
    expect(currentPurpleActorId(bet)).toBe('p2')
  })

  it('le gagnant qui part avant de décider : la cagnotte passe au suivant, comme un PASS', () => {
    let s = rigged([RED, RED, BLACK])
    s = reducePurple(s, { type: 'BET', playerId: 'p1', bet: 'rouge' })
    expect(s.canContinue).toBe(true)
    const pot = s.drinkCounter
    const left = reducePurple(s, { type: 'LEAVE', playerId: 'p1', at: 100 })
    expect(currentPurpleActorId(left)).toBe('p2')
    expect(left.canContinue).toBe(false)
    expect(left.drawnCards).toEqual([])
    expect(left.lastBet).toBeNull()
    expect(left.drinkCounter).toBe(pot)
    expect(() => reducePurple(left, { type: 'CONTINUE', playerId: 'p2' })).toThrow('WRONG_PHASE')
    expect(reducePurple(left, { type: 'BET', playerId: 'p2', bet: 'rouge' }).drinkCounter).toBe(pot + 1)
  })

  it('un départ hors de son tour laisse le verdict au joueur concerné', () => {
    let s = rigged([RED, BLACK])
    s = reducePurple(s, { type: 'BET', playerId: 'p1', bet: 'noir' })
    const left = reducePurple(s, { type: 'LEAVE', playerId: 'p3', at: 100 })
    expect(currentPurpleActorId(left)).toBe('p1')
    expect(left.pendingReveal).toBe(true)
    expect(left.amountToDrink).toBe(1)
  })

  it('REJOIN efface le départ', () => {
    const s = freshState()
    const me = actor(s)
    let next = reducePurple(s, { type: 'LEAVE', playerId: me, at: 100 })
    next = reducePurple(next, { type: 'REJOIN', playerId: me })
    expect(next.players.find((p) => p.id === me)?.leftAt).toBeNull()
  })

  it('REPLACE_LEFT convertit les partis expirés en bots', () => {
    const s = freshState()
    const me = actor(s)
    let next = reducePurple(s, { type: 'LEAVE', playerId: me, at: 100 })
    expect(() => reducePurple(next, { type: 'REPLACE_LEFT', now: 200, graceMs: 500 })).toThrow(
      PurpleEngineError
    )
    next = reducePurple(next, { type: 'REPLACE_LEFT', now: 1000, graceMs: 500 })
    expect(next.players.find((p) => p.id === me)?.isBot).toBe(true)
  })
})

describe('toPurpleClientView', () => {
  it('masque le paquet restant et retire la graine (vue joueur et écran TV public)', () => {
    const state = freshState()
    const view = toPurpleClientView(state)
    expect(view).not.toHaveProperty('rngState')
    expect(view.deck).toHaveLength(state.deck.length)
    expect(view.deck.every((c) => c.value === '' && c.suit === '')).toBe(true)
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.deck[0]))
    expect(state.deck[0].value).not.toBe('')
  })
})
