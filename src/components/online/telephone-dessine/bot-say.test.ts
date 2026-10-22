import { describe, expect, it } from 'vitest'
import { TELEPHONE_SPEECH_KINDS } from '@/lib/telephone-dessine/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Téléphone dessiné (games.telephone-dessine.game),
 * dans les 4 langues : les exigences communes aux jeux à paroles
 * (catalogue-spec.ts), l'ambiance Sans alcool, et les tics des personas,
 * copies conformes de ceux du Loup-Garou. Aucune phrase ne cite un maillon :
 * on rit de la chute, on ne la répète pas.
 */

const NODE = 'games.telephone-dessine.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: TELEPHONE_SPEECH_KINDS,
  traitKinds: ['laugh'],
  personaKind: 'laugh',
  maxChars: 70,
  drinkFree: true,
})

describe.each(SPEECH_LOCALES)('telephone-dessine/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)

  it('les mêmes clés que le français ; aucun argument hors name, speaker et target', () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))).sort())
    for (const [key, text] of Object.entries(flat)) {
      const args = [...text.matchAll(/\{\s*(\w+)/g)].map((m) => m[1])
      expect(args.filter((arg) => !['name', 'speaker', 'target'].includes(arg)), key).toEqual([])
    }
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot', () => {
    expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
  })
})
