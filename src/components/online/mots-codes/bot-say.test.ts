import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { MC_SPEECH_KINDS } from '@/lib/mots-codes/engine'
import { speechCatalogueOf } from '../bot-speech/catalogue-spec'
import { describeReactionCatalogue } from '../bot-speech/reaction-catalogue-spec'

/**
 * Catalogue des paroles des Mots Codés (games.mots-codes.game), dans les 4
 * langues : les exigences des jeux à réactions (reaction-catalogue-spec.ts).
 * Pas de contrôle « mot de la pioche » ici : les mots de la grille sont
 * publics, le secret est la grille de CLÉS, que le planificateur ne lit
 * jamais (src/lib/mots-codes/bot-speech.test.ts).
 */

const NODE = 'games.mots-codes.game'

describeReactionCatalogue({ node: NODE, kinds: MC_SPEECH_KINDS, traitKinds: ['nice', 'thanks'], personaKind: 'thanks' })

describe('mots-codes — accords', () => {
  it('« je suis ravie » : l’adjectif suit le genre de l’orateur là où la langue l’accorde', () => {
    const glad = (locale: string, speaker: string) =>
      String(
        new IntlMessageFormat(speechCatalogueOf(NODE, locale).botSayTrait.suiveur.nice_2, locale).format({
          name: 'Riqui',
          speaker,
          target: 'other',
        })
      )
    expect(glad('fr', 'f')).toContain('ravie')
    expect(glad('es', 'm')).toContain('encantado')
    expect(glad('it', 'f')).toContain('felicissima')
  })
})
