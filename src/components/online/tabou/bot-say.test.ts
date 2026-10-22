import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { TABOU_SPEECH_KINDS } from '@/lib/tabou/engine'
import { getTabouWords } from '@/lib/tabou/data'
import { SPEECH_LOCALES, speechCatalogueOf } from '../bot-speech/catalogue-spec'
import { describeNoSecretWords, describeReactionCatalogue } from '../bot-speech/reaction-catalogue-spec'

/**
 * Catalogue des paroles du Tabou (games.tabou.game), dans les 4 langues :
 * les exigences des jeux à réactions (reaction-catalogue-spec.ts), puis les
 * accords propres au Tabou.
 */

const NODE = 'games.tabou.game'

describeReactionCatalogue({ node: NODE, kinds: TABOU_SPEECH_KINDS, traitKinds: ['found', 'jinx'], personaKind: 'jinx' })

describeNoSecretWords(NODE, (locale) => getTabouWords(locale).map((entry) => entry.word))

describe('tabou — accords', () => {
  it('« on t’a entendue » : le participe suit le genre de la cible là où la langue l’accorde', () => {
    const heard = (locale: string, target: string) =>
      String(
        new IntlMessageFormat(speechCatalogueOf(NODE, locale).botSay.buzz_2, locale).format({
          name: 'Suzette',
          speaker: 'other',
          target,
        })
      )
    expect(heard('fr', 'f')).toContain('entendue')
    expect(heard('fr', 'm')).toContain('entendu !')
    expect(heard('it', 'f')).toContain('sentita')
    expect(heard('it', 'm')).toContain('sentito')
    for (const locale of SPEECH_LOCALES) expect(heard(locale, 'other'), locale).toContain('Suzette')
  })
})
