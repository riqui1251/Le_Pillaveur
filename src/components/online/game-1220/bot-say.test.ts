import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { GAME_1220_DRINK_SPEECH_KINDS, GAME_1220_SPEECH_KINDS } from '@/lib/1220/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du 12-20 (games.1220), dans les 4 langues : les
 * exigences communes aux jeux à paroles (catalogue-spec.ts), puis les règles
 * propres au jeu.
 *
 * Seules les phrases des kinds « boisson » (GAME_1220_DRINK_SPEECH_KINDS, que
 * le fil masque à un spectateur « Sans alcool ») parlent de boire. Aucune
 * phrase ne prédit le lancer suivant.
 */

const NODE = 'games.1220'

describeSpeechCatalogue({
  node: NODE,
  kinds: GAME_1220_SPEECH_KINDS,
  traitKinds: ['jinx', 'mock'],
  personaKind: 'jinx',
  maxChars: 70,
})

const DRINK: Record<string, RegExp> = {
  fr: /gorg[ée]|\bboi[rst]|\bbu\b|\bbuv|verre|cul sec|sant[ée]|tchin|trinqu|ap[ée]ro/i,
  en: /\bdrinks?\b|\bdrank|\bsips?\b|\bshots?\b|cheers|booze|\bpints?\b|\bglass/i,
  es: /\bbeb[eiao]|trago|sorbo|chupito|\bsalud\b|\bcopas?\b|\bvasos?\b|brind/i,
  it: /\bber[ei]\b|\bbev[eio]|sors[oi]|bicchier|cin cin|\bsalute\b|brind/i,
}
const NEXT_ROLL: Record<string, RegExp> = {
  fr: /prochain (lancer|coup) sera|va sortir|sortira|le prochain sera/i,
  en: /next roll will|will come up|is coming up|next one will/i,
  es: /próxima tirada será|va a salir|saldrá/i,
  it: /prossimo lancio sarà|uscirà|sta per uscire/i,
}
const GENRES = ['f', 'm', 'other'] as const
const DRINK_KINDS: readonly string[] = GAME_1220_DRINK_SPEECH_KINDS

describe.each(SPEECH_LOCALES)('1220/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)
  const sayKeys = Object.keys(flat).filter((key) => !key.startsWith('botTic.'))
  const kindOf = (key: string) => key.split('.').pop()!.replace(/_\d+$/, '')

  it('les mêmes clés que le français, tics compris', () => {
    const fr = flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))
    expect(Object.keys(flat).sort()).toEqual(Object.keys(fr).sort())
  })

  it('aucun lancer prédit ; la boisson seulement dans les kinds masqués en « Sans alcool »', () => {
    for (const key of sayKeys) {
      const format = new IntlMessageFormat(flat[key], locale)
      for (const genre of GENRES) {
        const line = String(format.format({ name: 'Mauricette', speaker: genre, target: genre }))
        expect(line, `${key} : ${line}`).not.toMatch(NEXT_ROLL[locale])
        if (!DRINK_KINDS.includes(kindOf(key))) expect(line, `${key} : ${line}`).not.toMatch(DRINK[locale])
      }
    }
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot', () => {
    expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
  })
})
