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
 * Aucun mot de boisson : le fil est le même sur les téléphones et la TV,
 * dont l'ambiance (« Sans alcool » ou non) peut différer — une phrase ne doit
 * jamais en dépendre. Aucune phrase ne parle de ce qu'un bot garde en main :
 * pas de « j’ai les deux », pas de « il me reste… ».
 */

const NODE = 'games.president.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: PRE_SPEECH_KINDS,
  traitKinds: ['brag', 'cut'],
  personaKind: 'cut',
  maxChars: 70,
})

const DRINK: Record<string, RegExp> = {
  fr: /gorg[ée]|\bboi[rst]|\bbu\b|\bbuv|verre|cul sec|sant[ée]|tchin|trinqu|ap[ée]ro/i,
  en: /\bdrinks?\b|\bdrank|\bsips?\b|\bshots?\b|cheers|booze|\bpints?\b|\bglass/i,
  es: /\bbeb[eiao]|trago|sorbo|chupito|\bsalud\b|\bcopas?\b|\bvasos?\b|brind/i,
  it: /\bber[ei]\b|\bbev[eio]|sors[oi]|bicchier|cin cin|\bsalute\b|brind/i,
}
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

  it('ni mot de boisson, ni main avouée, dans aucune phrase rendue (tics exclus)', () => {
    for (const key of sayKeys) {
      const format = new IntlMessageFormat(flat[key], locale)
      for (const genre of GENRES) {
        const line = String(format.format({ name: 'Mauricette', speaker: genre, target: genre }))
        expect(line, `${key} : ${line}`).not.toMatch(DRINK[locale])
        expect(line, `${key} : ${line}`).not.toMatch(HAND_CLAIM[locale])
      }
    }
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot', () => {
    expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
  })
})
