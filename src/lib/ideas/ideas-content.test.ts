import { describe, expect, it } from 'vitest'
import { IDEAS_SLUGS, loadIdeasDoc } from './ideas-content'

const HEALTH_NOTICE = "L'abus d'alcool est dangereux pour la santé."
const ENTRIES_MIN = 40
const ENTRIES_MAX = 60

describe('listes de questions (docs/ideas/fr/)', () => {
  for (const slug of IDEAS_SLUGS) {
    describe(`${slug}.md`, () => {
      const doc = loadIdeasDoc(slug)

      it('existe', () => {
        expect(doc).toBeTruthy()
      })

      it('porte la mention sanitaire une seule fois', () => {
        expect(doc!.split(HEALTH_NOTICE).length - 1).toBe(1)
      })

      it(`contient de ${ENTRIES_MIN} à ${ENTRIES_MAX} entrées, autant que son titre en annonce`, () => {
        const entries = doc!.split('\n').filter((line) => line.startsWith('- ')).length
        expect(entries).toBeGreaterThanOrEqual(ENTRIES_MIN)
        expect(entries).toBeLessThanOrEqual(ENTRIES_MAX)
        const announced = Number(doc!.split('\n')[0].match(/(\d+)/)?.[1])
        expect(announced).toBe(entries)
      })

      it('mène au jeu et à une autre liste', () => {
        expect(doc).toMatch(/\]\(\/games\/[a-z-]+\)/)
        expect(doc).toMatch(/\]\(\/idees\/[a-z-]+\)/)
      })
    })
  }
})
