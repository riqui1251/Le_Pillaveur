import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/rankings/drinks — classement des comptes par gorgées bues
 * en ligne. Vraie route, vrai classement et vrai catalogue ; session et base
 * simulées.
 */

const { prismaMock, userMock } = vi.hoisted(() => ({
  prismaMock: {
    onlineDrinkResult: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  userMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))

import { GET } from './route'
import { invalidateGameCatalogCaches } from '@/lib/game-catalog-server'
import { STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'

const [A, B] = STAFF_TOGGLEABLE_GAME_IDS

/** Sept comptes sur A (u1 boit le plus), un seul sur B. */
const GROUPED = [
  ...Array.from({ length: 7 }, (_, i) => ({ gameId: A, userId: `u${i + 1}`, _sum: { drinks: 70 - i * 10 }, _count: { _all: 2 } })),
  { gameId: B, userId: 'u1', _sum: { drinks: 4 }, _count: { _all: 1 } },
]
const USERS = Array.from({ length: 7 }, (_, i) => ({
  id: `u${i + 1}`,
  displayName: `Pseudo${i + 1}`,
  onlineDisplayName: null,
  onlinePreferencesJson: null,
}))

beforeEach(() => {
  vi.resetAllMocks()
  invalidateGameCatalogCaches({ forget: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  prismaMock.siteSetting.findUnique.mockResolvedValue(null)
  prismaMock.onlineDrinkResult.groupBy.mockResolvedValue(GROUPED)
  prismaMock.user.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    USERS.filter((u) => where.id.in.includes(u.id))
  )
  userMock.mockResolvedValue(null)
})

describe('GET /api/online/rankings/drinks', () => {
  it('visiteur : rangs et chiffres sans pseudo ni id, `signedIn: false`, jamais en cache partagé', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const text = await res.text()
    for (const leak of ['u1', 'u6', 'Pseudo']) expect(text).not.toContain(leak)
    const body = JSON.parse(text)
    expect(body.signedIn).toBe(false)
    expect(body.top).toBe(5)
    expect(body.boards.map((b: { gameId: string }) => b.gameId)).toEqual([A, B])
    expect(body.boards[0].totalPlayers).toBe(7)
    expect(body.boards[0].me).toBeNull()
    expect(body.boards[0].rows).toHaveLength(5)
    expect(body.boards[0].rows[0]).toEqual({ userId: `${A}#1`, displayName: null, preferences: {}, drinks: 70, games: 2, position: 1 })
  })

  it('connecté : pseudos, et sa ligne hors du top avec sa vraie position', async () => {
    userMock.mockResolvedValue({ id: 'u6', role: 'user' })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.signedIn).toBe(true)
    expect(body.boards[0].rows.map((r: { displayName: string }) => r.displayName)).toEqual([
      'Pseudo1',
      'Pseudo2',
      'Pseudo3',
      'Pseudo4',
      'Pseudo5',
    ])
    expect(body.boards[0].me).toMatchObject({ userId: 'u6', displayName: 'Pseudo6', drinks: 20, games: 2, position: 6 })
    expect(body.boards[1].me).toBeNull()
  })

  it('jeu caché par l’équipe : absent du classement', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify([A]) })

    const body = await (await GET()).json()

    expect(body.boards.map((b: { gameId: string }) => b.gameId)).toEqual([B])
  })

  it('base illisible : 500 server_error en JSON, jamais une page HTML', async () => {
    prismaMock.onlineDrinkResult.groupBy.mockRejectedValue(Object.assign(new Error('no such table'), { code: 'P2021' }))

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'server_error' })
  })
})
