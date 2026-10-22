import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { CROBARD_SPEECH_KINDS } from '@/lib/crobard/engine'
import { getCrobardWords } from '@/lib/crobard/data'
import { speechCatalogueOf } from '../bot-speech/catalogue-spec'
import { describeNoSecretWords, describeReactionCatalogue } from '../bot-speech/reaction-catalogue-spec'

/**
 * Catalogue des paroles du Crobard (games.crobard.game), dans les 4 langues :
 * les exigences des jeux à réactions (reaction-catalogue-spec.ts), aucune
 * bulle qui contienne un mot de la pioche, et les accords propres au Crobard.
 */

const NODE = 'games.crobard.game'

describeReactionCatalogue({ node: NODE, kinds: CROBARD_SPEECH_KINDS, traitKinds: ['go', 'found'], personaKind: 'go' })

describeNoSecretWords(NODE, (locale) => getCrobardWords(locale))

describe('crobard — accords', () => {
  it('« je suis ravie » : l’adjectif suit le genre de l’orateur là où la langue l’accorde', () => {
    const glad = (locale: string, speaker: string) =>
      String(
        new IntlMessageFormat(speechCatalogueOf(NODE, locale).botSayTrait.suiveur.found_2, locale).format({
          name: 'Riqui',
          speaker,
          target: 'other',
        })
      )
    expect(glad('fr', 'f')).toContain('ravie')
    expect(glad('fr', 'm')).toContain('ravi !')
    expect(glad('es', 'f')).toContain('encantada')
    expect(glad('it', 'm')).toContain('felicissimo')
  })
})
