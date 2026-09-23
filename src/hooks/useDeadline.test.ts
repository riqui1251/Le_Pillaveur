import { describe, expect, it } from 'vitest'
import { MAX_TIMEOUT_MS, deadlineDelayMs, deadlinePassed } from './useDeadline'

/**
 * Le hook remplace des comparaisons du type `Math.max(0, stopAt - clock) === 0`
 * ou `clock - leftAt < GRACE` : la frontière doit être la même (inclusive à
 * l'échéance) et le minuteur doit viser cet instant précis.
 */

describe('deadlinePassed', () => {
  it('bascule exactement à l’échéance, pas avant', () => {
    expect(deadlinePassed(10_000, 9_999)).toBe(false)
    expect(deadlinePassed(10_000, 10_000)).toBe(true)
    expect(deadlinePassed(10_000, 10_001)).toBe(true)
  })

  it('reproduit « max(0, endsAt - now) === 0 »', () => {
    for (const now of [0, 9_999, 10_000, 15_000]) {
      expect(deadlinePassed(10_000, now)).toBe(Math.max(0, 10_000 - now) === 0)
    }
  })

  it('n’arrive jamais sans échéance', () => {
    expect(deadlinePassed(null, 10_000)).toBe(false)
    expect(deadlinePassed(undefined, 10_000)).toBe(false)
  })
})

describe('deadlineDelayMs', () => {
  it('vise l’échéance', () => {
    expect(deadlineDelayMs(10_000, 4_000)).toBe(6_000)
  })

  it('ne remonte pas le temps', () => {
    expect(deadlineDelayMs(10_000, 12_000)).toBe(0)
  })

  it('reste sous le plafond de setTimeout', () => {
    expect(deadlineDelayMs(Number.MAX_SAFE_INTEGER, 0)).toBe(MAX_TIMEOUT_MS)
  })
})
