import { describe, expect, it } from 'vitest'
import {
  calendarDayOffset,
  parisDayOffset,
  parisDayStartUtc,
  parisDayString,
  parisDaysBack,
  parisWeekKey,
  parisWeekOffset,
  toWeekKey,
  weekKeyMonday,
  weekKeyOfDay,
  weeksBetween,
} from '@/lib/paris-time'

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

// ─── Semaines ISO de Paris (série hebdomadaire) ──────────────────────────────

describe('calendarDayOffset', () => {
  it('décale une date connue, sans fuseau, bords de mois et d’année compris', () => {
    expect(calendarDayOffset('2026-10-08', 0)).toBe('2026-10-08')
    expect(calendarDayOffset('2026-10-08', 3)).toBe('2026-10-05')
    expect(calendarDayOffset('2027-01-01', 1)).toBe('2026-12-31')
    expect(calendarDayOffset('2028-03-01', 1)).toBe('2028-02-29')
    expect(calendarDayOffset('2026-10-25', -1)).toBe('2026-10-26')
  })
})

describe('weekKeyOfDay', () => {
  it('semaine ISO du lundi au dimanche', () => {
    // Jeudi 08/10/2026 : semaine 41 ; lundi 05 et dimanche 11 aussi.
    expect(weekKeyOfDay('2026-10-08')).toBe('2026-W41')
    expect(weekKeyOfDay('2026-10-05')).toBe('2026-W41')
    expect(weekKeyOfDay('2026-10-11')).toBe('2026-W41')
    expect(weekKeyOfDay('2026-10-12')).toBe('2026-W42')
  })

  it('l’année ISO n’est pas l’année civile aux bords', () => {
    // 2026 commence un jeudi : 53 semaines, et le 01/01/2027 est encore en W53.
    expect(weekKeyOfDay('2025-12-29')).toBe('2026-W01')
    expect(weekKeyOfDay('2026-01-01')).toBe('2026-W01')
    expect(weekKeyOfDay('2026-12-31')).toBe('2026-W53')
    expect(weekKeyOfDay('2027-01-03')).toBe('2026-W53')
    expect(weekKeyOfDay('2027-01-04')).toBe('2027-W01')
    // Lundi 30/12/2024 : déjà la semaine 1 de 2025.
    expect(weekKeyOfDay('2024-12-30')).toBe('2025-W01')
    expect(weekKeyOfDay('2021-01-03')).toBe('2020-W53')
  })
})

describe('parisWeekKey — le dimanche minuit de Paris, pas d’UTC', () => {
  it('passage à l’heure d’hiver (dimanche 25/10/2026)', () => {
    // 22:30Z = 23:30 à Paris, encore dimanche : semaine 43.
    expect(parisWeekKey(at('2026-10-25T22:30:00.000Z'))).toBe('2026-W43')
    // 23:30Z = 00:30 lundi à Paris : semaine 44 (en UTC, encore dimanche).
    expect(parisWeekKey(at('2026-10-25T23:30:00.000Z'))).toBe('2026-W44')
  })

  it('passage à l’heure d’été (dimanche 28/03/2027)', () => {
    expect(parisWeekKey(at('2027-03-28T21:30:00.000Z'))).toBe('2027-W12')
    // 22:30Z = 00:30 lundi à Paris (+2 h) : déjà la semaine 13.
    expect(parisWeekKey(at('2027-03-28T22:30:00.000Z'))).toBe('2027-W13')
  })

  it('en heure d’été, dimanche 22:30Z est déjà lundi à Paris', () => {
    expect(parisWeekKey(at('2026-09-13T21:59:59.999Z'))).toBe('2026-W37')
    expect(parisWeekKey(at('2026-09-13T22:00:00.000Z'))).toBe('2026-W38')
  })
})

