import { describe, expect, it } from 'vitest'
import type { GameCategory } from '@/lib/game-catalog'
import { categoriesToOffer, filterByCategory, resolveActiveCategory } from './category-filter'

const category = (id: string, gameIds: string[]): GameCategory => ({ id, names: { fr: id }, gameIds })

const CATEGORIES = [category('calme', ['a', 'b']), category('chaud', ['c']), category('vide', [])]

describe('categoriesToOffer', () => {
  it('garde les catégories qui ont au moins un jeu affiché', () => {
    expect(categoriesToOffer(CATEGORIES, new Set(['b', 'z'])).map((c) => c.id)).toEqual(['calme'])
    expect(categoriesToOffer(CATEGORIES, new Set(['a', 'c'])).map((c) => c.id)).toEqual(['calme', 'chaud'])
  })

  it('ne propose rien quand aucun jeu rangé n’est affiché', () => {
    expect(categoriesToOffer(CATEGORIES, new Set(['z']))).toEqual([])
    expect(categoriesToOffer([], new Set(['a']))).toEqual([])
  })
})

describe('resolveActiveCategory', () => {
  it('retombe sur « Toutes » quand la catégorie a disparu', () => {
    expect(resolveActiveCategory(CATEGORIES, 'chaud')?.id).toBe('chaud')
    expect(resolveActiveCategory(CATEGORIES, 'supprimee')).toBeNull()
    expect(resolveActiveCategory(CATEGORIES, null)).toBeNull()
  })
})

describe('filterByCategory', () => {
  const games = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('ne garde que les jeux de la catégorie, dans l’ordre du catalogue', () => {
    expect(filterByCategory(games, CATEGORIES[0]).map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('rend tous les jeux sans catégorie active', () => {
    expect(filterByCategory(games, null)).toEqual(games)
  })
})
