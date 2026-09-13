import { describe, expect, it } from 'vitest'
import { parisDayOffset, parisDayStartUtc, parisDayString, parisDaysBack } from '@/lib/paris-time'

const at = (iso: string) => new Date(iso)
const HOUR_MS = 60 * 60 * 1000

/** Instants à cheval sur un changement d'heure, toutes les 30 min sur 4 jours. */
function instantsAround(isoStart: string): Date[] {
  const start = Date.parse(isoStart)
  return Array.from({ length: 4 * 48 }, (_, i) => new Date(start + i * 30 * 60 * 1000))
}

describe('parisDayString', () => {
  it('suit Paris et non UTC autour de minuit', () => {
    // Été (+2 h) : 22:30Z est déjà le lendemain à Paris.
    expect(parisDayString(at('2026-09-12T21:59:59.999Z'))).toBe('2026-09-12')
    expect(parisDayString(at('2026-09-12T22:30:00.000Z'))).toBe('2026-09-13')
    // Hiver (+1 h) : 22:30Z est encore le même jour.
    expect(parisDayString(at('2026-12-01T22:30:00.000Z'))).toBe('2026-12-01')
    expect(parisDayString(at('2026-12-01T23:30:00.000Z'))).toBe('2026-12-02')
  })
})

describe('parisDayOffset — passage à l’heure d’hiver (25/10/2026)', () => {
  it('22:30Z le 25/10 : 23:30 à Paris, encore le 25', () => {
    const from = at('2026-10-25T22:30:00.000Z')
    expect(parisDayOffset(0, from)).toBe('2026-10-25')
    expect(parisDayOffset(1, from)).toBe('2026-10-24')
    expect(parisDayOffset(2, from)).toBe('2026-10-23')
  })

  it('23:30Z le 25/10 : 00:30 à Paris, déjà le 26', () => {
    const from = at('2026-10-25T23:30:00.000Z')
    expect(parisDayOffset(0, from)).toBe('2026-10-26')
    expect(parisDayOffset(1, from)).toBe('2026-10-25')
    expect(parisDayOffset(2, from)).toBe('2026-10-24')
  })

  it('22:30Z la veille (encore à +2 h) : 00:30 à Paris le 25', () => {
    const from = at('2026-10-24T22:30:00.000Z')
    expect(parisDayOffset(0, from)).toBe('2026-10-25')
    expect(parisDayOffset(1, from)).toBe('2026-10-24')
  })
})

describe('parisDayOffset — passage à l’heure d’été (28/03/2027)', () => {
  it('22:30Z le 28/03 : 00:30 à Paris, déjà le 29 (le 28 ne manque pas)', () => {
    const from = at('2027-03-28T22:30:00.000Z')
    expect(parisDayOffset(0, from)).toBe('2027-03-29')
    expect(parisDayOffset(1, from)).toBe('2027-03-28')
    expect(parisDayOffset(2, from)).toBe('2027-03-27')
  })

  it('23:30Z le 28/03 : 01:30 à Paris le 29', () => {
    const from = at('2027-03-28T23:30:00.000Z')
    expect(parisDayOffset(0, from)).toBe('2027-03-29')
    expect(parisDayOffset(1, from)).toBe('2027-03-28')
  })

  it('23:30Z la veille (encore à +1 h) : 00:30 à Paris le 28', () => {
    const from = at('2027-03-27T23:30:00.000Z')
    expect(parisDayOffset(0, from)).toBe('2027-03-28')
    expect(parisDayOffset(1, from)).toBe('2027-03-27')
  })
})

describe('parisDayOffset — bords de mois et d’année', () => {
  it('traverse fin d’année, février bissextile et accepte un décalage vers le futur', () => {
    expect(parisDayOffset(1, at('2026-12-31T23:30:00.000Z'))).toBe('2026-12-31')
    expect(parisDayOffset(1, at('2028-03-01T10:00:00.000Z'))).toBe('2028-02-29')
    expect(parisDayOffset(29, at('2026-09-13T10:00:00.000Z'))).toBe('2026-08-15')
    expect(parisDayOffset(-1, at('2026-10-25T22:30:00.000Z'))).toBe('2026-10-26')
  })
})

