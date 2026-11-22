import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/users — résumé « 7 j » de la liste Comptes. Vraie route,
 * vraie garde et vrais rôles ; session, base et résumé simulés.
 *
 * Ce résumé porte des durées d'activité : admins et plus seulement. Un
 * modérateur lit la liste, mais ni les visites, ni la raison de leur absence,
 * ni les parties ne lui sont servies — et rien n'est calculé pour lui.
 */

const { userMock, prismaMock, weekMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  prismaMock: { user: { findMany: vi.fn(), count: vi.fn() }, $queryRaw: vi.fn() },
  weekMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock, assertCanAssignRoles: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/account-activity-server', () => ({ summarizeRecentActivityByUser: weekMock }))
vi.mock('@/lib/ip-history-server', () => ({
  getIpsBySubjectKeys: vi.fn(async () => new Map()),
  subjectKeyFor: (userId: string) => `user:${userId}`,
}))
vi.mock('@/lib/feature-bans', () => ({ listFeatureBansForUsers: vi.fn(async () => new Map()) }))
// Lus par le PATCH seulement : leurs dépendances serveur n'ont rien à faire ici.
vi.mock('@/lib/ban-server', () => ({
  getBanState: () => ({ banned: false, banType: null, bannedUntil: null, banComment: null }),
  logAccountEvent: vi.fn(),
}))
vi.mock('@/lib/display-name', () => ({
  displayNameTakenMessage: vi.fn(),
  displayNameValidationMessage: vi.fn(),
  getDisplayNameValidationError: vi.fn(),
  isDisplayNameTaken: vi.fn(),
}))
vi.mock('@/lib/name-moderation/extra-terms-server', () => ({ ensureServerModerationTermsLoaded: vi.fn() }))
vi.mock('@/lib/name-moderation/request-locale', () => ({ resolveRequestLocale: vi.fn() }))
vi.mock('@/lib/name-moderation-attempt-log', () => ({ logRejectedNameOnServer: vi.fn() }))

import { GET } from './route'

const SEEN = new Date('2026-11-21T20:25:00.000Z')

/** Compte tel que le lit la liste (userListSelect). */
function row(id: string, role = 'user') {
  return {
    id,
    email: `${id}@example.test`,
    displayName: id,
    accountCode: null,
    role,
    isGuest: false,
    passwordHash: 'x',
    sessions: [],
    abuseReportsReceived: [],
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: SEEN,
    lastCountry: null,
    lastIp: null,
    lastDevice: null,
    lastSeenAt: SEEN,
    lastLoginAt: SEEN,
    banType: null,
    bannedUntil: null,
    banComment: null,
    bannedAt: null,
  }
}

const PLAY = { games: 1, tableSeconds: 1200, estimated: false }

const get = () => GET(new Request('http://localhost/api/admin/users'))

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findMany.mockResolvedValue([row('a'), row('b'), row('equipe', 'admin')])
  prismaMock.user.count.mockResolvedValue(3)
  weekMock.mockResolvedValue(
    new Map([
      ['a', { visits7d: { visits: 2, activeSeconds: 2400, state: 'tracked' }, play7d: PLAY }],
      ['b', { visits7d: { visits: 0, activeSeconds: 0, state: 'seenUntracked' }, play7d: PLAY }],
      ['equipe', { visits7d: { visits: 0, activeSeconds: 0, state: 'staff' } }],
    ])
  )
})

describe('GET /api/admin/users — résumé 7 j', () => {
  it.each([['admin'], ['superadmin'], ['fondateur']])(
    '%s : chaque compte porte ses visites, la raison de leur absence et ses parties',
    async (role) => {
      userMock.mockResolvedValue({ id: 'staff', role })

      const res = await get()
      const body = await res.json()

      expect(res.status).toBe(200)
      const byId = Object.fromEntries(body.users.map((u: { id: string }) => [u.id, u]))
      expect(byId.a).toMatchObject({ visits7d: { visits: 2, activeSeconds: 2400, state: 'tracked' }, play7d: PLAY })
      // La table de deux : B n'a aucune visite, mais la même durée de table que A.
      expect(byId.b).toMatchObject({ visits7d: { visits: 0, activeSeconds: 0, state: 'seenUntracked' }, play7d: PLAY })
      expect(byId.equipe.visits7d.state).toBe('staff')
      expect(byId.equipe).not.toHaveProperty('play7d')
      // Le résumé reçoit ce qu'il lui faut pour trancher, et rien d'autre.
      expect(weekMock).toHaveBeenCalledWith(
        [
          { id: 'a', role: 'user', lastSeenAt: SEEN },
          { id: 'b', role: 'user', lastSeenAt: SEEN },
          { id: 'equipe', role: 'admin', lastSeenAt: SEEN },
        ],
        expect.any(Date)
      )
    }
  )

  it('modérateur : la liste, sans visites ni parties — et rien n’est calculé', async () => {
    userMock.mockResolvedValue({ id: 'staff', role: 'moderator' })

    const res = await get()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.users).toHaveLength(3)
    for (const user of body.users) {
      expect(user).not.toHaveProperty('visits7d')
      expect(user).not.toHaveProperty('play7d')
    }
    expect(weekMock).not.toHaveBeenCalled()
  })

  it.each([['user'], [null]])('%s : 403, sans la moindre lecture', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)

    const res = await get()

    expect(res.status).toBe(403)
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
    expect(weekMock).not.toHaveBeenCalled()
  })
})
