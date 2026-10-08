import { describe, expect, it } from 'vitest'
import {
  FRIDAY_TABLE,
  formatClockTime,
  fridayTableStatus,
  fridayTableWeekKey,
  parseFridayTableLang,
  pickFridayTable,
  type FridayTableCandidate,
} from './friday-table'

/**
 * Table ouverte du vendredi : le rendez-vous se calcule à l'heure de PARIS
 * (21 h → minuit), quel que soit le fuseau du processus (UTC en production)
 * ou du visiteur, et à travers les deux changements d'heure. Instants posés
 * en UTC explicite : +2 h l'été (CEST), +1 h l'hiver (CET).
 */

const at = (iso: string) => new Date(iso)

describe('FRIDAY_TABLE', () => {
  it('vendredi 21 h → minuit, heure de Paris, sur l’Imposteur', () => {
    expect(FRIDAY_TABLE).toEqual({
      weekday: 5,
      startHour: 21,
      endHour: 24,
      gameId: 'imposteur',
      tz: 'Europe/Paris',
    })
  })
})

describe('fridayTableStatus — heure d’été (CEST, UTC+2)', () => {
  // Vendredi 9 octobre 2026 : 21 h Paris = 19 h UTC, minuit Paris = 22 h UTC.
  const startsAt = '2026-10-09T19:00:00.000Z'
  const endsAt = '2026-10-09T22:00:00.000Z'

  it('jeudi : la prochaine soirée est celle du lendemain, pas encore ouverte', () => {
    expect(fridayTableStatus(at('2026-10-08T12:00:00Z'))).toEqual({ live: false, startsAt, endsAt })
  })

  it('vendredi 20 h 59 Paris : pas encore', () => {
    expect(fridayTableStatus(at('2026-10-09T18:59:59Z'))).toEqual({ live: false, startsAt, endsAt })
  })

  it('vendredi 21 h pile Paris : ouverte', () => {
    expect(fridayTableStatus(at(startsAt))).toEqual({ live: true, startsAt, endsAt })
  })

  it('vendredi 23 h 59 Paris : toujours ouverte', () => {
    expect(fridayTableStatus(at('2026-10-09T21:59:59Z')).live).toBe(true)
  })

  it('minuit pile Paris : fermée, rendez-vous la semaine suivante', () => {
    expect(fridayTableStatus(at(endsAt))).toEqual({
      live: false,
      startsAt: '2026-10-16T19:00:00.000Z',
      endsAt: '2026-10-16T22:00:00.000Z',
    })
  })

  it('vendredi 23 h UTC = samedi 1 h Paris : fermée — le jour se lit à Paris, pas en UTC', () => {
    expect(fridayTableStatus(at('2026-10-09T23:00:00Z')).live).toBe(false)
  })

  it('jeudi 23 h 30 UTC = vendredi 1 h 30 Paris : la soirée est bien celle de ce vendredi', () => {
    expect(fridayTableStatus(at('2026-10-08T23:30:00Z'))).toEqual({ live: false, startsAt, endsAt })
  })
})

describe('fridayTableStatus — heure d’hiver (CET, UTC+1)', () => {
  it('vendredi 4 décembre 2026 : 21 h Paris = 20 h UTC', () => {
    expect(fridayTableStatus(at('2026-12-02T10:00:00Z'))).toEqual({
      live: false,
      startsAt: '2026-12-04T20:00:00.000Z',
      endsAt: '2026-12-04T23:00:00.000Z',
    })
    expect(fridayTableStatus(at('2026-12-04T20:30:00Z')).live).toBe(true)
    // 20 h 30 UTC l'été serait 22 h 30 Paris ; l'hiver, 19 h 59 UTC = 20 h 59 Paris.
    expect(fridayTableStatus(at('2026-12-04T19:59:00Z')).live).toBe(false)
  })
})

describe('fridayTableStatus — changements d’heure', () => {
  it('fin octobre : du samedi 24 (été) au vendredi 30 (hiver), l’heure UTC recule d’une heure', () => {
    // Bascule à l'heure d'hiver le dimanche 25 octobre 2026 à 3 h.
    expect(fridayTableStatus(at('2026-10-24T10:00:00Z'))).toEqual({
      live: false,
      startsAt: '2026-10-30T20:00:00.000Z',
      endsAt: '2026-10-30T23:00:00.000Z',
    })
  })

  it('le vendredi 23 octobre, encore à l’heure d’été', () => {
    expect(fridayTableStatus(at('2026-10-23T19:30:00Z'))).toEqual({
      live: true,
      startsAt: '2026-10-23T19:00:00.000Z',
      endsAt: '2026-10-23T22:00:00.000Z',
    })
  })

  it('fin mars : du samedi 28 (hiver) au vendredi 2 avril (été)', () => {
    // Bascule à l'heure d'été le dimanche 28 mars 2027 à 2 h.
    expect(fridayTableStatus(at('2027-03-27T12:00:00Z'))).toEqual({
      live: false,
      startsAt: '2027-04-02T19:00:00.000Z',
      endsAt: '2027-04-02T22:00:00.000Z',
    })
  })

  it('la soirée dure toujours 3 h, été comme hiver', () => {
    for (const iso of ['2026-07-01T12:00:00Z', '2026-10-24T12:00:00Z', '2027-01-15T12:00:00Z', '2027-03-27T12:00:00Z']) {
      const status = fridayTableStatus(at(iso))
      expect(Date.parse(status.endsAt) - Date.parse(status.startsAt)).toBe(3 * 60 * 60 * 1000)
    }
  })
})

