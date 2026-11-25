import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/acquisition — provenance des visites. Vraie route, vraie
 * garde, vrais rôles et vraies périodes ; session et lecture simulées.
 */

const { userMock, statsMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  statsMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/acquisition-server', () => ({ getAcquisitionStats: statsMock }))

import { GET } from './route'

const get = (query = '') => GET(new Request(`http://localhost/api/admin/acquisition${query}`))

const STATS = {
  from: '2026-11-19',
  since: '2026-11-25',
  total: 3,
  channels: [
    { channel: 'google', visits: 2 },
    { channel: 'direct', visits: 1 },
  ],
  landings: [{ path: '/fr/regles/loup-garou', visits: 2 }],
  campaigns: [],
  hosts: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'staff', role: 'admin' })
  statsMock.mockResolvedValue(STATS)
})

describe('GET /api/admin/acquisition — accès', () => {
  it.each([['admin'], ['superadmin'], ['fondateur']])('%s : provenance servie', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ period: 'd7', days: 7, ...STATS })
  })

  it.each([['moderator'], ['user'], [null]])('%s : 403 codé, sans la moindre lecture', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'compte', role } : null)

    const res = await get()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden', code: 'forbidden' })
    expect(statsMock).not.toHaveBeenCalled()
  })

  it('panne de la base : 500 codé, jamais une page HTML', async () => {
    statsMock.mockRejectedValueOnce(new Error('SQLITE_BUSY'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await get()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server_error', code: 'server_error' })
  })
})

describe('GET /api/admin/acquisition — période', () => {
  it.each([
    ['?period=d1', 1],
    ['?period=d7', 7],
    ['?period=d30', 30],
    ['', 7],
  ])('%s → %i jours de Paris', async (query, days) => {
    const res = await get(query)

    expect(res.status).toBe(200)
    expect(statsMock).toHaveBeenCalledWith(days)
  })

  it('période inconnue : 400 codé, sans lecture', async () => {
    const res = await get('?period=d365')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_action', code: 'invalid_action' })
    expect(statsMock).not.toHaveBeenCalled()
  })
})
