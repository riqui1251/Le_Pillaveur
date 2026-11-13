import { describe, expect, it } from 'vitest'
import { decimalSeparatorFor, parseEstimateInput, sanitizeEstimateDraft } from './input'

describe('saisie d’une estimation', () => {
  it('entiers et décimaux, virgule ou point', () => {
    expect(parseEstimateInput('206')).toBe(206)
    expect(parseEstimateInput('3,5', ',')).toBe(3.5)
    expect(parseEstimateInput('3.5', ',')).toBe(3.5)
    expect(parseEstimateInput(',5', ',')).toBe(0.5)
    expect(parseEstimateInput('12.', '.')).toBe(12)
  })

  it('séparateurs de milliers : espaces (fines comprises), points ou virgules répétés', () => {
    expect(parseEstimateInput('1 500 000', ',')).toBe(1_500_000)
    expect(parseEstimateInput('1\u202f500\u00a0000', ',')).toBe(1_500_000)
    expect(parseEstimateInput('1.000.000', ',')).toBe(1_000_000)
    expect(parseEstimateInput('1,000,000', '.')).toBe(1_000_000)
    expect(parseEstimateInput('1.234,5', ',')).toBe(1234.5)
    expect(parseEstimateInput('1,234.5', '.')).toBe(1234.5)
  })

  it('un seul séparateur suivi de trois chiffres : la langue tranche', () => {
    expect(parseEstimateInput('1.500', ',')).toBe(1500)
    expect(parseEstimateInput('1,500', ',')).toBe(1.5)
    expect(parseEstimateInput('1,500', '.')).toBe(1500)
    expect(parseEstimateInput('3.142', '.')).toBe(3.142)
    expect(parseEstimateInput('0.125', ',')).toBe(0.125)
  })

  it('signe moins, y compris typographique ; \u00ab \u22120 \u00bb devient 0', () => {
    expect(parseEstimateInput('-273', ',')).toBe(-273)
    expect(parseEstimateInput('\u2212273,15', ',')).toBe(-273.15)
    expect(Object.is(parseEstimateInput('-0'), 0)).toBe(true)
  })

  it('refuse ce qui n’est pas un nombre', () => {
    for (const raw of ['', '   ', 'abc', '12a', '-', '.', ',', '1.2.3,4,5', '1,2,3', '--5', '1e5']) {
      expect(parseEstimateInput(raw, ',')).toBeNull()
    }
  })

  it('le champ ne garde que chiffres, séparateurs et un signe en tête', () => {
    expect(sanitizeEstimateDraft('12a3')).toBe('123')
    expect(sanitizeEstimateDraft(' -1 5-00')).toBe('-1 500')
    expect(sanitizeEstimateDraft('7,5 km')).toBe('7,5 ')
    expect(sanitizeEstimateDraft('9'.repeat(40))).toHaveLength(24)
  })

  it('séparateur décimal de la langue', () => {
    expect(decimalSeparatorFor('fr')).toBe(',')
    expect(decimalSeparatorFor('en')).toBe('.')
    expect(decimalSeparatorFor('es')).toBe(',')
    expect(decimalSeparatorFor('it')).toBe(',')
  })
})
