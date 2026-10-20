import { describe, expect, it } from 'vitest'
import type { ActiveAccountsStats } from '@/lib/active-accounts-server'
import { accountsCoverageSince, partialSince, weekFigures } from '@/lib/supervision/week'

// Midi à Paris le 19/10/2026 : les 7 jours vont du 13 au 19.
const COMPUTED_AT = '2026-10-19T10:00:00.000Z'

function series(lastDay: number, launches: number[]): ActiveAccountsStats['series'] {
  return launches.map((value, index) => ({
    day: `2026-10-${String(lastDay - launches.length + 1 + index).padStart(2, '0')}`,
    activeAccounts: 0,
    uniquePlayers: 0,
    launches: value,
    deletedSeats: 0,
    newAccounts: 0,
    newGuests: 0,
  }))
}

function stats(overrides: Partial<Pick<ActiveAccountsStats, 'coverage' | 'series'>> = {}) {
  return {
    computedAt: COMPUTED_AT,
    coverage: { journalSince: '2026-09-01', visitsSince: '2026-09-10' },
    accounts: {
      onlineNow: 1,
      active: { d1: 3, d7: 12, d30: 40 },
      guests: { d1: 1, d7: 4, d30: 9 },
      newAccounts: { d7: 5, d30: 20 },
      returning: { d7: 7, d30: 20 },
      idleGuests: { d7: 0, d30: 0 },
      staffExcluded: 2,
      testExcluded: 0,
    },
    series: series(19, [1, 1, 1, 1, 1, 1, 1, 2, 3, 0, 4, 1, 5, 6]),
    ...overrides,
  }
}

describe('accountsCoverageSince', () => {
  it('la plus ancienne des deux sources', () => {
    expect(accountsCoverageSince({ journalSince: '2026-09-05', visitsSince: '2026-09-01' })).toBe('2026-09-01')
    expect(accountsCoverageSince({ journalSince: '2026-09-05', visitsSince: '2026-09-09' })).toBe('2026-09-05')
    expect(accountsCoverageSince({ journalSince: '2026-09-05', visitsSince: null })).toBe('2026-09-05')
  })
})

describe('partialSince', () => {
  it('fenêtre entièrement couverte : null ; source plus jeune : son premier jour', () => {
    const at = new Date(COMPUTED_AT)
    expect(partialSince(7, at, '2026-10-13')).toBeNull()
    expect(partialSince(7, at, '2026-10-14')).toBe('2026-10-14')
    expect(partialSince(1, at, '2026-10-19')).toBeNull()
  })
})

describe('weekFigures', () => {
  it('reprend les effectifs de 7 jours et additionne les 7 derniers jours de parties', () => {
    expect(weekFigures(stats())).toEqual({
      activeAccounts: 12,
      guests: 4,
      returning: 7,
      launches: 2 + 3 + 0 + 4 + 1 + 5 + 6,
      accountsSince: null,
      launchesSince: null,
    })
  })

  it('journal plus jeune que la semaine : les parties le disent, pas les comptes couverts par les visites', () => {
    const figures = weekFigures(stats({ coverage: { journalSince: '2026-10-16', visitsSince: '2026-09-10' } }))
    expect(figures.launchesSince).toBe('2026-10-16')
    expect(figures.accountsSince).toBeNull()
  })

  it('sans visites ni journal assez anciens : les deux intitulés le disent', () => {
    const figures = weekFigures(stats({ coverage: { journalSince: '2026-10-16', visitsSince: null } }))
    expect(figures.accountsSince).toBe('2026-10-16')
    expect(figures.launchesSince).toBe('2026-10-16')
  })

  it('série plus courte que 7 jours : additionne ce qu’elle a', () => {
    expect(weekFigures(stats({ series: series(19, [2, 3]) })).launches).toBe(5)
  })
})
