import { describe, expect, it } from 'vitest'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { QUIZ_SPEECH_KINDS } from '@/lib/quiz/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Grand Pillaveur (games.quiz.game), dans les 4
 * langues : les exigences communes aux jeux à paroles (catalogue-spec.ts),
 * l'ambiance Sans alcool (aucune phrase ne parle de boire), et ce qui garde
 * une bulle de trahir la question : aucune phrase ne lit autre chose que
 * `name`, `speaker` et `target` — ni choix, ni bonne réponse à citer.
 */

const NODE = 'games.quiz.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: QUIZ_SPEECH_KINDS,
  traitKinds: ['sure', 'knewIt'],
  personaKind: 'sure',
  maxChars: 70,
  drinkFree: true,
})

/** Les arguments ICU lus par un gabarit, branches de select comprises. */
function argNames(elements: MessageFormatElement[], acc = new Set<string>()): Set<string> {
  for (const el of elements) {
    if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) {
      acc.add(el.value)
    }
    if (el.type === TYPE.select || el.type === TYPE.plural) {
      acc.add(el.value)
      for (const option of Object.values(el.options)) argNames(option.value, acc)
    }
  }
  return acc
}

describe.each(SPEECH_LOCALES)('quiz/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)

  it('les mêmes clés que le français, tics compris', () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))).sort())
  })

  it('aucune phrase ne cite un choix ni un chiffre : seuls name, speaker et target', () => {
    for (const [key, text] of Object.entries(flat)) {
      if (key.startsWith('botTic.')) continue
      expect([...argNames(parse(text))].filter((arg) => !['name', 'speaker', 'target'].includes(arg)), key).toEqual([])
      expect(text, key).not.toMatch(/\d/)
    }
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot', () => {
    expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
  })
})
