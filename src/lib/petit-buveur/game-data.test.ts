import { describe, it, expect } from 'vitest'
import { DEFI_DRINKS, DEFI_COUNT, DEFI_VERIFIABLE_ONLINE } from './game-data'

describe('game-data Petit Buveur', () => {
  it('expose une liste de gorgées par défi non vide', () => {
    expect(DEFI_COUNT).toBeGreaterThan(0)
    expect(DEFI_DRINKS).toHaveLength(DEFI_COUNT)
  })

  it('chaque défi a un nombre de gorgées entier positif', () => {
    for (const d of DEFI_DRINKS) {
      expect(Number.isInteger(d)).toBe(true)
      expect(d).toBeGreaterThan(0)
    }
  })

  it('le drapeau verifiableOnline est aligné sur la liste', () => {
    expect(DEFI_VERIFIABLE_ONLINE).toHaveLength(DEFI_COUNT)
    expect(DEFI_VERIFIABLE_ONLINE.every((b) => typeof b === 'boolean')).toBe(true)
  })
})
