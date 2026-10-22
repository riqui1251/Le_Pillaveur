import { describe, expect, it } from 'vitest'
import { botLine, type LineTranslator } from './bot-speech-feed'
import { ticOverrides } from './tic-overrides'

const CATALOGUE: Record<string, string> = {
  'botSay.cheer': 'Bravo, {name} !',
  'botSay.cheer_2': 'Bien vu, {name} !',
  'botTic.marcel': '…tchin !',
  'botTicSoft.marcel': '…et hop !',
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
  it('ambiance soft : le tic qui trinque cède la place à sa variante sans alcool, et seulement en soft', () => {
    expect(botLine('cheer', MARCEL, RIQUI, ticOverrides(flat, true))).toBe('Bravo, Riqui ! …et hop !')
    expect(botLine('cheer', MARCEL, RIQUI, ticOverrides(flat, false))).toBe('Bravo, Riqui ! …tchin !')
  })

  it('un tic retouché pour le jeu l’est toujours, soft ou pas', () => {
    for (const soft of [true, false]) {
      expect(botLine('cheer', GASTON, RIQUI, ticOverrides(flat, soft))).toBe('Minute, la jeunesse ! Bravo, Riqui !')
    }
  })

  it('un tic sans variante et les phrases passent sans détour', () => {
    const tr = ticOverrides(flat, true)
    expect(botLine('cheer', RAOUL, RIQUI, tr)).toBe('Sans vouloir te vexer, bravo, Riqui !')
    expect(tr.format('botSay.cheer_2', { name: 'Riqui' })).toBe('Bien vu, Riqui !')
  })
})
