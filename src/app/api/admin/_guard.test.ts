import { describe, expect, it } from 'vitest'
import { parsePaging } from './_guard'

/**
 * Bornage de la pagination de /api/admin (F40/F75) : une page demandée par le
 * client ne doit jamais pouvoir faire lire la base en entier, ni produire un
 * `skip` négatif.
 */
describe('parsePaging', () => {
  const opts = { defaultSize: 25, maxSize: 100 }
  const parse = (qs: string) => parsePaging(new URLSearchParams(qs), opts)

  it('retombe sur la première page à la taille par défaut', () => {
    expect(parse('')).toEqual({ page: 1, pageSize: 25, skip: 0 })
  })

  it('calcule le décalage de la page demandée', () => {
    expect(parse('page=3&pageSize=10')).toEqual({ page: 3, pageSize: 10, skip: 20 })
  })

  it('plafonne la taille de page réclamée', () => {
    expect(parse('pageSize=100000').pageSize).toBe(100)
  })

  it('refuse les pages et tailles absurdes sans jamais produire un skip négatif', () => {
    for (const qs of ['page=0', 'page=-4', 'page=abc', 'page=NaN', 'pageSize=0', 'pageSize=-10', 'pageSize=x']) {
      const result = parse(qs)
      expect(result.page).toBeGreaterThanOrEqual(1)
      expect(result.pageSize).toBeGreaterThanOrEqual(1)
      expect(result.pageSize).toBeLessThanOrEqual(opts.maxSize)
      expect(result.skip).toBeGreaterThanOrEqual(0)
    }
  })
})
