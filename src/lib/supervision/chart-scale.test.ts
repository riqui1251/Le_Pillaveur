import { describe, expect, it } from 'vitest'
import { niceMax, niceTicks, shareOf, sharesOf, showsXLabel, xLabelStep } from '@/lib/supervision/chart-scale'

describe('niceMax', () => {
  it('arrondit au-dessus à 1 / 2 / 2,5 / 5 × 10^k', () => {
    expect(niceMax(1)).toBe(1)
    expect(niceMax(7)).toBe(10)
    expect(niceMax(12)).toBe(20)
    expect(niceMax(21)).toBe(25)
    expect(niceMax(26)).toBe(50)
    expect(niceMax(99)).toBe(100)
    expect(niceMax(101)).toBe(200)
    expect(niceMax(2500)).toBe(2500)
    expect(niceMax(2501)).toBe(5000)
  })

  it('garde une valeur déjà ronde telle quelle (pas de décade gaspillée)', () => {
    expect(niceMax(10)).toBe(10)
    expect(niceMax(100)).toBe(100)
    expect(niceMax(1000)).toBe(1000)
    expect(niceMax(50)).toBe(50)
    expect(niceMax(250)).toBe(250)
  })

  it('traite les fractions sans bruit de flottant', () => {
    expect(niceMax(0.3)).toBe(0.5)
    expect(niceMax(0.07)).toBe(0.1)
    expect(niceMax(0.21)).toBe(0.25)
  })

  it('retombe sur 1 pour 0, négatif, NaN ou infini', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(-5)).toBe(1)
    expect(niceMax(Number.NaN)).toBe(1)
    expect(niceMax(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('niceTicks', () => {
  it('va de 0 à niceMax par pas rond', () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(1)).toEqual([0, 1])
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8, 10])
    expect(niceTicks(18)).toEqual([0, 5, 10, 15, 20])
    expect(niceTicks(99)).toEqual([0, 25, 50, 75, 100])
    expect(niceTicks(101)).toEqual([0, 50, 100, 150, 200])
    expect(niceTicks(2500)).toEqual([0, 500, 1000, 1500, 2000, 2500])
  })

  it('reste entier par défaut : pas de « 2,5 joueurs »', () => {
    expect(niceTicks(2)).toEqual([0, 1, 2])
    expect(niceTicks(3)).toEqual([0, 1, 2, 3, 4, 5])
    expect(niceTicks(0.3)).toEqual([0, 1])
    for (const max of [1, 2, 3, 7, 13, 26, 99, 101, 777, 2500]) {
      for (const tick of niceTicks(max)) expect(Number.isInteger(tick)).toBe(true)
    }
  })

  it('accepte des pas décimaux quand on le demande', () => {
    expect(niceTicks(1, 4, { integer: false })).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(niceTicks(0.3, 4, { integer: false })).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5])
  })

  it('respecte le nombre d’intervalles visé (au plus count + 1)', () => {
    expect(niceTicks(100, 2)).toEqual([0, 50, 100])
    expect(niceTicks(10, 1)).toEqual([0, 10])
    for (const max of [1, 5, 9, 17, 42, 99, 101, 640, 2500, 98765]) {
      const ticks = niceTicks(max, 4)
      expect(ticks.length - 1).toBeLessThanOrEqual(5)
      expect(ticks[0]).toBe(0)
      expect(ticks[ticks.length - 1]).toBe(niceMax(max))
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max)
    }
  })

  it('résiste aux entrées aberrantes', () => {
    expect(niceTicks(Number.NaN)).toEqual([0, 1])
    expect(niceTicks(-12)).toEqual([0, 1])
    expect(niceTicks(10, Number.NaN)).toEqual([0, 2, 4, 6, 8, 10])
    expect(niceTicks(10, 0)).toEqual([0, 2, 4, 6, 8, 10])
  })
})

