import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/soiree-feedback/reviews — votes du Mode Soirée un par un,
 * avec leur auteur. Vraie route, vraie garde, vrais rôles et vraie
 * pagination ; session et lecture des votes simulées.
 */

const { userMock, listMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  listMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/soiree-feedback-server', () => ({ listSoireeReviews: listMock }))

import { GET } from './route'

const get = (query = '') => GET(new Request(`http://localhost/api/admin/soiree-feedback/reviews${query}`))

const VOTE = {
  id: 'soiree-mb1x2y3z-k4f9-m0',
  rating: 4,
  gameId: 'hi-lo',
  playMode: 'local',
  comment: '',
  createdAt: '2026-11-22T23:10:00.000Z',
  author: { kind: 'anonymous' },
}

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'staff', role: 'moderator' })
  listMock.mockResolvedValue({ reviews: [VOTE], total: 1 })
})

describe('GET /api/admin/soiree-feedback/reviews — accès', () => {
  it.each([['moderator'], ['admin'], ['superadmin'], ['fondateur']])('%s : votes servis, auteur compris', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reviews: [VOTE], total: 1, page: 1, pageSize: 10 })
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

describe('GET /api/admin/soiree-feedback/reviews — filtre et pagination', () => {
  it('sans filtre : tous les votes, première page de 10', async () => {
    await get()

    expect(listMock).toHaveBeenCalledWith({ subject: { kind: 'all' }, skip: 0, take: 10 })
  })

  it('?scope=night : les votes de la soirée entière', async () => {
    await get('?scope=night&page=2')

    expect(listMock).toHaveBeenCalledWith({ subject: { kind: 'night' }, skip: 10, take: 10 })
  })

  it('?gameId= : les votes d’entracte de ce jeu ; filtres vides = tous les votes', async () => {
    await get('?gameId=hi-lo')
    expect(listMock).toHaveBeenLastCalledWith({ subject: { kind: 'game', gameId: 'hi-lo' }, skip: 0, take: 10 })

    await get('?gameId=&scope=')
    expect(listMock).toHaveBeenLastCalledWith({ subject: { kind: 'all' }, skip: 0, take: 10 })
  })

  it.each([['?gameId=HI-LO'], ['?gameId=%27%3B--'], [`?gameId=${'a'.repeat(65)}`]])(
    'identifiant de jeu mal formé %s : 400 invalid_game, sans lecture',
    async (query) => {
      const res = await get(query)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_game', code: 'invalid_game' })
      expect(listMock).not.toHaveBeenCalled()
    }
  )

  it.each([['?scope=tout'], ['?scope=night&gameId=hi-lo']])(
    'portée inconnue ou contredite par un jeu %s : 400 invalid_action, sans lecture',
    async (query) => {
      const res = await get(query)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_action', code: 'invalid_action' })
      expect(listMock).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['?pageSize=500', 1, 50],
    ['?page=0&pageSize=0', 1, 10],
    ['?page=3&pageSize=20', 3, 20],
  ])('paramètres %s bornés : page %i, %i par page', async (query, page, pageSize) => {
    const body = await (await get(query)).json()

    expect(body).toMatchObject({ page, pageSize })
    expect(listMock).toHaveBeenCalledWith({ subject: { kind: 'all' }, skip: (page - 1) * pageSize, take: pageSize })
  })
})
