import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/ip-lookup — vraie route, vraie garde, vrai lookupByIp ;
 * session et base simulées. L'identifiant d'un navigateur est la valeur brute
 * de son cookie lp_vid : posé dans un autre navigateur, il permet d'effacer ou
 * de réécrire ses traces (/api/analytics/ping). Un modérateur ne reçoit que le
 * nombre de navigateurs (seul affiché par le bandeau), jamais leur identifiant.
 */

const VISITOR_ID = 'abcdef0123456789abcdef0123456789'

const { userMock, prismaMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  prismaMock: {
    user: { findMany: vi.fn() },
    sitePresence: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { GET } from './route'

const lookup = () => GET(new Request('http://test/api/admin/ip-lookup?ip=1.2.3.4'))

beforeEach(() => {
  vi.resetAllMocks()
  const now = new Date()
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.$queryRaw.mockResolvedValue([])
  prismaMock.sitePresence.findMany.mockResolvedValue([
    {
      visitorId: VISITOR_ID,
      userId: null,
      userSeenAt: null,
      country: 'FR',
      lastIp: '1.2.3.4',
      lastSeen: now,
      firstSeen: now,
    },
  ])
})

describe('GET /api/admin/ip-lookup — navigateurs', () => {
  it('modérateur : le nombre de navigateurs, sans leur identifiant', async () => {
    userMock.mockResolvedValue({ id: 'modo', role: 'moderator' })

    const res = await lookup()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.visitors).toEqual([{ online: true }])
    expect(JSON.stringify(body)).not.toContain(VISITOR_ID)
  })

  it('admin : le détail, identifiant compris', async () => {
    userMock.mockResolvedValue({ id: 'admin', role: 'admin' })

    const body = await (await lookup()).json()

    expect(body.visitors).toHaveLength(1)
    expect(body.visitors[0]).toMatchObject({ visitorId: VISITOR_ID, country: 'FR', online: true })
  })
})
