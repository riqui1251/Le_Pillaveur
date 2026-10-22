import { describe, expect, it } from 'vitest'
import { countFace, diceTones, playOutcome, type DiceRoll } from './rules'

const ALL_ROLLS: DiceRoll[] = []
for (let dice1 = 1; dice1 <= 6; dice1++) {
  for (let dice2 = 1; dice2 <= 6; dice2++) ALL_ROLLS.push({ dice1, dice2 })
}

/** Conditions d'origine de l'écran (avant l'extraction), recopiées telles quelles. */
function legacy({ dice1, dice2 }: DiceRoll, rollerIsM3: boolean) {
  const sum = dice1 + dice2
  const isDouble = dice1 === dice2
  if (rollerIsM3 && dice1 !== 3 && dice2 !== 3 && sum !== 3 && sum !== 5 && dice1 !== 5 && dice2 !== 5 && sum !== 8 && !isDouble) {
    return { endsGame: true, m3Drinks: false, rollAgain: false }
  }
  const m3Drinks = dice1 === 3 || dice2 === 3 || sum === 3 || sum === 5 || dice1 === 5 || dice2 === 5 || sum === 8
  return { endsGame: false, m3Drinks, rollAgain: m3Drinks || isDouble }
}

describe('playOutcome', () => {
  it('reprend exactement les règles d’origine sur les 36 lancers', () => {
    for (const roll of ALL_ROLLS) {
      for (const rollerIsM3 of [false, true]) {
        const out = playOutcome(roll, rollerIsM3)
        expect({ endsGame: out.endsGame, m3Drinks: out.m3Drinks, rollAgain: out.rollAgain }).toEqual(
          legacy(roll, rollerIsM3)
        )
      }
    }
  })

  it('donne la priorité aux sommes à geste, comme l’ancien message', () => {
    expect(playOutcome({ dice1: 2, dice2: 3 }, false).trigger).toBe('sum5')
    expect(playOutcome({ dice1: 3, dice2: 5 }, false).trigger).toBe('sum8')
    expect(playOutcome({ dice1: 4, dice2: 4 }, false)).toMatchObject({ trigger: 'sum8', double: true })
    expect(playOutcome({ dice1: 3, dice2: 6 }, false).trigger).toBe('three')
    expect(playOutcome({ dice1: 5, dice2: 6 }, false).trigger).toBe('five')
    expect(playOutcome({ dice1: 1, dice2: 2 }, false).trigger).toBe('sum3')
  })

  it('un double sans autre règle fait relancer sans faire boire', () => {
    expect(playOutcome({ dice1: 6, dice2: 6 }, false)).toEqual({
      endsGame: false, m3Drinks: false, trigger: null, double: true, rollAgain: true,
    })
  })

  it('Monsieur 3 qui ne déclenche rien termine la partie ; un autre joueur passe la main', () => {
    expect(playOutcome({ dice1: 4, dice2: 6 }, true).endsGame).toBe(true)
    expect(playOutcome({ dice1: 4, dice2: 6 }, false)).toMatchObject({ endsGame: false, rollAgain: false })
  })
})

describe('countFace', () => {
  it('compte les dés qui montrent la face', () => {
    expect(countFace({ dice1: 3, dice2: 3 }, 3)).toBe(2)
    expect(countFace({ dice1: 3, dice2: 5 }, 5)).toBe(1)
    expect(countFace({ dice1: 1, dice2: 2 }, 3)).toBe(0)
  })
})

describe('diceTones', () => {
  const tones = (dice1: number, dice2: number) => {
    const roll = { dice1, dice2 }
    return diceTones(roll, playOutcome(roll, false))
  }

  it('cercle le seul dé qui fait boire', () => {
    expect(tones(3, 6)).toEqual(['drink', null])
    expect(tones(2, 5)).toEqual([null, 'drink'])
  })

  it('cercle les deux dés pour une somme', () => {
    expect(tones(1, 2)).toEqual(['drink', 'drink'])
    expect(tones(1, 4)).toEqual(['drink', 'drink'])
    expect(tones(2, 6)).toEqual(['drink', 'drink'])
  })

  it('marque un double sans autre règle comme duel', () => {
    expect(tones(6, 6)).toEqual(['duel', 'duel'])
    expect(tones(3, 3)).toEqual(['drink', 'drink'])
  })

  it('ne cercle rien quand rien ne tombe', () => {
    expect(tones(4, 6)).toEqual([null, null])
    const roll = { dice1: 4, dice2: 6 }
    expect(diceTones(roll, playOutcome(roll, true))).toEqual([null, null])
  })
})
