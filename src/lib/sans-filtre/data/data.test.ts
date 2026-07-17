import { describe, expect, it } from 'vitest'
import { SF_BLACKS_FR, SF_WHITES_FR, sfContentFor } from './index'
import { SF_HAND_SIZE, SF_MAX_PLAYERS } from '../engine'

describe('contenu Sans Filtre (fr)', () => {
  it('volumes minimaux pour tenir des soirées entières', () => {
    expect(SF_BLACKS_FR.length).toBeGreaterThanOrEqual(200)
    expect(SF_WHITES_FR.length).toBeGreaterThanOrEqual(350)
  })

  it('cartes noires : exactement un trou ___, format court, uniques', () => {
    const seen = new Set<string>()
    for (const c of SF_BLACKS_FR) {
      expect(c.text.split('___').length - 1, c.text).toBeGreaterThanOrEqual(1)
      expect(c.text.length, c.text).toBeLessThanOrEqual(140)
      expect(['soft', 'apero']).toContain(c.tone)
      expect(seen.has(c.text), `doublon: ${c.text}`).toBe(false)
      seen.add(c.text)
    }
  })

  it('réponses : courtes, sans point final, minuscule initiale, uniques', () => {
    const seen = new Set<string>()
    for (const c of SF_WHITES_FR) {
      expect(c.text.length, c.text).toBeLessThanOrEqual(80)
      expect(c.text.endsWith('.'), c.text).toBe(false)
      expect(c.text[0], c.text).toBe(c.text[0].toLowerCase())
      expect(seen.has(c.text), `doublon: ${c.text}`).toBe(false)
      seen.add(c.text)
    }
  })

  it('le pool Soft reste jouable à table pleine (mains complètes au départ)', () => {
    const soft = sfContentFor('soft')
    expect(soft.blacks.length).toBeGreaterThanOrEqual(100)
    expect(soft.whites.length).toBeGreaterThanOrEqual(SF_MAX_PLAYERS * SF_HAND_SIZE)
    expect(soft.whites.every((w) => !/\b(bière|vin|shot|rhum|apéro|verre)s?\b/i.test(w))).toBe(true)
  })

  it('le pool Apéro contient tout', () => {
    const full = sfContentFor('alcool')
    expect(full.blacks).toHaveLength(SF_BLACKS_FR.length)
    expect(full.whites).toHaveLength(SF_WHITES_FR.length)
  })
})
