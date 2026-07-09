import { describe, expect, it } from 'vitest'
import { IMPOSTEUR_PAIRS_FR } from './fr'
import { IMPOSTEUR_PAIRS_EN } from './en'
import { IMPOSTEUR_PAIRS_ES } from './es'
import { IMPOSTEUR_PAIRS_IT } from './it'
import type { ImposteurWordPair } from '../engine'

const POOLS: Record<string, ImposteurWordPair[]> = {
  fr: IMPOSTEUR_PAIRS_FR,
  en: IMPOSTEUR_PAIRS_EN,
  es: IMPOSTEUR_PAIRS_ES,
  it: IMPOSTEUR_PAIRS_IT,
}

/** Garde-fou du contenu écrit à la main (paires proches, sans doublons). */
describe('imposteur data', () => {
  for (const [lang, pool] of Object.entries(POOLS)) {
    it(`${lang} : au moins 180 paires valides, sans doublon ni auto-paire`, () => {
      expect(pool.length).toBeGreaterThanOrEqual(180)
      const seen = new Set<string>()
      for (const { a, b } of pool) {
        expect(a.length).toBeGreaterThan(0)
        expect(b.length).toBeGreaterThan(0)
        expect(a.toLowerCase()).not.toBe(b.toLowerCase())
        const key = [a.toLowerCase(), b.toLowerCase()].sort().join('|')
        expect(seen.has(key), `paire dupliquée: ${a} / ${b}`).toBe(false)
        seen.add(key)
      }
    })
  }
})
