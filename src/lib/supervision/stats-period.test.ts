import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATS_PERIOD,
  gameRows,
  gamesByDay,
  measureSpan,
  measureWindow,
  oldestComputedAt,
  parseStatsPeriod,
  phoneShare,
  weekOverWeekDelta,
} from '@/lib/supervision/stats-period'

/** 20/10/2026 à 14 h, heure de Paris. */
const COMPUTED_AT = new Date('2026-10-20T12:00:00.000Z')

describe('parseStatsPeriod', () => {
  it('relit les trois périodes, rien d’autre', () => {
    expect(parseStatsPeriod('d1')).toBe('d1')
    expect(parseStatsPeriod('d7')).toBe('d7')
    expect(parseStatsPeriod('d30')).toBe('d30')
    expect(parseStatsPeriod('7')).toBeNull()
    expect(parseStatsPeriod(null)).toBeNull()
    expect(parseStatsPeriod(undefined)).toBeNull()
  })

  it('7 jours par défaut', () => {
    expect(DEFAULT_STATS_PERIOD).toBe('d7')
  })
})

describe('measureWindow', () => {
  it('la période elle-même quand la mesure l’a', () => {
    expect(measureWindow('d1', ['d1', 'd7', 'd30'])).toBe('d1')
    expect(measureWindow('d30', ['d7', 'd30'])).toBe('d30')
  })

  it('sinon la fenêtre la plus proche : aujourd’hui → 7 jours, 30 jours → 7 jours', () => {
    expect(measureWindow('d1', ['d7', 'd30'])).toBe('d7')
    expect(measureWindow('d30', ['d1', 'd7'])).toBe('d7')
    expect(measureWindow('d1', ['d7'])).toBe('d7')
    expect(measureWindow('d30', ['d7'])).toBe('d7')
    expect(measureWindow('d1', ['d30'])).toBe('d30')
  })

  it('aucune fenêtre : null, jamais un chiffre inventé', () => {
    expect(measureWindow('d7', [])).toBeNull()
  })
})

describe('measureSpan', () => {
  it('dit la fenêtre lue et si elle remplace la période', () => {
    expect(measureSpan('d1', ['d7', 'd30'])).toEqual({ key: 'd7', days: 7, substituted: true, since: null })
    expect(measureSpan('d30', ['d1', 'd7', 'd30'])).toEqual({ key: 'd30', days: 30, substituted: false, since: null })
    expect(measureSpan('d7', [])).toBeNull()
  })

  it('premier jour mesuré quand la source est plus jeune que la fenêtre', () => {
    // 30 jours au 20/10 = depuis le 21/09.
    expect(measureSpan('d30', ['d30'], { computedAt: COMPUTED_AT, since: '2026-10-08' })?.since).toBe('2026-10-08')
    expect(measureSpan('d30', ['d30'], { computedAt: COMPUTED_AT, since: '2026-09-21' })?.since).toBeNull()
    // 7 jours au 20/10 = depuis le 14/10.
    expect(measureSpan('d7', ['d7'], { computedAt: COMPUTED_AT, since: '2026-10-15' })?.since).toBe('2026-10-15')
    expect(measureSpan('d7', ['d7'], { computedAt: COMPUTED_AT, since: '2026-10-14' })?.since).toBeNull()
    expect(measureSpan('d7', ['d7'], { computedAt: COMPUTED_AT, since: null })?.since).toBeNull()
  })
})

describe('oldestComputedAt', () => {
  it('le calcul le plus ancien date un pied commun', () => {
    expect(oldestComputedAt('2026-10-20T12:05:00.000Z', '2026-10-20T12:01:00.000Z')).toBe('2026-10-20T12:01:00.000Z')
    expect(oldestComputedAt(null, '2026-10-20T12:05:00.000Z', 'pas une date')).toBe('2026-10-20T12:05:00.000Z')
    expect(oldestComputedAt(undefined)).toBeNull()
  })
})

/** Série de `count` jours consécutifs finissant le `last` (inclus), visiteurs donnés par `value`. */
function series(last: string, count: number, value: (index: number) => number) {
  const end = new Date(`${last}T12:00:00.000Z`).getTime()
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    visitors: value(i),
  }))
}

describe('weekOverWeekDelta', () => {
  const CONSENT = '2026-09-13'

  it('compare les 7 derniers jours révolus aux 7 d’avant, aujourd’hui exclu', () => {
    // 15 jours jusqu'à aujourd'hui (20/10) : 6 au 6/10–12/10, 9 au 13/10–19/10, 1000 aujourd'hui.
    const points = series('2026-10-20', 15, (i) => (i === 14 ? 1000 : i >= 7 ? 9 : 6))
    expect(weekOverWeekDelta(points, '2026-10-20', CONSENT)).toBe(50)
  })

  it('pas d’écart sans deux semaines entières révolues', () => {
    const points = series('2026-10-20', 14, () => 5)
    expect(weekOverWeekDelta(points, '2026-10-20', CONSENT)).toBeNull()
  })

  it('pas d’écart quand la semaine de référence touche la reprise du consentement', () => {
    const points = series('2026-09-28', 15, () => 5)
    // Semaine de référence : 13/09–19/09, commence le jour de la reprise.
    expect(points[0].date).toBe('2026-09-14')
    expect(weekOverWeekDelta(series('2026-09-27', 15, () => 5), '2026-09-27', CONSENT)).toBeNull()
    expect(weekOverWeekDelta(points, '2026-09-28', CONSENT)).toBe(0)
  })

  it('pas d’écart sur une semaine de référence vide', () => {
    const points = series('2026-10-20', 15, (i) => (i < 7 ? 0 : 4))
    expect(weekOverWeekDelta(points, '2026-10-20', CONSENT)).toBeNull()
  })
})

