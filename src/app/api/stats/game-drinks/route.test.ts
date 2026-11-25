import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/stats/game-drinks — public. Vraie route, vrai classement et vrai
 * catalogue ; seule la base est simulée.
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    gameDrinkDaily: { findMany: vi.fn() },
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { GET } from './route'
import { invalidateGameCatalogCaches } from '@/lib/game-catalog-server'
import { STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'
import { parseSiteDrinkRanking } from '@/lib/game-drinks'
import { GAMES } from '@/lib/games'
import { parisDayString } from '@/lib/paris-time'

const [A, B, C] = STAFF_TOGGLEABLE_GAME_IDS
const CODE_HIDDEN = GAMES.find((game) => game.hidden)?.id
const today = parisDayString()
const row = (gameId: string, mode: 'local' | 'online', drinks: number, plays: number) => ({ day: today, gameId, mode, drinks, plays })

beforeEach(() => {
  vi.resetAllMocks()
  invalidateGameCatalogCaches({ forget: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  prismaMock.siteSetting.findUnique.mockResolvedValue(null)
  prismaMock.gameDrinkDaily.findMany.mockResolvedValue([])
})

describe('GET /api/stats/game-drinks', () => {
  it('classe les jeux local + en ligne additionnés, avec un cache CDN court', async () => {
    prismaMock.gameDrinkDaily.findMany.mockResolvedValue([
      row(A, 'local', 60, 30),
      row(B, 'local', 90, 18),
      row(B, 'online', 90, 18),
    ])

    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600')
    const body = await res.json()
    expect(parseSiteDrinkRanking(body)).toEqual(body)
    expect(body.days).toBe(90)
    expect(body.minPlays).toBe(30)
    expect(body.games).toEqual([
      { gameId: B, drinks: 180, plays: 36, perPlay: 5, localPlays: 18, onlinePlays: 18 },
      { gameId: A, drinks: 60, plays: 30, perPlay: 2, localPlays: 30, onlinePlays: 0 },
    ])
  })

  it('écarte les jeux cachés par l’équipe ou par le code, et ceux sous le seuil', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([A]) })
    prismaMock.gameDrinkDaily.findMany.mockResolvedValue([
      row(A, 'local', 150, 30),
      row(B, 'online', 29, 29),
      row(C, 'local', 30, 30),
      ...(CODE_HIDDEN ? [row(CODE_HIDDEN, 'local', 270, 30)] : []),
    ])

    const body = await (await GET()).json()

    expect(body.games.map((g: { gameId: string }) => g.gameId)).toEqual([C])
  })

  it('ne renvoie que des compteurs par jeu, rien qui désigne un joueur', async () => {
    prismaMock.gameDrinkDaily.findMany.mockResolvedValue([row(A, 'local', 60, 30)])

    const body = await (await GET()).json()

    expect(Object.keys(body).sort()).toEqual(['days', 'games', 'minPlays'])
    expect(Object.keys(body.games[0]).sort()).toEqual(['drinks', 'gameId', 'localPlays', 'onlinePlays', 'perPlay', 'plays'])
  })

  it('base illisible : 500 server_error en JSON, jamais une page HTML', async () => {
    prismaMock.gameDrinkDaily.findMany.mockRejectedValue(Object.assign(new Error('no such table'), { code: 'P2021' }))

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'server_error' })
  })
})

describe('parseSiteDrinkRanking', () => {
  it('refuse une réponse illisible et écarte les lignes mal formées', () => {
    expect(parseSiteDrinkRanking(null)).toBeNull()
    expect(parseSiteDrinkRanking({ error: 'server_error' })).toBeNull()
    const ok = { gameId: A, drinks: 4, plays: 2, perPlay: 2, localPlays: 2, onlinePlays: 0 }
    expect(
      parseSiteDrinkRanking({ days: 90, minPlays: 10, games: [ok, { ...ok, plays: 0 }, { ...ok, drinks: -1 }, 'x'] })
    ).toEqual({ days: 90, minPlays: 10, games: [ok] })
  })
})
