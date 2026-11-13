import { describe, expect, it } from 'vitest'
import { createVdnNumberFormats, withTypographicMinus } from './format'
import { parseEstimateInput, sanitizeEstimateDraft } from './input'

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const MINUS = '−'

describe('nombres affichés : le signe moins des textes du jeu (« −1 point »)', () => {
  it('Intl écrit un trait d’union : il devient U+2212', () => {
    expect(withTypographicMinus('-4')).toBe(`${MINUS}4`)
    expect(withTypographicMinus('-1,2 M')).toBe(`${MINUS}1,2 M`)
    expect(withTypographicMinus('206')).toBe('206')
  })

  it('scores, estimations et réponses négatifs, dans les 4 langues et les deux formats', () => {
    for (const locale of LOCALES) {
      const formats = createVdnNumberFormats(locale)
      expect(formats.full(-4), locale).toBe(`${MINUS}4`)
      expect(formats.short(-273), locale).toBe(`${MINUS}273`)
      for (const value of [-1, -10, -273.15, -12_345.5, -1_234_567]) {
        for (const shown of [formats.full(value), formats.short(value)]) {
          expect(shown, `${locale} ${value}`).toContain(MINUS)
          expect(shown, `${locale} ${value}`).not.toContain('-')
        }
      }
    }
  })

  it('les nombres positifs ne bougent pas', () => {
    for (const locale of LOCALES) {
      const formats = createVdnNumberFormats(locale)
      expect(formats.full(0), locale).toBe('0')
      expect(formats.full(6), locale).toBe('6')
      expect(formats.full(1959), locale).toBe('1959')
      expect(formats.full(12_345.5), locale).not.toContain(MINUS)
    }
  })

  it('« Corriger mon estimation » relit le nombre affiché, signe moins compris', () => {
    for (const locale of LOCALES) {
      const formats = createVdnNumberFormats(locale)
      for (const value of [-273, -273.15, -12_345.5, 3.5, 1_500_000]) {
        const draft = sanitizeEstimateDraft(formats.full(value))
        expect(parseEstimateInput(draft, formats.decimal), `${locale} ${draft}`).toBe(value)
      }
    }
  })
})
