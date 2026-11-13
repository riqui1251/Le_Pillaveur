import { describe, expect, it } from 'vitest'
import { CAP_KINDS, CAP_LEVELS, CAP_THEMES } from './data/types'
import { CAP_CARDS } from './data/cards'
import { CAP_TEXTS as TEXTS_FR } from './data/fr'
import { CAP_TEXTS as TEXTS_EN } from './data/en'
import { CAP_TEXTS as TEXTS_ES } from './data/es'
import { CAP_TEXTS as TEXTS_IT } from './data/it'
import { CAP_TEXT_LANGS, capAlcoholWords, capStrayTokens, type CapTextLang } from './content-guard'
import { CAP_PRICE_MAX, hasPlayerToken } from './engine'

/** La VRAIE banque (les tests du moteur, eux, tirent dans de petites cartes de test). */
const TEXTS: Record<CapTextLang, Readonly<Record<string, string>>> = {
  fr: TEXTS_FR,
  en: TEXTS_EN,
  es: TEXTS_ES,
  it: TEXTS_IT,
}
const IDS: string[] = CAP_CARDS.map((card) => card.id)
/** Au-delà, le texte déborde la carte à 375 px, au-dessus des boutons « Cap ! » / « Pas cap ». */
const MAX_TEXT_LENGTH = 280

describe('banque de Cap ou Pas Cap : structure', () => {
  it('ids uniques', () => {
    expect(new Set(IDS).size).toBe(IDS.length)
  })

  it('chaque thème × niveau × type a des cartes : la pioche du moment n’est jamais vide', () => {
    const missing: string[] = []
    for (const theme of CAP_THEMES) {
      for (const level of CAP_LEVELS) {
        for (const kind of CAP_KINDS) {
          const count = CAP_CARDS.filter((c) => c.theme === theme && c.level === level && c.kind === kind).length
          if (count === 0) missing.push(`${theme}/${level}/${kind}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('prix entier de 1 à 5', () => {
    const wrong = CAP_CARDS.filter((c) => !Number.isInteger(c.price) || c.price < 1 || c.price > CAP_PRICE_MAX)
    expect(wrong.map((c) => c.id)).toEqual([])
  })
})

describe.each([...CAP_TEXT_LANGS])('banque de Cap ou Pas Cap : textes %s', (lang) => {
  const texts = TEXTS[lang]

  it('un texte par carte, aucun en trop, aucun vide ni trop long', () => {
    expect(Object.keys(texts).sort()).toEqual([...IDS].sort())
    const wrong = IDS.filter((id) => {
      const text = (texts[id] ?? '').trim()
      return text.length === 0 || text.length > MAX_TEXT_LENGTH
    })
    expect(wrong).toEqual([])
  })

  it('aucune carte ne parle d’alcool : seul le prix fait boire', () => {
    const hits = IDS.flatMap((id) => {
      const words = capAlcoholWords(texts[id] ?? '', lang)
      return words.length > 0 ? [`${id} : ${words.join(', ')}`] : []
    })
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('{player} est le seul jeton, sur les mêmes cartes que le français', () => {
    const stray = IDS.flatMap((id) => {
      const tokens = capStrayTokens(texts[id] ?? '')
      return tokens.length > 0 ? [`${id} : ${tokens.join(' ')}`] : []
    })
    expect(stray, stray.join('\n')).toEqual([])
    const mismatched = IDS.filter((id) => hasPlayerToken(texts[id] ?? '') !== hasPlayerToken(TEXTS.fr[id] ?? ''))
    expect(mismatched).toEqual([])
  })
})
