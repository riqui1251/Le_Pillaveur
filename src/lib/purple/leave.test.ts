import { describe, expect, it } from 'vitest'
import {
  createPurpleState,
  currentPurpleActorId,
  reducePurple,
  type PurpleCard,
  type PurpleState,
} from './engine'

const PLAYERS = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Chris' },
]
const RED: PurpleCard = { value: '5', suit: '♥', color: 'red' }
const BLACK: PurpleCard = { value: '5', suit: '♠', color: 'black' }

/** Bob au tour, cagnotte de 3, prochaine carte choisie. */
function bobToPlay(next: PurpleCard): PurpleState {
  const base = createPurpleState(PLAYERS, 'seed-leave')
  return { ...base, currentPlayer: 1, drinkCounter: 3, deck: [next, ...base.deck] }
}

describe('Purple — départ du joueur au tour', () => {
  it('parti pendant son verdict : la pénalité reste la sienne, le suivant parie sans rien fermer', () => {
    const lost = reducePurple(bobToPlay(BLACK), { type: 'BET', playerId: 'b', bet: 'rouge' })
    expect(lost.pendingReveal).toBe(true)
    expect(lost.amountToDrink).toBe(4)
    expect(lost.gameResults).toEqual({ b: 4 })

    const left = reducePurple(lost, { type: 'LEAVE', playerId: 'b', at: 100 })

    // Le verdict affiche le joueur COURANT : resté ouvert, il annonçait
    // « Chris doit boire 4 » pour la pioche de Bob.
    expect(currentPurpleActorId(left)).toBe('c')
    expect(left.pendingReveal).toBe(false)
    expect(left.amountToDrink).toBe(0)
    expect(left.drawnCards).toEqual([])
    expect(left.lastBet).toBeNull()
    expect(left.isCorrect).toBeNull()
    expect(left.gameResults).toEqual({ b: 4 })

    // Chris joue son tour : il n'a pas à fermer le verdict d'un autre, ce qui
    // lui faisait en plus sauter son tour.
    const bet = reducePurple(left, { type: 'BET', playerId: 'c', bet: 'rouge' })
    expect(bet.drawnCards).toHaveLength(1)
    expect(currentPurpleActorId(bet)).toBe('c')
  })

  it('parti après une bonne pioche : la cagnotte suit, le suivant ne décide pas à sa place', () => {
    const won = reducePurple(bobToPlay(RED), { type: 'BET', playerId: 'b', bet: 'rouge' })
    expect(won.canContinue).toBe(true)
    expect(won.drinkCounter).toBe(4)

    const left = reducePurple(won, { type: 'LEAVE', playerId: 'b', at: 100 })

    expect(currentPurpleActorId(left)).toBe('c')
    expect(left.canContinue).toBe(false)
    expect(left.drawnCards).toEqual([])
    expect(left.lastBet).toBeNull()
    expect(left.isCorrect).toBeNull()
    expect(left.drinkCounter).toBe(4)
    expect(left.gameResults).toEqual({})
    expect(() => reducePurple(left, { type: 'BET', playerId: 'c', bet: 'noir' })).not.toThrow()
  })

  it('le départ d’un autre joueur ne touche pas au verdict en cours', () => {
    const lost = reducePurple(bobToPlay(BLACK), { type: 'BET', playerId: 'b', bet: 'rouge' })
    const left = reducePurple(lost, { type: 'LEAVE', playerId: 'a', at: 100 })

    expect(currentPurpleActorId(left)).toBe('b')
    expect(left.pendingReveal).toBe(true)
    expect(left.amountToDrink).toBe(4)
    expect(left.drawnCards).toEqual(lost.drawnCards)
  })

  it('dernier présent parti pendant son verdict : rien ne bouge, il le retrouve à son retour', () => {
    let s = reducePurple(bobToPlay(BLACK), { type: 'BET', playerId: 'b', bet: 'rouge' })
    s = reducePurple(s, { type: 'LEAVE', playerId: 'a', at: 100 })
    s = reducePurple(s, { type: 'LEAVE', playerId: 'c', at: 100 })
    s = reducePurple(s, { type: 'LEAVE', playerId: 'b', at: 100 })

    expect(currentPurpleActorId(s)).toBe('b')
    expect(s.pendingReveal).toBe(true)

    s = reducePurple(s, { type: 'REJOIN', playerId: 'b' })
    expect(() => reducePurple(s, { type: 'CLOSE_REVEAL', playerId: 'b' })).not.toThrow()
  })
})
