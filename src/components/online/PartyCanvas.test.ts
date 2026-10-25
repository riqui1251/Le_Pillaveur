import { describe, expect, it } from 'vitest'
import { drawableStrokes } from './PartyCanvas'

describe('drawableStrokes — rendu défensif des traits reçus', () => {
  it('un trait sans couleur ni épaisseur est peint à l’encre par défaut, sans lever', () => {
    expect(drawableStrokes([{ points: [0, 0, 1, 1] }])).toEqual([
      { points: [0, 0, 1, 1], color: '#24201A', width: 6 },
    ])
  })

  it('écarte les traits inexploitables et les points non finis', () => {
    const raw = [
      null,
      'trait',
      { points: 'nimp', color: '#000', width: 3 },
      { points: [0, 0], color: '#000', width: 3 },
      { points: [0, 0, Number.NaN, 1, '0.5', 0.5, 1, 1], color: '#000', width: 3 },
      { points: [0, 0, 1, 1], color: 42, width: Number.POSITIVE_INFINITY },
    ]
    expect(drawableStrokes(raw)).toEqual([
      { points: [0, 0, 1, 1], color: '#000', width: 3 },
      { points: [0, 0, 1, 1], color: '#24201A', width: 6 },
    ])
  })

  it('borne l’épaisseur et repeint l’ancienne gomme en fond crème', () => {
    expect(drawableStrokes([{ points: [0, 0, 1, 1], color: '#F8FAFC', width: 999 }])).toEqual([
      { points: [0, 0, 1, 1], color: '#F3EAD3', width: 24 },
    ])
  })

  it('une liste absente ou corrompue ne peint rien', () => {
    expect(drawableStrokes(undefined)).toEqual([])
    expect(drawableStrokes({ points: [0, 0, 1, 1] })).toEqual([])
  })
})
