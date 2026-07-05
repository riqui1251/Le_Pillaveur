import { describe, expect, it } from 'vitest'
import { getQuizQuestions } from './index'

/** Garde-fou du contenu écrit à la main (4 langues × 120 questions). */
describe('quiz data', () => {
  for (const lang of ['fr', 'en', 'es', 'it'] as const) {
    it(`${lang} : 120 questions valides (ids uniques, 4 choix, réponse 0-3)`, () => {
      const pool = getQuizQuestions(lang)
      expect(pool.length).toBe(120)
      expect(new Set(pool.map((q) => q.id)).size).toBe(pool.length)
      for (const q of pool) {
        expect(q.id.startsWith(`${lang}-`)).toBe(true)
        expect(q.choices).toHaveLength(4)
        expect(new Set(q.choices).size, `choix dupliqués: ${q.id}`).toBe(4)
        expect(q.answer).toBeGreaterThanOrEqual(0)
        expect(q.answer).toBeLessThanOrEqual(3)
        expect([1, 2, 3]).toContain(q.diff)
        expect(q.q.length).toBeGreaterThan(5)
      }
      // 6 catégories × 20.
      const byCat = new Map<string, number>()
      for (const q of pool) byCat.set(q.cat, (byCat.get(q.cat) ?? 0) + 1)
      expect([...byCat.values()]).toEqual([20, 20, 20, 20, 20, 20])
    })
  }

  it('langue inconnue → repli sur le français', () => {
    expect(getQuizQuestions('de')).toBe(getQuizQuestions('fr'))
  })
})
