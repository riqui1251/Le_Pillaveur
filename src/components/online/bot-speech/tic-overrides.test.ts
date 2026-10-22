import { describe, expect, it } from 'vitest'
import { ambianceLineTranslator, botLine, type LineTranslator } from './bot-speech-feed'
import { ticOverrides } from './tic-overrides'

const CATALOGUE: Record<string, string> = {
  'botSay.cheer': 'Bravo, {name} !',
  'botSay.cheer_2': 'Bien vu, {name} !',
  'botTic.marcel': '…tchin !',
  'botTic.gaston': 'Minute, papillon !',
  'botTicAlt.gaston': 'Minute, la jeunesse !',
  'botTic.raoul': 'Sans vouloir te vexer,',
}
const flat: LineTranslator = {
  has: (key) => key in CATALOGUE,
  format: (key, values) => CATALOGUE[key].replace('{name}', values?.name ?? ''),
}
const MARCEL = { name: 'Marcel', isBot: true }
const GASTON = { name: 'Gaston', isBot: true }
const RAOUL = { name: 'Raoul', isBot: true }
const RIQUI = { name: 'Riqui', isBot: false }

describe('ticOverrides', () => {
  it('un tic retouché pour le jeu l’est toujours, soft ou pas', () => {
    for (const soft of [true, false]) {
      const tr = ambianceLineTranslator(ticOverrides(flat), soft)
      expect(botLine('cheer', GASTON, RIQUI, tr)).toBe('Minute, la jeunesse ! Bravo, Riqui !')
    }
  })

  it('composé avec l’ambiance : le tic qui trinque se tait en Sans alcool, et seulement là', () => {
    expect(botLine('cheer', MARCEL, RIQUI, ambianceLineTranslator(ticOverrides(flat), true))).toBe('Bravo, Riqui !')
    expect(botLine('cheer', MARCEL, RIQUI, ambianceLineTranslator(ticOverrides(flat), false))).toBe(
      'Bravo, Riqui ! …tchin !'
    )
  })

  it('un tic sans variante et les phrases passent sans détour', () => {
    const tr = ticOverrides(flat)
    expect(botLine('cheer', RAOUL, RIQUI, tr)).toBe('Sans vouloir te vexer, bravo, Riqui !')
    expect(tr.format('botSay.cheer_2', { name: 'Riqui' })).toBe('Bien vu, Riqui !')
  })
})
