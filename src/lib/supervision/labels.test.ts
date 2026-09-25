import { describe, expect, it } from 'vitest'
import { idleLabel, rateLabel } from '@/lib/supervision/labels'

describe('rateLabel', () => {
  it('« — » pour un taux non calculable, jamais « 0 % »', () => {
    expect(rateLabel(null)).toBe('—')
    expect(rateLabel(0 / 0)).toBe('—')
    expect(rateLabel(1 / 0)).toBe('—')
  })

  it('arrondit au pour-cent le plus proche, bornes comprises', () => {
    expect(rateLabel(0)).toBe('0 %')
    expect(rateLabel(0.004)).toBe('0 %')
    expect(rateLabel(0.005)).toBe('1 %')
    expect(rateLabel(0.5)).toBe('50 %')
    expect(rateLabel(0.994)).toBe('99 %')
    expect(rateLabel(0.995)).toBe('100 %')
    expect(rateLabel(1)).toBe('100 %')
  })
})

describe('idleLabel', () => {
  it('jamais « 0 min » : une table figée depuis quelques secondes affiche 1 min', () => {
    expect(idleLabel(0)).toBe('1 min')
    expect(idleLabel(59)).toBe('1 min')
    expect(idleLabel(119)).toBe('1 min')
    // Horloges décalées : une durée négative reste lisible.
    expect(idleLabel(-30)).toBe('1 min')
  })

  it('minutes pleines sous l’heure', () => {
    expect(idleLabel(120)).toBe('2 min')
    expect(idleLabel(3599)).toBe('59 min')
  })

  it('heures et minutes sur deux chiffres à partir de 60 min', () => {
    expect(idleLabel(3600)).toBe('1 h 00')
    expect(idleLabel(3660)).toBe('1 h 01')
    expect(idleLabel(7199)).toBe('1 h 59')
    expect(idleLabel(25 * 3600)).toBe('25 h 00')
  })
})
