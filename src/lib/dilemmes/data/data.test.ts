import { describe, expect, it } from 'vitest'
import { DIL_CARDS_FR, DIL_DECKS, dilContentFor, type DilContentCard, type DilLang } from './index'

const LANGS = Object.keys(DIL_DECKS) as DilLang[]

/** Clé d'unicité d'une carte (les deux options d'un « Tu préfères »). */
const keyOf = (c: DilContentCard) => (c.kind === 'prefer' ? `${c.a}|${c.b}` : c.text)

describe('contenu Dilemmes', () => {
  for (const lang of LANGS) {
    const deck = DIL_DECKS[lang]

    describe(lang, () => {
      it('suit le paquet français carte pour carte (même genre, même ton à chaque rang)', () => {
        expect(deck.map((c) => `${c.kind}/${c.tone}`)).toEqual(DIL_CARDS_FR.map((c) => `${c.kind}/${c.tone}`))
      })

      it('cartes bien formées et uniques', () => {
        const seen = new Set<string>()
        for (const c of deck) {
          if (c.kind === 'prefer') {
            expect(c.a.trim().length, keyOf(c)).toBeGreaterThan(0)
            expect(c.b.trim().length, keyOf(c)).toBeGreaterThan(0)
            expect(c.a, keyOf(c)).not.toBe(c.b)
          } else {
            // La carte prolonge l'invite de l'interface (« Je n'ai jamais… »,
            // « Qui de la table… ») : minuscule initiale.
            expect(c.text[0], c.text).toBe(c.text[0].toLowerCase())
            if (c.kind === 'who') expect(c.text.trim().endsWith('?'), c.text).toBe(true)
          }
          expect(seen.has(keyOf(c)), `doublon: ${keyOf(c)}`).toBe(false)
          seen.add(keyOf(c))
        }
      })
    })
  }

  it('filtre par ambiance et mode coquin, dans la langue demandée', () => {
    const softEn = dilContentFor('soft', false, 'en')
    expect(softEn).toHaveLength(DIL_DECKS.en.filter((c) => c.tone === 'soft').length)
    expect(dilContentFor('alcool', true, 'it')).toHaveLength(DIL_DECKS.it.length)
    expect(dilContentFor('alcool', false, 'es')).toHaveLength(DIL_DECKS.es.filter((c) => c.tone !== 'coquin').length)
  })

  it('le français par défaut, et pour une langue inconnue', () => {
    const first = (cards: ReturnType<typeof dilContentFor>) => JSON.stringify(cards[0])
    const fr = first(dilContentFor('alcool', true))
    expect(first(dilContentFor('alcool', true, null))).toBe(fr)
    expect(first(dilContentFor('alcool', true, 'de'))).toBe(fr)
    expect(first(dilContentFor('alcool', true, 'en'))).not.toBe(fr)
  })
})
