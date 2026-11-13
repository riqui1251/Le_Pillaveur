import { describe, expect, it } from 'vitest'
import { WORD_CHAR_EM, WORD_LINE_EM, WORD_MIN_PX, balancedLineLength, fitWordFontPx } from './display'

describe('balancedLineLength', () => {
  it('une ligne : toute l’expression', () => {
    expect(balancedLineLength('La tour Eiffel', 1)).toBe(14)
  })

  it('coupe aux espaces au mieux', () => {
    expect(balancedLineLength('La tour Eiffel', 2)).toBe(7)
    expect(balancedLineLength('Le Seigneur des anneaux', 2)).toBe(11)
    expect(balancedLineLength('Girafe', 3)).toBe(6)
  })

  it('espaces en trop ou mot vide', () => {
    expect(balancedLineLength('  Spider-Man  ', 2)).toBe(10)
    expect(balancedLineLength('', 2)).toBe(0)
  })
})

describe('fitWordFontPx', () => {
  const W = 420
  const H = 200

  it('un mot court est plafonné', () => {
    expect(fitWordFontPx('Chat', W, H, 96)).toBe(96)
  })

  it('un mot long rapetisse sans déborder de la largeur', () => {
    const size = fitWordFontPx('Anticonstitutionnellement', W, H, 96)
    expect(size).toBeLessThan(96)
    expect(size * 25 * WORD_CHAR_EM).toBeLessThanOrEqual(W)
  })

  it('une expression passe sur plusieurs lignes plutôt que de rapetisser', () => {
    const twoLines = fitWordFontPx('Le Seigneur des anneaux', W, H, 200)
    expect(twoLines * 11 * WORD_CHAR_EM).toBeLessThanOrEqual(W)
    expect(twoLines * 2 * WORD_LINE_EM).toBeLessThanOrEqual(H + 1)
    expect(twoLines).toBeGreaterThan(Math.floor(W / (23 * WORD_CHAR_EM)))
  })

  it('jamais sous le plancher de lisibilité', () => {
    expect(fitWordFontPx('Anticonstitutionnellement', 40, 20, 96)).toBe(WORD_MIN_PX)
  })
})
