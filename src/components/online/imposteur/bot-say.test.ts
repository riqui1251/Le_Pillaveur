import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { IMPOSTEUR_SPEECH_KINDS } from '@/lib/imposteur/engine'
import { BOT_PERSONAS } from '@/lib/online/bot-personas'
import { botLine } from '../bot-speech/bot-speech-feed'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  icuTranslator,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles de L'Imposteur (games.imposteur.game), dans les 4
 * langues : les exigences communes aux jeux à débat (catalogue-spec.ts), avec
 * l'indice cité — 20 caractères ici, une bulle qui le cite tient en 80 —, et
 * les tics des personas, copies conformes de ceux du Loup-Garou.
 */

const CLUE = 'soleil couchant rose'
/** Les kinds dont la bulle cite l'indice de la cible : ceux qui portent sur lui. */
const CLUE_KINDS = ['suspect', 'ally', 'rally']

describeSpeechCatalogue({
  node: 'games.imposteur.game',
  kinds: IMPOSTEUR_SPEECH_KINDS,
  traitKinds: ['defend', 'suspect'],
  extraArgs: { clue: CLUE },
  maxChars: 70,
  maxCharsWithExtraArgs: 80,
})

describe('catalogue de l’Imposteur : l’indice cité et les tics', () => {
  const kindOf = (key: string) => key.split('.').pop()!.replace(/_\d+$/, '')

  it('{clue} dans chaque variante de suspect, ally et rally (traits compris), dans aucune autre phrase', () => {
    for (const locale of SPEECH_LOCALES) {
      const flat = flattenSpeechCatalogue(speechCatalogueOf('games.imposteur.game', locale))
      for (const [key, text] of Object.entries(flat)) {
        if (key.startsWith('botTic.')) continue
        const cites = /\{\s*clue\b/.test(text)
        expect(cites, `${locale}.${key}`).toBe(CLUE_KINDS.includes(kindOf(key)))
        if (!cites) continue
        const line = String(new IntlMessageFormat(text, locale).format({ clue: CLUE, name: 'Léa', speaker: 'other', target: 'other' }))
        expect(line, `${locale}.${key}`).toContain(CLUE)
      }
    }
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot, dans chaque langue', () => {
    for (const locale of SPEECH_LOCALES) {
      expect(speechCatalogueOf('games.imposteur.game', locale).botTic, locale).toEqual(
        speechCatalogueOf('games.loup-garou.game', locale).botTic
      )
    }
  })

  it('une bulle d’accusation de chaque persona cite l’indice et nomme sa cible', () => {
    for (const locale of SPEECH_LOCALES) {
      const tr = icuTranslator(flattenSpeechCatalogue(speechCatalogueOf('games.imposteur.game', locale)), locale)
      for (const persona of BOT_PERSONAS) {
        for (const seed of ['a-0', 'b-1', 'c-2', 'd-3']) {
          const line = botLine('suspect', { name: persona.name, isBot: true }, { name: 'Léa', isBot: false }, tr, {
            seed,
            values: { clue: CLUE },
          })
          expect(line, `${locale}.${persona.name}`).toContain(CLUE)
          expect(line, `${locale}.${persona.name}`).toContain('Léa')
        }
      }
    }
  })
})