describe('fridayTableStatus — invariants', () => {
  it('la soirée renvoyée ne finit jamais avant maintenant, et tombe un vendredi soir à Paris', () => {
    const paris = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    // Un relevé toutes les 7 h sur un an : toutes les heures de la semaine, les deux saisons.
    for (let t = Date.parse('2026-06-01T00:00:00Z'); t < Date.parse('2027-06-01T00:00:00Z'); t += 7 * 60 * 60 * 1000) {
      const status = fridayTableStatus(new Date(t))
      const start = Date.parse(status.startsAt)
      const end = Date.parse(status.endsAt)
      expect(end).toBeGreaterThan(t)
      expect(start - t).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000)
      expect(status.live).toBe(t >= start && t < end)
      expect(paris.format(new Date(start))).toBe('Fri 21:00')
    }
  })
})

describe('fridayTableWeekKey', () => {
  it('la clé est celle de la soirée visée : masquer un samedi vaut pour le vendredi suivant', () => {
    // Samedi 10 octobre (semaine 41) : la prochaine soirée est le 16 (semaine 42).
    expect(fridayTableWeekKey(fridayTableStatus(at('2026-10-10T12:00:00Z')))).toBe('2026-W42')
    // Pendant la soirée du 9 : semaine 41.
    expect(fridayTableWeekKey(fridayTableStatus(at('2026-10-09T20:00:00Z')))).toBe('2026-W41')
    // Lundi 5 octobre : la soirée du 9, même semaine.
    expect(fridayTableWeekKey(fridayTableStatus(at('2026-10-05T08:00:00Z')))).toBe('2026-W41')
  })

  it('semaine ISO de Paris au Nouvel An : le vendredi 1er janvier 2027 est en 2026-W53', () => {
    expect(fridayTableWeekKey(fridayTableStatus(at('2026-12-30T12:00:00Z')))).toBe('2026-W53')
  })
})

describe('parseFridayTableLang', () => {
  it('une des quatre langues, sinon le français', () => {
    expect(parseFridayTableLang('en')).toBe('en')
    expect(parseFridayTableLang('it')).toBe('it')
    expect(parseFridayTableLang('de')).toBe('fr')
    expect(parseFridayTableLang('')).toBe('fr')
    expect(parseFridayTableLang(null)).toBe('fr')
    expect(parseFridayTableLang(undefined)).toBe('fr')
  })
})

describe('pickFridayTable', () => {
  const table = (over: Partial<FridayTableCandidate>): FridayTableCandidate => ({
    code: 'AAAAAA',
    players: 1,
    lang: 'fr',
    createdAtMs: 1_000,
    ...over,
  })

  it('aucune table : null', () => {
    expect(pickFridayTable([], 'fr', 16)).toBeNull()
  })

  it('la plus peuplée l’emporte', () => {
    expect(
      pickFridayTable(
        [table({ code: 'SOLO22', players: 1 }), table({ code: 'TRIO33', players: 3 }), table({ code: 'DUO444', players: 2 })],
        'fr',
        16
      )
    ).toEqual({ code: 'TRIO33', players: 3, maxPlayers: 16 })
  })

  it('une table pleine est ignorée : on ne propose que de la place', () => {
    expect(
      pickFridayTable([table({ code: 'PLEINE', players: 16 }), table({ code: 'PLACE2', players: 5 })], 'fr', 16)
    ).toEqual({ code: 'PLACE2', players: 5, maxPlayers: 16 })
  })

  it('seulement dans la langue de la page', () => {
    const tables = [table({ code: 'FRANC1', players: 6, lang: 'fr' }), table({ code: 'ENGL22', players: 2, lang: 'en' })]
    expect(pickFridayTable(tables, 'en', 16)?.code).toBe('ENGL22')
    expect(pickFridayTable(tables, 'es', 16)).toBeNull()
  })

  it('à effectif égal, la plus ancienne puis le code : tout le monde reçoit la même', () => {
    const tables = [
      table({ code: 'RECENT', players: 2, createdAtMs: 5_000 }),
      table({ code: 'BBBBBB', players: 2, createdAtMs: 1_000 }),
      table({ code: 'AAAAAA', players: 2, createdAtMs: 1_000 }),
    ]
    expect(pickFridayTable(tables, 'fr', 16)?.code).toBe('AAAAAA')
    expect(pickFridayTable([...tables].reverse(), 'fr', 16)?.code).toBe('AAAAAA')
  })

  it('une salle sans membre n’est pas une table', () => {
    expect(pickFridayTable([table({ players: 0 })], 'fr', 16)).toBeNull()
  })
})

describe('formatClockTime', () => {
  const NBSP = String.fromCharCode(0xa0)
  // Vendredi 9 octobre 2026, 21 h à Paris (UTC+2).
  const at21 = new Date('2026-10-09T19:00:00Z')
  const at2130 = new Date('2026-10-09T19:30:00Z')

  it('écrit « 21 h » et « 21 h 30 » en français, espaces insécables', () => {
    expect(formatClockTime(at21, 'fr', 'Europe/Paris')).toBe(`21${NBSP}h`)
    expect(formatClockTime(at2130, 'fr', 'Europe/Paris')).toBe(`21${NBSP}h${NBSP}30`)
  })

  it('minuit en « 0 h », pas « 24 h »', () => {
    expect(formatClockTime(new Date('2026-10-09T22:00:00Z'), 'fr', 'Europe/Paris')).toBe(`0${NBSP}h`)
  })

  it('les autres langues gardent le format d’Intl', () => {
    expect(formatClockTime(at21, 'en', 'Europe/Paris')).toBe(
      new Intl.DateTimeFormat('en', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' }).format(at21)
    )
  })
})
