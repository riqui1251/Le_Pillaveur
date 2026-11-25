import { describe, expect, it } from 'vitest'
import { countHidden, parseAdminGameCatalog } from './game-catalog-panel'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'pmu',
  hidden: false,
  difficulty: 2,
  defaultDifficulty: 2,
  drinkLevel: 2,
  defaultDrinkLevel: 2,
  plays: { online: 3, local: 4, total: 7 },
  popularLocalRank: 1,
  popularOnlineRank: null,
  ...over,
})
const body = (over: Record<string, unknown> = {}) => ({ canEdit: true, retiredCount: 2, games: [row()], ...over })

describe('parseAdminGameCatalog', () => {
  it('lit une réponse complète', () => {
    expect(parseAdminGameCatalog(body())).toEqual(body())
  })

  it('accepte une liste vide', () => {
    expect(parseAdminGameCatalog(body({ games: [] }))?.games).toEqual([])
  })

  it.each([null, undefined, 'x', 3, [], {}])('refuse %j', (value) => {
    expect(parseAdminGameCatalog(value)).toBeNull()
  })

  it('refuse un champ de tête manquant ou mal typé', () => {
    expect(parseAdminGameCatalog(body({ canEdit: 'oui' }))).toBeNull()
    expect(parseAdminGameCatalog(body({ retiredCount: -1 }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: {} }))).toBeNull()
  })

  it('refuse toute la réponse si une ligne est abîmée', () => {
    expect(parseAdminGameCatalog(body({ games: [row(), row({ hidden: 'non' })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ plays: null })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ plays: { online: 1, local: 1, total: NaN } })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ popularLocalRank: 0 })] }))).toBeNull()
  })

  it('lit une difficulté réglée par l’équipe', () => {
    const parsed = parseAdminGameCatalog(body({ games: [row({ difficulty: 3, defaultDifficulty: 1 })] }))
    expect(parsed?.games[0]).toMatchObject({ difficulty: 3, defaultDifficulty: 1 })
  })

  it('refuse une ligne sans difficulté valide (serveur plus ancien ou réponse abîmée)', () => {
    const { difficulty: _d, defaultDifficulty: _e, ...old } = row()
    expect(parseAdminGameCatalog(body({ games: [old] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ difficulty: 4 })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ difficulty: 0 })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ difficulty: 2.5 })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ difficulty: '2' })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ defaultDifficulty: null })] }))).toBeNull()
  })

  it('lit un barème « fait boire » réglé par l’équipe', () => {
    const parsed = parseAdminGameCatalog(body({ games: [row({ drinkLevel: 3, defaultDrinkLevel: 1 })] }))
    expect(parsed?.games[0]).toMatchObject({ drinkLevel: 3, defaultDrinkLevel: 1 })
  })

  it('refuse une ligne sans barème « fait boire » valide (serveur plus ancien ou réponse abîmée)', () => {
    const { drinkLevel: _d, defaultDrinkLevel: _e, ...old } = row()
    expect(parseAdminGameCatalog(body({ games: [old] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ drinkLevel: 4 })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ drinkLevel: 0 })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ drinkLevel: '2' })] }))).toBeNull()
    expect(parseAdminGameCatalog(body({ games: [row({ defaultDrinkLevel: null })] }))).toBeNull()
  })

  it('ne garde que les champs du contrat', () => {
    const parsed = parseAdminGameCatalog(body({ games: [row({ extra: 1 })], other: true }))
    expect(parsed).toEqual(body())
  })
})

describe('countHidden', () => {
  it('compte les jeux cachés', () => {
    const rows = [row(), row({ id: 'a', hidden: true }), row({ id: 'b', hidden: true })] as never
    expect(countHidden(rows)).toBe(2)
    expect(countHidden([])).toBe(0)
  })
})
