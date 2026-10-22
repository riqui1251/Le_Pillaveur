import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { PBC_CITING_KINDS, PBC_SPEECH_KINDS, type PbcSpeechKind } from '@/lib/petit-bac/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Petit Bac (games.petit-bac.game), dans les 4
 * langues : les exigences communes aux jeux à paroles (catalogue-spec.ts),
 * la réponse citée — 13 caractères ici, une bulle qui la cite tient en 85 —,
 * l'ambiance Sans alcool, et les tics des personas, copies conformes de
 * ceux du Loup-Garou.
 */

const NODE = 'games.petit-bac.game'
const ANSWER = 'Ornithorynque'

describeSpeechCatalogue({
  node: NODE,
  kinds: PBC_SPEECH_KINDS,
  traitKinds: ['stop', 'contest'],
  personaKind: 'stop',
  extraArgs: { answer: ANSWER },
  maxChars: 70,
  maxCharsWithExtraArgs: 85,
  drinkFree: true,
})

describe.each(SPEECH_LOCALES)('petit-bac/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)
  const kindOf = (key: string) => key.split('.').pop()!.replace(/_\d+$/, '') as PbcSpeechKind

  it('{answer} dans chaque variante de contest et twin (traits compris), dans aucune autre phrase', () => {
    for (const [key, text] of Object.entries(flat)) {
      if (key.startsWith('botTic.')) continue
      const cites = /\{\s*answer\b/.test(text)
      expect(cites, key).toBe(PBC_CITING_KINDS.includes(kindOf(key)))
      if (!cites) continue
      const line = String(new IntlMessageFormat(text, locale).format({ answer: ANSWER, name: 'Léa', speaker: 'other', target: 'other' }))
      expect(line, key).toContain(ANSWER)
    }
  })

  it('les mêmes clés que le français ; les 20 tics sont ceux du Loup-Garou, mot pour mot', () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))).sort())
    expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
  })
})
