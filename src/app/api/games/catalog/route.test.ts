import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/games/catalog — public. Vraie route et vrai serveur de catalogue ;
 * seule la base est simulée, pour vérifier aussi qu'une table absente ne
 * donne jamais de 500.
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    onlineGameSession: { groupBy: vi.fn() },
    localGameDaily: { groupBy: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { GET } from './route'
import { invalidateGameCatalogCaches } from '@/lib/game-catalog-server'
import { STAFF_TOGGLEABLE_GAME_IDS, parseGameCatalogState } from '@/lib/game-catalog'
import { GAMES } from '@/lib/games'

const [A] = STAFF_TOGGLEABLE_GAME_IDS

beforeEach(() => {
  vi.resetAllMocks()
  invalidateGameCatalogCaches({ forget: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  prismaMock.siteSetting.findUnique.mockResolvedValue(null)
  prismaMock.onlineGameSession.groupBy.mockResolvedValue([])
  prismaMock.localGameDaily.groupBy.mockResolvedValue([])
})

describe('GET /api/games/catalog', () => {
  it('sert l’état du catalogue en JSON, sans compte, avec un cache navigateur court', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([A]) })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30, stale-while-revalidate=120')
    const body = await res.json()
    expect(body.hiddenIds).toEqual([A])
    expect(parseGameCatalogState(body)).toEqual(body)
    expect(body.popular.local).not.toContain(A)
    expect(body.popular.online).not.toContain(A)
  })

  it('sert aussi les difficultés réglées, seulement celles qui diffèrent du code', async () => {
    const [A, B] = STAFF_TOGGLEABLE_GAME_IDS
    const codeA = GAMES.find((g) => g.id === A)!.difficulty
    const codeB = GAMES.find((g) => g.id === B)!.difficulty
    const levelA = codeA === 3 ? 1 : codeA + 1
    prismaMock.siteSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key === 'games.difficulty' ? { value: JSON.stringify({ [A]: levelA, [B]: codeB }) } : null
    )

    const body = await (await GET()).json()

    expect(body.difficulty).toEqual({ [A]: levelA })
    expect(parseGameCatalogState(body)).toEqual(body)
  })

  it('sert aussi les niveaux « fait boire » réglés, seulement ceux qui diffèrent du code', async () => {
    const [A, B] = STAFF_TOGGLEABLE_GAME_IDS
    const codeA = GAMES.find((g) => g.id === A)!.drinkLevel
    const codeB = GAMES.find((g) => g.id === B)!.drinkLevel
    const levelA = codeA === 3 ? 1 : codeA + 1
    prismaMock.siteSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key === 'games.drinkLevel' ? { value: JSON.stringify({ [A]: levelA, [B]: codeB }) } : null
    )

    const body = await (await GET()).json()

    expect(body.drinkLevel).toEqual({ [A]: levelA })
    expect(body.difficulty).toEqual({})
    expect(parseGameCatalogState(body)).toEqual(body)
  })

  it('sert aussi les catégories, dans leur ordre, jeux dans l’ordre du catalogue', async () => {
    const [A, B] = STAFF_TOGGLEABLE_GAME_IDS
    const stored = [
      { id: 'zeta', names: { fr: 'Zeta', en: 'Zed' }, gameIds: [B, A] },
      { id: 'alpha', names: { fr: 'Alpha' }, gameIds: [] },
    ]
    prismaMock.siteSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key === 'games.categories' ? { value: JSON.stringify(stored) } : null
    )

    const body = await (await GET()).json()

    expect(body.categories).toEqual([
      { id: 'zeta', names: { fr: 'Zeta', en: 'Zed' }, gameIds: [A, B] },
      { id: 'alpha', names: { fr: 'Alpha' }, gameIds: [] },
    ])
    expect(parseGameCatalogState(body)).toEqual(body)
  })

  it('une catégorie abîmée en base : liste vide, jamais 500', async () => {
    prismaMock.siteSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key === 'games.categories' ? { value: '{pas du json' } : null
    )
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).categories).toEqual([])
  })

  it('base illisible (table absente) : 200 avec aucun jeu caché, jamais 500', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(Object.assign(new Error('no such table'), { code: 'P2021' }))
    prismaMock.onlineGameSession.groupBy.mockRejectedValue(new Error('no such table'))
    prismaMock.localGameDaily.groupBy.mockRejectedValue(new Error('no such table'))

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hiddenIds).toEqual([])
    expect(body.difficulty).toEqual({})
    expect(body.drinkLevel).toEqual({})
    expect(body.categories).toEqual([])
    expect(parseGameCatalogState(body)).not.toBeNull()
  })
})