describe('parisDaysBack', () => {
  it('du plus ancien au plus récent, aujourd’hui inclus', () => {
    expect(parisDaysBack(4, at('2026-10-25T22:30:00.000Z'))).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
    expect(parisDaysBack(4, at('2027-03-28T22:30:00.000Z'))).toEqual([
      '2027-03-26',
      '2027-03-27',
      '2027-03-28',
      '2027-03-29',
    ])
    expect(parisDaysBack(0, at('2026-09-13T10:00:00.000Z'))).toEqual([])
  })

  it.each([
    ['heure d’hiver 2026', '2026-10-23T12:00:00.000Z'],
    ['heure d’été 2027', '2027-03-26T12:00:00.000Z'],
    ['1er janvier', '2026-12-30T12:00:00.000Z'],
  ])('14 jours sans doublon ni trou, à toute heure (%s)', (_label, isoStart) => {
    for (const from of instantsAround(isoStart)) {
      const days = parisDaysBack(14, from)
      expect(days).toHaveLength(14)
      expect(new Set(days).size).toBe(14)
      expect(days[13]).toBe(parisDayString(from))
      for (let i = 1; i < days.length; i += 1) {
        // Jours consécutifs : un jour calendaire exactement entre deux dates.
        expect(Date.parse(`${days[i]}T00:00:00Z`) - Date.parse(`${days[i - 1]}T00:00:00Z`)).toBe(24 * HOUR_MS)
      }
    }
  })
})

describe('parisDayStartUtc', () => {
  it('minuit de Paris en heure d’été (+2 h) et d’hiver (+1 h)', () => {
    expect(parisDayStartUtc('2026-09-13').toISOString()).toBe('2026-09-12T22:00:00.000Z')
    expect(parisDayStartUtc('2027-01-01').toISOString()).toBe('2026-12-31T23:00:00.000Z')
  })

  it('jours de changement d’heure et leurs lendemains', () => {
    // Le 25/10 commence encore à +2 h ; le 26 à +1 h (journée de 25 h).
    expect(parisDayStartUtc('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(parisDayStartUtc('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z')
    // Le 28/03 commence encore à +1 h ; le 29 à +2 h (journée de 23 h).
    expect(parisDayStartUtc('2027-03-28').toISOString()).toBe('2027-03-27T23:00:00.000Z')
    expect(parisDayStartUtc('2027-03-29').toISOString()).toBe('2027-03-28T22:00:00.000Z')
  })

  it('borne exacte : la milliseconde d’avant est la veille', () => {
    for (const day of parisDaysBack(10, at('2026-10-30T12:00:00.000Z'))) {
      const start = parisDayStartUtc(day).getTime()
      expect(parisDayString(new Date(start))).toBe(day)
      expect(parisDayString(new Date(start - 1))).toBe(parisDayOffset(1, new Date(start)))
    }
  })

  it('durée des journées : 25 h le 25/10/2026, 23 h le 28/03/2027', () => {
    const length = (day: string, next: string) =>
      parisDayStartUtc(next).getTime() - parisDayStartUtc(day).getTime()
    expect(length('2026-10-25', '2026-10-26')).toBe(25 * HOUR_MS)
    expect(length('2027-03-28', '2027-03-29')).toBe(23 * HOUR_MS)
    expect(length('2026-09-13', '2026-09-14')).toBe(24 * HOUR_MS)
  })

  it('refuse un jour mal formé plutôt que de renvoyer une date invalide', () => {
    expect(() => parisDayStartUtc('13/09/2026')).toThrow(RangeError)
  })
})