describe('parisWeekOffset', () => {
  it('semaine précédente juste après les changements d’heure (jamais 7 × 24 h)', () => {
    // Dimanche 25/10 23:30 à Paris (semaine de 169 h) : la précédente est la 42.
    expect(parisWeekOffset(1, at('2026-10-25T22:30:00.000Z'))).toBe('2026-W42')
    // Lundi 29/03/2027 00:30 à Paris, après une semaine de 167 h : la 12, pas la 11.
    expect(parisWeekOffset(1, at('2027-03-28T22:30:00.000Z'))).toBe('2027-W12')
    expect(parisWeekOffset(0, at('2027-03-28T22:30:00.000Z'))).toBe('2027-W13')
  })

  it('traverse le Nouvel An ISO (2026 a 53 semaines)', () => {
    expect(parisWeekOffset(1, at('2027-01-04T12:00:00.000Z'))).toBe('2026-W53')
    expect(parisWeekOffset(2, at('2027-01-04T12:00:00.000Z'))).toBe('2026-W52')
    expect(parisWeekOffset(1, at('2026-01-05T12:00:00.000Z'))).toBe('2026-W01')
  })

  it.each([
    ['heure d’hiver 2026', '2026-10-23T12:00:00.000Z'],
    ['heure d’été 2027', '2027-03-26T12:00:00.000Z'],
    ['Nouvel An', '2026-12-30T12:00:00.000Z'],
  ])('à toute heure, la semaine précédente est exactement une semaine avant (%s)', (_label, isoStart) => {
    for (const from of instantsAround(isoStart)) {
      expect(weeksBetween(parisWeekOffset(1, from), parisWeekKey(from))).toBe(1)
      expect(parisWeekOffset(0, from)).toBe(parisWeekKey(from))
    }
  })
})

describe('weekKeyMonday et weeksBetween', () => {
  it('lundi d’une semaine, années à 52 et 53 semaines', () => {
    expect(weekKeyMonday('2026-W41')).toBe('2026-10-05')
    expect(weekKeyMonday('2026-W01')).toBe('2025-12-29')
    expect(weekKeyMonday('2026-W53')).toBe('2026-12-28')
    expect(weekKeyMonday('2025-W01')).toBe('2024-12-30')
    expect(weekKeyMonday('2027-W01')).toBe('2027-01-04')
    expect(() => weekKeyMonday('2026-10-05')).toThrow(RangeError)
  })

  it('écart en semaines, à cheval sur deux années ISO', () => {
    expect(weeksBetween('2026-W53', '2027-W01')).toBe(1)
    expect(weeksBetween('2026-W01', '2026-W53')).toBe(52)
    expect(weeksBetween('2026-W41', '2026-W41')).toBe(0)
    expect(weeksBetween('2026-W42', '2026-W41')).toBe(-1)
  })
})

describe('toWeekKey — lecture tolérante (migration douce de la série)', () => {
  it('une clé de semaine valide passe telle quelle', () => {
    expect(toWeekKey('2026-W41')).toBe('2026-W41')
    expect(toWeekKey('2026-W53')).toBe('2026-W53')
  })

  it('un ancien jour devient la semaine qui le contient', () => {
    expect(toWeekKey('2026-10-08')).toBe('2026-W41')
    expect(toWeekKey('2026-10-11')).toBe('2026-W41')
    expect(toWeekKey('2027-01-01')).toBe('2026-W53')
  })

  it('tout le reste → null, jamais une semaine inventée', () => {
    expect(toWeekKey(null)).toBeNull()
    expect(toWeekKey(undefined)).toBeNull()
    expect(toWeekKey('')).toBeNull()
    // 2025 n'a que 52 semaines ; W00 n'existe pas ; le 30 février non plus.
    expect(toWeekKey('2025-W53')).toBeNull()
    expect(toWeekKey('2026-W00')).toBeNull()
    expect(toWeekKey('2026-W54')).toBeNull()
    expect(toWeekKey('2026-02-30')).toBeNull()
    expect(toWeekKey('13/09/2026')).toBeNull()
    expect(toWeekKey('2026-W41 ')).toBeNull()
  })
})
