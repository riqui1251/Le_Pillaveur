import { describe, expect, it } from 'vitest'
import { DICE_HOLD_MS, caseRevealDelay, petitBuveurTvCues, type TvPetitBuveurState } from './petit-buveur-cues'

const players = [
  { id: 'a', name: 'Alice', position: 3, drinks: 1 },
  { id: 'b', name: 'Bob', position: 0, drinks: 0 },
]

describe('petitBuveurTvCues — partie locale diffusée', () => {
  it("sans lancer ni case, rien à montrer (payload d'avant le premier lancer)", () => {
    const state: TvPetitBuveurState = { players, currentPlayer: 0 }
    expect(petitBuveurTvCues(state)).toEqual({ diceKey: null, dice: null, caseKey: null, caseType: null })
  })

  it('montre le dé et la case du payload, chacun sur sa propre séquence', () => {
    const state: TvPetitBuveurState = {
      players,
      currentPlayer: 0,
      dice: { value: 4, seq: 7 },
      reveal: { caseType: 'bonus', seq: 6 },
    }
    const cues = petitBuveurTvCues(state)
    expect(cues.dice).toBe(4)
    expect(cues.caseType).toBe('bonus')
    expect(cues.diceKey).not.toBeNull()
    expect(cues.caseKey).not.toBeNull()
  })

  it('un nouveau lancer change la clé du dé sans toucher celle de la case', () => {
    const before = petitBuveurTvCues({
      players,
      currentPlayer: 0,
      dice: { value: 4, seq: 1 },
      reveal: { caseType: 'bonus', seq: 1 },
    })
    const after = petitBuveurTvCues({
      players,
      currentPlayer: 1,
      dice: { value: 4, seq: 2 },
      reveal: { caseType: 'bonus', seq: 1 },
    })
    expect(after.diceKey).not.toBe(before.diceKey)
    expect(after.caseKey).toBe(before.caseKey)
  })

  it('ignore un dé hors 1..6 ou une case vide venus du payload', () => {
    const cues = petitBuveurTvCues({
      players,
      currentPlayer: 0,
      dice: { value: 9, seq: 1 },
      reveal: { caseType: '', seq: 1 },
    })
    expect(cues.diceKey).toBeNull()
    expect(cues.caseKey).toBeNull()
  })
})

describe('petitBuveurTvCues — partie en ligne', () => {
  it('le dé et la case suivent la version du moteur', () => {
    const cues = petitBuveurTvCues({
      players,
      currentPlayer: 0,
      version: 5,
      lastDice: 3,
      lastCase: { type: 'malus', effect: 2 } as never,
    })
    expect(cues).toEqual({ diceKey: 'v:5', dice: 3, caseKey: 'v:5', caseType: 'malus' })
  })

  it('sans version, rien ne se déclenche', () => {
    const cues = petitBuveurTvCues({ players, currentPlayer: 0, lastDice: 3 })
    expect(cues.diceKey).toBeNull()
  })
})

describe('caseRevealDelay', () => {
  it('sans dé à l’écran, la case tombe tout de suite', () => {
    expect(caseRevealDelay(null, 1000)).toBe(0)
  })

  it('attend la fin du dé encore affiché', () => {
    expect(caseRevealDelay(1000, 1000)).toBe(DICE_HOLD_MS)
    expect(caseRevealDelay(1000, 1500)).toBe(DICE_HOLD_MS - 500)
    expect(caseRevealDelay(1000, 1000 + DICE_HOLD_MS + 50)).toBe(0)
  })
})
