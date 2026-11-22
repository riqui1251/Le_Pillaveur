import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/first-game-feedback/reviews — avis de 1re partie un par un,
 * avec leur auteur. Vraie route, vraie garde, vrais rôles et vraie
 * pagination ; session et lecture des avis simulées.
 */

const { userMock, listMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  listMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/first-game-feedback-server', () => ({ listFirstGameReviews: listMock }))

import { GET } from './route'

const get = (query = '') => GET(new Request(`http://localhost/api/admin/first-game-feedback/reviews${query}`))

const REVIEW = {
  id: 'first-game-abc',
  rating: 4,
  gameId: 'loup-garou',
  playMode: 'online',
  comment: '',
  createdAt: '2026-11-20T21:00:00.000Z',
  author: { kind: 'account', userId: 'u-alice', name: 'Alice', isGuest: false },
}

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'staff', role: 'moderator' })
  listMock.mockResolvedValue({ reviews: [REVIEW], total: 1 })
})

describe('GET /api/admin/first-game-feedback/reviews — accès', () => {
  it.each([['moderator'], ['admin'], ['superadmin'], ['fondateur']])('%s : avis servis, auteur compris', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reviews: [REVIEW], total: 1, page: 1, pageSize: 10 })
  })

  it.each([['user'], [null]])('%s : 403 codé, sans la moindre lecture', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)

    const res = await get()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden', code: 'forbidden' })
    expect(listMock).not.toHaveBeenCalled()
  })

  it('panne de la base : 500 codé, jamais une page HTML', async () => {
    listMock.mockRejectedValueOnce(new Error('SQLITE_BUSY'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await get()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server_error', code: 'server_error' })
  })
})

describe('GET /api/admin/first-game-feedback/reviews — filtre et pagination', () => {
  it('sans filtre : tous les jeux, première page de 10', async () => {
    await get()

    expect(listMock).toHaveBeenCalledWith({ gameId: null, skip: 0, take: 10 })
  })

  it('filtre par jeu transmis tel quel', async () => {
    await get('?gameId=loup-garou&page=2')

    expect(listMock).toHaveBeenCalledWith({ gameId: 'loup-garou', skip: 10, take: 10 })
  })

  it('identifiant commençant par un chiffre (« 1220 ») accepté ; filtre vide = tous les jeux', async () => {
    await get('?gameId=1220')
    expect(listMock).toHaveBeenLastCalledWith({ gameId: '1220', skip: 0, take: 10 })

    await get('?gameId=')
    expect(listMock).toHaveBeenLastCalledWith({ gameId: null, skip: 0, take: 10 })
  })

  it.each([['?gameId=LOUP'], ['?gameId=%27%3B--'], ['?gameId=-tiret'], [`?gameId=${'a'.repeat(65)}`]])(
    'identifiant de jeu mal formé %s : 400 invalid_game, sans lecture',
    async (query) => {
      const res = await get(query)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_game', code: 'invalid_game' })
      expect(listMock).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['?pageSize=500', 1, 50],
    ['?page=0&pageSize=0', 1, 10],
    ['?page=abc&pageSize=-3', 1, 10],
    ['?page=3&pageSize=20', 3, 20],
  ])('paramètres %s bornés : page %i, %i par page', async (query, page, pageSize) => {
    const body = await (await get(query)).json()

    expect(body).toMatchObject({ page, pageSize })
    expect(listMock).toHaveBeenCalledWith({ gameId: null, skip: (page - 1) * pageSize, take: pageSize })
  })
})