describe('shareOf', () => {
  it('donne une part entière en %', () => {
    expect(shareOf(1, 3)).toBe(33)
    expect(shareOf(2, 3)).toBe(67)
    expect(shareOf(7, 7)).toBe(100)
    expect(shareOf(0, 99)).toBe(0)
    expect(shareOf(1, 101)).toBe(1)
    expect(shareOf(1, 2500)).toBe(0)
  })

  it('renvoie null quand la part n’a pas de sens', () => {
    expect(shareOf(0, 0)).toBeNull()
    expect(shareOf(3, 0)).toBeNull()
    expect(shareOf(3, -10)).toBeNull()
    expect(shareOf(Number.NaN, 10)).toBeNull()
    expect(shareOf(3, Number.NaN)).toBeNull()
  })

  it('borne à [0, 100]', () => {
    expect(shareOf(-1, 10)).toBe(0)
    expect(shareOf(15, 10)).toBe(100)
  })
})

describe('sharesOf', () => {
  it('totalise exactement 100 (plus fort reste)', () => {
    expect(sharesOf([1, 1, 1])).toEqual([34, 33, 33])
    expect(sharesOf([2, 1])).toEqual([67, 33])
    expect(sharesOf([99, 1])).toEqual([99, 1])
    const shares = sharesOf([7, 99, 101, 2500]) as number[]
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('compte négatifs et NaN pour 0, et renvoie null sur un total nul', () => {
    expect(sharesOf([Number.NaN, -3, 4])).toEqual([0, 0, 100])
    expect(sharesOf([0, 0])).toEqual([null, null])
    expect(sharesOf([])).toEqual([])
  })
})

describe('xLabelStep', () => {
  it('étiquette tout quand la place suffit', () => {
    expect(xLabelStep(14, 14)).toBe(1)
    expect(xLabelStep(14, 20)).toBe(1)
    expect(xLabelStep(7, 99)).toBe(1)
  })

  it('espace les étiquettes quand la place manque', () => {
    expect(xLabelStep(14, 7)).toBe(2)
    expect(xLabelStep(14, 5)).toBe(3)
    expect(xLabelStep(30, 7)).toBe(5)
    expect(xLabelStep(101, 10)).toBe(11)
  })

  it('n’affiche jamais plus de maxLabels étiquettes, ancrées sur la dernière', () => {
    for (const n of [7, 14, 30, 99, 101]) {
      for (const places of [1, 3, 5, 7, 12]) {
        const step = xLabelStep(n, places)
        const shown = Array.from({ length: n }, (_, i) => i).filter((i) => showsXLabel(i, n - 1, step))
        expect(shown.length).toBeLessThanOrEqual(places)
        expect(shown).toContain(n - 1)
      }
    }
  })

  it('résiste aux entrées aberrantes', () => {
    expect(xLabelStep(0, 5)).toBe(1)
    expect(xLabelStep(1, 0)).toBe(1)
    expect(xLabelStep(14, 0)).toBe(14)
    expect(xLabelStep(14, -3)).toBe(14)
    expect(xLabelStep(14, Number.NaN)).toBe(14)
    expect(xLabelStep(Number.NaN, 5)).toBe(1)
  })
})

describe('showsXLabel', () => {
  it('part de l’ancre (le jour courant), dans les deux sens', () => {
    expect(showsXLabel(13, 13, 2)).toBe(true)
    expect(showsXLabel(12, 13, 2)).toBe(false)
    expect(showsXLabel(11, 13, 2)).toBe(true)
    // Ancre au milieu : les jours suivants suivent la même grille.
    expect(showsXLabel(9, 6, 3)).toBe(true)
    expect(showsXLabel(8, 6, 3)).toBe(false)
  })

  it('pas invalide -> tout est étiqueté', () => {
    expect(showsXLabel(4, 13, 0)).toBe(true)
    expect(showsXLabel(4, 13, Number.NaN)).toBe(true)
  })
})
