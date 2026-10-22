import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { PURPLE_DRINK_SPEECH_KINDS, PURPLE_SPEECH_KINDS } from '@/lib/purple/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Purple (games.purple), dans les 4 langues : les
 * exigences communes aux jeux à paroles (catalogue-spec.ts), puis les règles
 * propres au jeu.
 *
 * Seules les phrases des kinds « boisson » (PURPLE_DRINK_SPEECH_KINDS, que le
 * fil masque à un spectateur « Sans alcool ») parlent de boire. Aucune phrase
 * n'annonce la carte suivante.
 */

const NODE = 'games.purple'

describeSpeechCatalogue({
  node: NODE,
  kinds: PURPLE_SPEECH_KINDS,
  traitKinds: ['panache', 'mock'],
  personaKind: 'panache',
  maxChars: 70,
})

const DRINK: Record<string, RegExp> = {
  fr: /gorg[ée]|\bboi[rst]|\bbu\b|\bbuv|verre|cul sec|sant[ée]|tchin|trinqu|ap[ée]ro/i,
  en: /\bdrinks?\b|\bdrank|\bsips?\b|\bshots?\b|cheers|booze|\bpints?\b|\bglass/i,
  es: /\bbeb[eiao]|trago|sorbo|chupito|\bsalud\b|\bcopas?\b|\bvasos?\b|brind/i,
  it: /\bber[ei]\b|\bbev[eio]|sors[oi]|bicchier|cin cin|\bsalute\b|brind/i,
}
const NEXT_CARD: Record<string, RegExp> = {
  fr: /prochaine carte|carte suivante|la suivante|sera rouge|sera noire/i,
  en: /next card|next one will|will be red|will be black/i,
  es: /próxima carta|siguiente carta|será roja|será negra/i,
  it: /prossima carta|carta successiva|sarà rossa|sarà nera/i,
}
const GENRES = ['f', 'm', 'other'] as const
const DRINK_KINDS: readonly string[] = PURPLE_DRINK_SPEECH_KINDS

describe.each(SPEECH_LOCALES)('purple/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)
  const sayKeys = Object.keys(flat).filter((key) => !key.startsWith('botTic.'))
  const kindOf = (key: string) => key.split('.').pop()!.replace(/_\d+$/, '')

  it('les mêmes clés que le français, tics compris', () => {
    const fr = flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))
    expect(Object.keys(flat).sort()).toEqual(Object.keys(fr).sort())
  })

  it('aucune carte annoncée ; la boisson seulement dans les kinds masqués en « Sans alcool »', () => {
    for (const key of sayKeys) {
      const format = new IntlMessageFormat(flat[key], locale)
      for (const genre of GENRES) {
        const line = String(format.format({ name: 'Mauricette', speaker: genre, target: genre }))
        expect(line, `${key} : ${line}`).not.toMatch(NEXT_CARD[locale])
        if (!DRINK_KINDS.includes(kindOf(key))) expect(line, `${key} : ${line}`).not.toMatch(DRINK[locale])
      }
    }
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot', () => {
    expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
  })
})
