import { describe, expect, it } from 'vitest'
import { mcTileTextClass } from './tile-text'

describe('mcTileTextClass', () => {
  it('grandit les mots courts, réduit les longs', () => {
    expect(mcTileTextClass('chat')).toBe('text-base')
    expect(mcTileTextClass('soleil')).toBe('text-[13px]')
    expect(mcTileTextClass('ordinateur')).toBe('text-xs')
  })

  it('compte les lettres, pas les octets ni les espaces de bord', () => {
    expect(mcTileTextClass('  été  ')).toBe('text-base')
    expect(mcTileTextClass('éléphant')).toBe('text-xs')
  })

  it('la grille de jeu grandit dès sm', () => {
    expect(mcTileTextClass('lune', true)).toBe('text-base sm:text-xl')
    expect(mcTileTextClass('bouteille', true)).toBe('text-xs sm:text-sm')
  })

  it('ne descend jamais sous 12 px', () => {
    for (const word of ['a', 'chat', 'cheval', 'interruttore', 'anticonstitutionnellement']) {
      for (const roomy of [false, true]) {
        expect(mcTileTextClass(word, roomy)).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/)
      }
    }
  })
})
