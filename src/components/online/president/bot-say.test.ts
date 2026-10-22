import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { PRE_SPEECH_KINDS } from '@/lib/president/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Président (games.president.game), dans les 4
 * langues : les exigences communes aux jeux à paroles (catalogue-spec.ts),
 * puis les règles propres au Président.
 *
 * Jeu joué aussi Sans alcool (drinkFree) : ni mot de boisson ni chiffre —
 * le 2 qui coupe s'écrit en toutes lettres. Aucune phrase ne parle de ce
 * qu'un bot garde en main : pas de « j’ai les deux », pas de « il me
 * reste… ».
 */

const NODE = 'games.president.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: PRE_SPEECH_KINDS,
  traitKinds: ['brag', 'cut'],
  personaKind: 'cut',
  maxChars: 70,
  drinkFree: true,
})

/** Ce qu'une parole dirait d'une main : « il me reste », « j’ai encore », « dans ma main »… */
const HAND_CLAIM: Record<string, RegExp> = {
  fr: /il me reste|j’ai encore|dans ma main|j’ai les|mes deux|mon jeu/i,
  en: /i still have|i’ve still got|in my hand|i have the|i’ve got the/i,
  es: /me queda|aún tengo|todavía tengo|en mi mano|tengo los/i,
  it: /mi resta|ho ancora|nella mia mano|ho i due/i,
}
const GENRES = ['f', 'm', 'other'] as const

describe.each(SPEECH_LOCALES)('president/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)
  const sayKeys = Object.keys(flat).filter((key) => !key.startsWith('botTic.'))

  it('les mêmes clés que le français, tics compris', () => {
    const fr = flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))
    expect(Object.keys(flat).sort()).toEqual(Object.keys(fr).sort())
  })

  it('aucune main avouée, dans aucune phrase rendue (tics exclus)', () => {
    for (const key of sayKeys) {
      const format = new IntlMessageFormat(flat[key], locale)
      for (const genre of GENRES) {
        const line = String(format.format({ name: 'Mauricette', speaker: genre, target: genre }))
        expect(line, `${key} : ${line}`).not.toMatch(HAND_CLAIM[locale])
      }
    }
  })
})
