import { describe, expect, it } from 'vitest'
import { DECLINE_COOLDOWN_MS, isDeclineCooldownActive } from './friends'

describe('isDeclineCooldownActive — relance après un refus', () => {
  const now = new Date('2026-09-10T12:00:00.000Z')

  it('bloque une relance immédiate', () => {
    expect(isDeclineCooldownActive(now, now)).toBe(true)
  })

  it('bloque une relance le lendemain', () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    expect(isDeclineCooldownActive(yesterday, now)).toBe(true)
  })

  it('autorise la relance une fois le délai écoulé', () => {
    const old = new Date(now.getTime() - DECLINE_COOLDOWN_MS - 1)
    expect(isDeclineCooldownActive(old, now)).toBe(false)
  })

  it('laisse passer un refus sans horodatage (données antérieures au délai)', () => {
    expect(isDeclineCooldownActive(null, now)).toBe(false)
  })
})
