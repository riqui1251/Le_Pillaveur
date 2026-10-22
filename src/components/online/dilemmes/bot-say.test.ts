import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { DIL_SPEECH_KINDS } from '@/lib/dilemmes/engine'
import { describeSpeechCatalogue, speechCatalogueOf } from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles de Dilemmes (games.dilemmes.game), dans les 4
 * langues : les exigences communes aux jeux à paroles (catalogue-spec.ts), en
 * version Sans alcool — le brise-glace se joue aussi en ambiance sage, et la
 * consigne « la minorité boit » reste celle de l'écran, jamais celle d'un
 * bot —, puis les accords propres à Dilemmes.
 */

const NODE = 'games.dilemmes.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: DIL_SPEECH_KINDS,
  traitKinds: ['outvoted', 'teaseMinority'],
  personaKind: 'outvoted',
  drinkFree: true,
})

describe('catalogue de Dilemmes : accords', () => {
  it('« je ne suis pas fière » : l’adjectif suit le genre du bot, en français, espagnol et italien', () => {
    const render = (locale: string, speaker: string) =>
      String(
        new IntlMessageFormat(speechCatalogueOf(NODE, locale).botSay.tough_3, locale).format({
          name: 'Riqui',
          speaker,
          target: 'other',
        })
      )
    expect(render('fr', 'f')).toContain('fière')
    expect(render('fr', 'm')).toContain('fier,')
    expect(render('es', 'f')).toContain('orgullosa')
    expect(render('it', 'm')).toContain('tranquillo')
  })
})
