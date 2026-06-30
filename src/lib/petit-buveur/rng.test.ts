import { describe, it, expect } from 'vitest'
import { createRng, rngFromState, hashSeed } from './rng'

describe('petit-buveur RNG seedé', () => {
  it('est déterministe : même graine ⇒ même séquence', () => {
    const a = createRng('partie-42')
    const b = createRng('partie-42')
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produit des séquences différentes pour des graines différentes', () => {
    const a = Array.from({ length: 20 }, (_, i) => createRng('A').int(1, 6) + i)
    const b = Array.from({ length: 20 }, (_, i) => createRng('B').int(1, 6) + i)
    // Au moins une différence sur la première valeur tirée
    expect(createRng('A').next()).not.toEqual(createRng('B').next())
    expect(a).not.toEqual(b)
  })

  it('int(min,max) reste dans les bornes inclusives', () => {
    const rng = createRng('bornes')
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.int(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('chance(0) toujours faux, chance(1) toujours vrai', () => {
    const rng = createRng('chance')
    for (let i = 0; i < 100; i += 1) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })

  it('pickIndex reste dans [0, length)', () => {
    const rng = createRng('idx')
    for (let i = 0; i < 500; i += 1) {
      const idx = rng.pickIndex(4)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(4)
    }
  })

  it('shuffle est une permutation (mêmes éléments) et déterministe', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const s1 = createRng('shuf').shuffle(input)
    const s2 = createRng('shuf').shuffle(input)
    expect(s1).toEqual(s2)
    expect([...s1].sort((a, b) => a - b)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]) // entrée non mutée
  })

  it('weightedPick respecte grossièrement les poids', () => {
    const rng = createRng('weights')
    const entries = [
      { id: 'rare', weight: 1 },
      { id: 'commun', weight: 9 },
    ]
    const counts = { rare: 0, commun: 0 }
    for (let i = 0; i < 2000; i += 1) {
      counts[rng.weightedPick(entries).id as 'rare' | 'commun'] += 1
    }
    expect(counts.commun).toBeGreaterThan(counts.rare)
    // ~90/10 attendu : le commun doit largement dominer
    expect(counts.commun).toBeGreaterThan(1500)
  })

  it("permet de reprendre depuis l'état persistant", () => {
    const rng = createRng('persist')
    // Avance de quelques tirages
    rng.next()
    rng.next()
    const saved = rng.getState()
    const continued = Array.from({ length: 5 }, () => rng.next())

    // Un RNG repris depuis l'état sauvegardé produit la même suite
    const resumed = rngFromState(saved)
    const resumedSeq = Array.from({ length: 5 }, () => resumed.next())
    expect(resumedSeq).toEqual(continued)
  })

  it('hashSeed est stable et borné en uint32', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    const h = hashSeed('quelque-graine')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})
