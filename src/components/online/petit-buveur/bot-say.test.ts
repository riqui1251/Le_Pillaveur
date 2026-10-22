import { describe, expect, it } from 'vitest'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { PB_SPEECH_KINDS } from '@/lib/petit-buveur/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Petit Buveur en ligne (games.petit-buveur.game),
 * dans les 4 langues : les exigences communes aux jeux à paroles
 * (catalogue-spec.ts), l'ambiance Sans alcool — une partie peut se jouer en
 * Soft, sans gorgées : ni mot de boisson ni chiffre (`drinkFree`) —, et ce
 * qui garde une bulle de trahir le plateau : aucune phrase ne lit autre chose
 * que `name`, `speaker` et `target` (ni case, ni gorgées, ni dé à citer).
 */

const NODE = 'games.petit-buveur.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: PB_SPEECH_KINDS,
  traitKinds: ['ouch', 'aim'],
  personaKind: 'aim',
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

describe.each(SPEECH_LOCALES)('petit-buveur/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)

  it('les mêmes clés que le français, tics compris', () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))).sort())
  })

  it('aucune phrase ne cite une case, des gorgées ni un dé : seuls name, speaker et target', () => {
    for (const [key, text] of Object.entries(flat)) {
      if (key.startsWith('botTic.')) continue
      expect([...argNames(parse(text))].filter((arg) => !['name', 'speaker', 'target'].includes(arg)), key).toEqual([])
    }
  })
})
