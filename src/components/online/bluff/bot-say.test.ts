import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { BLUFF_SPEECH_KINDS } from '@/lib/bluff/engine'
import { SPEECH_LOCALES, describeSpeechCatalogue, speechCatalogueOf } from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Grand Bluff (games.bluff.game), dans les 4
 * langues : les exigences communes aux jeux à paroles (catalogue-spec.ts),
 * en version Sans alcool, puis les accords propres au Bluff.
 */

const NODE = 'games.bluff.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: BLUFF_SPEECH_KINDS,
  traitKinds: ['proud', 'fooled'],
  personaKind: 'proud',
  drinkFree: true,
})

describe('catalogue du Grand Bluff : accords', () => {
  it('« tu m’as eue » : le participe suit le genre du bot piégé, en français et en italien', () => {
    const render = (locale: string, speaker: string) =>
      String(
        new IntlMessageFormat(speechCatalogueOf(NODE, locale).botSay.fooled, locale).format({
          name: 'Riqui',
          speaker,
          target: 'other',
        })
      )
    expect(render('fr', 'f')).toContain('tu m’as eue')
    expect(render('fr', 'm')).toContain('tu m’as eu ')
    expect(render('it', 'f')).toContain('fregata')
    expect(render('it', 'm')).toContain('fregato')
  })

  it('un libellé de fil par langue', () => {
    for (const locale of SPEECH_LOCALES) {
      const game = speechCatalogueOf(NODE, locale) as unknown as { feedAria: string }
      expect(game.feedAria.length, locale).toBeGreaterThan(3)
    }
  })
})
