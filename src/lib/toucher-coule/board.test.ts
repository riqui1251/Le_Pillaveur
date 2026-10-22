import { describe, expect, it } from 'vitest'
import {
  TC_MAX_CELL_PX,
  TC_MIN_CELL_PX,
  tcBombCells,
  tcBombFits,
  tcCellPx,
  tcColumnLetter,
  tcCoord,
  tcShipCells,
} from './board'
import { TC_MODES } from './engine'

describe('tcCoord', () => {
  it('écrit la colonne en lettre et la ligne à partir de 1', () => {
    expect(tcColumnLetter(0)).toBe('A')
    expect(tcColumnLetter(13)).toBe('N')
    expect(tcCoord(0, 8)).toBe('A1')
    expect(tcCoord(2 + 3 * 10, 10)).toBe('C4')
    expect(tcCoord(14 * 14 - 1, 14)).toBe('N14')
  })
})

describe('tcShipCells', () => {
  it('pose le bateau depuis la case touchée quand il tient', () => {
    expect(tcShipCells(0, 3, 8, true)).toEqual([0, 1, 2])
    expect(tcShipCells(1, 3, 8, false)).toEqual([1, 9, 17])
  })

  it('recale un bateau horizontal qui dépasse du bord droit', () => {
    // Ligne 2, dernière colonne d'une grille 8 : le 4 cases finit sur la colonne H.
    expect(tcShipCells(2 * 8 + 7, 4, 8, true)).toEqual([2 * 8 + 4, 2 * 8 + 5, 2 * 8 + 6, 2 * 8 + 7])
  })

  it('recale un bateau vertical qui dépasse du bord bas', () => {
    expect(tcShipCells(7 * 8 + 3, 3, 8, false)).toEqual([5 * 8 + 3, 6 * 8 + 3, 7 * 8 + 3])
  })

  it('reste dans une seule ligne ou une seule colonne', () => {
    for (const mode of Object.values(TC_MODES)) {
      const size = mode.gridSize
      for (let cell = 0; cell < size * size; cell += 1) {
        const h = tcShipCells(cell, 4, size, true)
        expect(new Set(h.map((c) => Math.floor(c / size))).size).toBe(1)
        expect(h.every((c) => c >= 0 && c < size * size)).toBe(true)
        const v = tcShipCells(cell, 4, size, false)
        expect(new Set(v.map((c) => c % size)).size).toBe(1)
        expect(v.every((c) => c >= 0 && c < size * size)).toBe(true)
      }
    }
  })
})

describe('bombe', () => {
  it('rend le carré 2×2 ancré sur le coin haut-gauche', () => {
    expect(tcBombCells(0, 8)).toEqual([0, 1, 8, 9])
  })

  it('borne le carré à la grille sans déborder sur la ligne suivante', () => {
    // Dernière colonne : la case « à droite » serait le début de la ligne suivante.
    expect(tcBombCells(7, 8)).toEqual([7, 15])
    expect(tcBombCells(63, 8)).toEqual([63])
  })

  it('ne tient que sur un carré complet et vierge', () => {
    expect(tcBombFits(0, 8, {})).toBe(true)
    expect(tcBombFits(7, 8, {})).toBe(false)
    expect(tcBombFits(56, 8, {})).toBe(false)
    expect(tcBombFits(0, 8, { 9: 'miss' })).toBe(false)
  })
})

describe('tcCellPx', () => {
  const GAP = 2
  const LABEL = 16

  it("garde au moins 30 px par case à 375 px, quitte à faire défiler la grille", () => {
    // Largeur utile d'un téléphone de 375 px : page px-3, cadre p-1.5 + bordure.
    const width = 375 - 24 - 14
    expect(tcCellPx(width, 8, GAP, LABEL)).toEqual({ cellPx: 38, overflows: false })
    expect(tcCellPx(width, 10, GAP, LABEL)).toEqual({ cellPx: 30, overflows: false })
    expect(tcCellPx(width, 12, GAP, LABEL)).toEqual({ cellPx: TC_MIN_CELL_PX, overflows: true })
    expect(tcCellPx(width, 14, GAP, LABEL)).toEqual({ cellPx: TC_MIN_CELL_PX, overflows: true })
  })

  it('plafonne la case sur un grand écran', () => {
    expect(tcCellPx(2000, 8, GAP, LABEL)).toEqual({ cellPx: TC_MAX_CELL_PX, overflows: false })
  })

  it('retombe sur le plancher tant que rien n’est mesuré', () => {
    expect(tcCellPx(0, 10, GAP, LABEL)).toEqual({ cellPx: TC_MIN_CELL_PX, overflows: false })
  })
})
