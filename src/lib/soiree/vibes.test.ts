import { describe, expect, it } from 'vitest'
import { SOIREE_VIBES, defaultVibesForLevel, isSoireeVibe } from './vibes'

describe('defaultVibesForLevel', () => {
  it('Peu : apéro et ça monte ; Moyen : les trois ; Beaucoup : ça monte et grosse soirée', () => {
    expect(defaultVibesForLevel(1)).toEqual(['apero', 'monte'])
    expect(defaultVibesForLevel(2)).toEqual(['apero', 'monte', 'grosse'])
    expect(defaultVibesForLevel(3)).toEqual(['monte', 'grosse'])
  })

  it('garde l’ordre de SOIREE_VIBES et rend une liste neuve à chaque appel', () => {
    for (const level of [1, 2, 3] as const) {
      const list = defaultVibesForLevel(level)
      expect(list).toEqual(SOIREE_VIBES.filter((vibe) => list.includes(vibe)))
      list.push('apero')
      expect(defaultVibesForLevel(level)).toHaveLength(list.length - 1)
    }
  })
})

describe('isSoireeVibe', () => {
  it('reconnaît les trois ambiances et rien d’autre', () => {
    for (const vibe of SOIREE_VIBES) expect(isSoireeVibe(vibe)).toBe(true)
    for (const value of ['Apero', '', null, undefined, 1, ['apero']]) expect(isSoireeVibe(value)).toBe(false)
  })
})
