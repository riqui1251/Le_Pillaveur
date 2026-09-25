import { describe, expect, it } from 'vitest'
import { PARIS_TIME_ZONE, parisDayString } from '@/lib/paris-time'
import { parisDayToDate } from '@/lib/supervision/paris-day'

/** Heure murale de Paris d'un instant, « HH:MM ». */
function parisClock(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

describe('parisDayToDate', () => {
  it('pose le jour à midi UTC : 13 h à Paris l’hiver, 14 h l’été', () => {
    expect(parisDayToDate('2026-01-15').toISOString()).toBe('2026-01-15T12:00:00.000Z')
    expect(parisClock(parisDayToDate('2026-01-15'))).toBe('13:00')
    expect(parisClock(parisDayToDate('2026-07-15'))).toBe('14:00')
  })

  it('les jours de changement d’heure retombent sur eux-mêmes', () => {
    // Passage à l'heure d'été (29/03/2026) et d'hiver (25/10/2026).
    for (const day of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
      expect(parisDayString(parisDayToDate(day))).toBe(day)
    }
  })

  it('aller-retour exact sur toute une année (bissextile comprise)', () => {
    for (const year of [2026, 2028]) {
      const start = Date.UTC(year, 0, 1, 12)
      const days = year === 2028 ? 366 : 365
      for (let i = 0; i < days; i += 1) {
        const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
        expect(parisDayString(parisDayToDate(day))).toBe(day)
      }
    }
  })

  it('une chaîne qui n’est pas un jour donne une date invalide, sans lever', () => {
    expect(Number.isNaN(parisDayToDate('pas-un-jour').getTime())).toBe(true)
    expect(Number.isNaN(parisDayToDate('').getTime())).toBe(true)
  })
})
