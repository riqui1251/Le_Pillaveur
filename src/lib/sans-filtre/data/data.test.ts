import { describe, expect, it } from 'vitest'
import { SF_BLACKS_FR, SF_DECKS, SF_WHITES_FR, sfContentFor, type SFLang } from './index'
import { SF_HAND_SIZE, SF_MAX_PLAYERS } from '../engine'

/** Mots d'alcool interdits dans les réponses Soft, par langue. */
const ALCOHOL: Record<SFLang, RegExp> = {
  fr: /\b(bière|vin|shot|rhum|apéro|verre)s?\b/i,
  en: /\b(beer|wine|shot|rum|booze|drink|cocktail|vodka|tequila|glass)(e?s)?\b/i,
  es: /\b(cerveza|vino|chupito|ron|copa|cubata|birra|alcohol)s?\b/i,
  it: /\b(birra|birre|vino|vini|shot|rum|aperitiv[oi]|spritz|bicchier[ei]|alcol)\b/i,
}

const LANGS = Object.keys(SF_DECKS) as SFLang[]

describe('contenu Sans Filtre', () => {
  it('volumes minimaux pour tenir des soirées entières', () => {
    expect(SF_BLACKS_FR.length).toBeGreaterThanOrEqual(200)
    expect(SF_WHITES_FR.length).toBeGreaterThanOrEqual(350)
  })

  for (const lang of LANGS) {
    const { blacks, whites } = SF_DECKS[lang]

    describe(lang, () => {
      it('suit le paquet français carte pour carte (même nombre, même ton à chaque rang)', () => {
        expect(blacks.map((c) => c.tone)).toEqual(SF_BLACKS_FR.map((c) => c.tone))
        expect(whites.map((c) => c.tone)).toEqual(SF_WHITES_FR.map((c) => c.tone))
      })

      it('cartes noires : au moins un trou ___, format court, uniques', () => {
        const seen = new Set<string>()
        for (const c of blacks) {
          expect(c.text.split('___').length - 1, c.text).toBeGreaterThanOrEqual(1)
          expect(c.text.length, c.text).toBeLessThanOrEqual(140)
          expect(['soft', 'apero']).toContain(c.tone)
          expect(seen.has(c.text), `doublon: ${c.text}`).toBe(false)
          seen.add(c.text)
        }
      })

      it('réponses : courtes, sans point final, minuscule initiale, uniques', () => {
        const seen = new Set<string>()
        for (const c of whites) {
          expect(c.text.length, c.text).toBeLessThanOrEqual(80)
          expect(c.text.endsWith('.'), c.text).toBe(false)
          expect(c.text[0], c.text).toBe(c.text[0].toLowerCase())
          expect(seen.has(c.text), `doublon: ${c.text}`).toBe(false)
          seen.add(c.text)
        }
      })

      it('le pool Soft reste jouable à table pleine et sans alcool', () => {
        const soft = sfContentFor('soft', lang)
        expect(soft.blacks.length).toBeGreaterThanOrEqual(100)
        expect(soft.whites.length).toBeGreaterThanOrEqual(SF_MAX_PLAYERS * SF_HAND_SIZE)
        expect(soft.whites.filter((w) => ALCOHOL[lang].test(w))).toEqual([])
      })

      it('le pool Apéro contient tout', () => {
        const full = sfContentFor('alcool', lang)
        expect(full.blacks).toHaveLength(blacks.length)
        expect(full.whites).toHaveLength(whites.length)
      })
    })
  }

  it('tire les cartes dans la langue demandée, le français par défaut', () => {
    expect(sfContentFor('alcool', 'en').blacks[0]).toBe(SF_DECKS.en.blacks[0].text)
    expect(sfContentFor('alcool').blacks[0]).toBe(SF_BLACKS_FR[0].text)
    expect(sfContentFor('alcool', null).blacks[0]).toBe(SF_BLACKS_FR[0].text)
    expect(sfContentFor('alcool', 'de').blacks[0]).toBe(SF_BLACKS_FR[0].text)
  })
})
