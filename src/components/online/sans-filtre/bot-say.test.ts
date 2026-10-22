import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { SF_SPEECH_KINDS } from '@/lib/sans-filtre/engine'
import { describeSpeechCatalogue, speechCatalogueOf } from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles de Sans Filtre (games.sans-filtre.game), dans les 4
 * langues : les exigences communes aux jeux à paroles (catalogue-spec.ts), en
 * version Sans alcool — le jeu tourne aussi en ambiance sage —, puis les
 * accords propres à Sans Filtre.
 */

const NODE = 'games.sans-filtre.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: SF_SPEECH_KINDS,
  traitKinds: ['pitch', 'robbed'],
  personaKind: 'pitch',
  sober: true,
})

describe('catalogue de Sans Filtre : accords', () => {
  it('« celle-là m’a achevée » : le participe suit le genre du juge bot, en français et en italien', () => {
    const render = (locale: string, speaker: string) =>
      String(
        new IntlMessageFormat(speechCatalogueOf(NODE, locale).botSay.crown, locale).format({
          name: 'Riqui',
          speaker,
          target: 'other',
        })
      )
    expect(render('fr', 'f')).toContain('achevée')
    expect(render('fr', 'm')).toContain('achevé,')
    expect(render('it', 'f')).toContain('stesa')
    expect(render('it', 'm')).toContain('steso')
  })
})
