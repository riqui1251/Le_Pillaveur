import { describe, expect, it } from 'vitest'
import { chiffrePiegeMark, chiffrePiegeZone, readChiffrePiegeInput, sanitizeChiffrePiegeInput } from './display'

describe('saisie du nombre', () => {
  it('ne garde que les chiffres, trois au plus', () => {
    expect(sanitizeChiffrePiegeInput(' 3a9 ')).toBe('39')
    expect(sanitizeChiffrePiegeInput('-5')).toBe('5')
    expect(sanitizeChiffrePiegeInput('12,5')).toBe('125')
    expect(sanitizeChiffrePiegeInput('1234')).toBe('123')
    expect(sanitizeChiffrePiegeInput('')).toBe('')
  })

  it('dit si le nombre tombe dans l’intervalle ouvert, bornes comprises', () => {
    expect(readChiffrePiegeInput('', 31, 47)).toEqual({ status: 'empty' })
    expect(readChiffrePiegeInput('abc', 31, 47)).toEqual({ status: 'empty' })
    expect(readChiffrePiegeInput('39', 31, 47)).toEqual({ status: 'ok', value: 39 })
    expect(readChiffrePiegeInput('31', 31, 47)).toEqual({ status: 'ok', value: 31 })
    expect(readChiffrePiegeInput('47', 31, 47)).toEqual({ status: 'ok', value: 47 })
    expect(readChiffrePiegeInput('039', 31, 47)).toEqual({ status: 'ok', value: 39 })
    expect(readChiffrePiegeInput('30', 31, 47)).toEqual({ status: 'out-of-range', value: 30 })
    expect(readChiffrePiegeInput('0', 1, 100)).toEqual({ status: 'out-of-range', value: 0 })
  })
})

describe('barre 1 → max', () => {
  it('place l’intervalle encore ouvert', () => {
    expect(chiffrePiegeZone({ low: 1, high: 100, max: 100 })).toEqual({ left: 0, width: 100 })
    expect(chiffrePiegeZone({ low: 31, high: 47, max: 100 })).toEqual({ left: 30, width: 17 })
    expect(chiffrePiegeZone({ low: 42, high: 42, max: 50 })).toEqual({ left: 82, width: 2 })
  })

  it('pose le repère de la saisie au milieu de sa case', () => {
    expect(chiffrePiegeMark(1, 100)).toBe(0.5)
    expect(chiffrePiegeMark(100, 100)).toBe(99.5)
    expect(chiffrePiegeMark(25, 50)).toBe(49)
  })
})