describe('phoneShare', () => {
  it('part des visites sur téléphone, tablette à part', () => {
    expect(
      phoneShare([
        { device: 'mobile', visits: 6 },
        { device: 'tablet', visits: 2 },
        { device: 'pc', visits: 2 },
      ])
    ).toEqual({ phone: 6, total: 10, share: 0.6 })
  })

  it('arrondie comme les barres Appareils (plus fort reste), pas à part', () => {
    // 23/34 = 67,6 % : seul, il s'arrondirait à 68 ; la répartition 67/12/12/9 fait 100.
    const result = phoneShare([
      { device: 'mobile', visits: 23 },
      { device: 'tablet', visits: 4 },
      { device: 'pc', visits: 4 },
      { device: 'mac', visits: 3 },
    ])
    expect(result?.share).toBeCloseTo(0.67)
  })

  it('sans visite : null, jamais 0 %', () => {
    expect(phoneShare([])).toBeNull()
    expect(phoneShare([{ device: 'pc', visits: 0 }])).toBeNull()
  })

  it('aucune visite sur téléphone : 0 sur le total', () => {
    expect(phoneShare([{ device: 'pc', visits: 3 }])).toEqual({ phone: 0, total: 3, share: 0 })
  })
})

describe('gamesByDay', () => {
  const online = [
    { day: '2026-10-06', solo: 1, withHumans: 0 },
    { day: '2026-10-07', solo: 2, withHumans: 1 },
    { day: '2026-10-08', solo: 0, withHumans: 3 },
  ]

  it('réunit en ligne et locales par jour de Paris', () => {
    const days = gamesByDay(online, '2026-09-10', {
      days: [
        { day: '2026-10-07', starts: 4 },
        { day: '2026-10-08', starts: 1 },
      ],
      since: '2026-10-07',
    })
    expect(days[1]).toEqual({ day: '2026-10-07', solo: 2, withHumans: 1, local: 4, muted: false })
    expect(days[2]).toEqual({ day: '2026-10-08', solo: 0, withHumans: 3, local: 1, muted: false })
  })

  it('raye un jour antérieur à l’une des mesures : sa pile mentirait', () => {
    const days = gamesByDay(online, '2026-09-10', { days: [], since: '2026-10-07' })
    expect(days.map((d) => d.muted)).toEqual([true, false, false])
    expect(gamesByDay(online, '2026-10-08', null).map((d) => d.muted)).toEqual([true, true, false])
  })

  it('sans mesure locale : rien d’additionné ni de rayé pour elle', () => {
    const days = gamesByDay(online, '2026-09-10', null)
    expect(days.every((d) => d.local === 0 && !d.muted)).toBe(true)
    // Rien jamais compté : des zéros, aucun jour rayé.
    expect(gamesByDay(online, '2026-09-10', { days: [], since: null }).every((d) => !d.muted)).toBe(true)
  })
})

describe('gameRows', () => {
  const online = [
    { gameId: 'quiz', gameTitle: 'Quiz', launches: 5, withHumans: 2 },
    { gameId: 'menteur', gameTitle: 'Menteur', launches: 1, withHumans: 0 },
  ]
  const local = [
    { gameId: 'pmu', gameTitle: 'PMU', starts: 4, ends: 3 },
    { gameId: 'quiz', gameTitle: 'Quiz', starts: 2, ends: 1 },
  ]

  it('réunit les deux mesures par jeu, total quand les deux existent, tri par total', () => {
    expect(gameRows(online, local)).toEqual([
      { gameId: 'quiz', gameTitle: 'Quiz', online: 5, withHumans: 2, local: 2, ends: 1, noEndScreen: false, total: 7 },
      { gameId: 'pmu', gameTitle: 'PMU', online: 0, withHumans: 0, local: 4, ends: 3, noEndScreen: false, total: 4 },
      { gameId: 'menteur', gameTitle: 'Menteur', online: 1, withHumans: 0, local: 0, ends: 0, noEndScreen: false, total: 1 },
    ])
  })

  it('garde, par jeu, les parties entre humains, les fins locales et les jeux sans écran de fin', () => {
    const rows = gameRows(online, [...local, { gameId: 'purple', gameTitle: 'Purple', starts: 3, ends: 0, noEndScreen: true }])
    expect(rows.find((r) => r.gameId === 'quiz')).toMatchObject({ withHumans: 2, ends: 1, noEndScreen: false })
    expect(rows.find((r) => r.gameId === 'purple')).toMatchObject({ online: 0, local: 3, ends: 0, noEndScreen: true })
  })

  it('une mesure absente : « — » dans sa colonne et pas de total', () => {
    const rows = gameRows(online, null)
    expect(rows.map((r) => [r.gameId, r.online, r.local, r.total])).toEqual([
      ['quiz', 5, null, null],
      ['menteur', 1, null, null],
    ])
    expect(gameRows(null, null)).toEqual([])
  })
})
