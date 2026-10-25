import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/admin/users/unban — vraie route, vraie garde, vrais rôles ;
 * session et base simulées. Lever un ban exige un grade au moins égal à
 * celui de son auteur, et le droit de poser un ban définitif pour en lever
 * un : un modérateur ne défait plus la sanction d'un admin, ni un admin
 * celle d'un fondateur.
 */

type UserRow = {
  id: string
  role: string
  banType: string | null
  bannedUntil: Date | null
  banComment: string | null
  bannedAt: Date | null
  bannedById: string | null
}

const { userMock, users, prismaMock } = vi.hoisted(() => {
  const users = new Map<string, UserRow>()
  return {
    users,
    userMock: vi.fn(),
    prismaMock: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
        update: vi.fn(async () => ({})),
      },
      accountBanEvent: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
  }
})

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { POST } from './route'

const DAY_MS = 24 * 60 * 60 * 1000

function staff(id: string, role: string): UserRow {
  return { id, role, banType: null, bannedUntil: null, banComment: null, bannedAt: null, bannedById: null }
}

function bannedPlayer(ban: { type: 'permanent' | 'temporary'; by: string | null; untilMs?: number }): UserRow {
  return {
    id: 'joueur',
    role: 'user',
    banType: ban.type,
    bannedUntil: ban.type === 'temporary' ? new Date(Date.now() + (ban.untilMs ?? DAY_MS)) : null,
    banComment: null,
    bannedAt: new Date(),
    bannedById: ban.by,
  }
}

function unban(headers: Record<string, string> = {}) {
  return POST(
    new Request('http://test/api/admin/users/unban', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ userId: 'joueur' }),
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  users.clear()
  for (const row of [
    staff('modo', 'moderator'),
    staff('modo2', 'moderator'),
    staff('admin', 'admin'),
    staff('admin2', 'admin'),
    staff('fondateur', 'fondateur'),
  ]) {
    users.set(row.id, row)
  }
  userMock.mockResolvedValue({ id: 'modo', role: 'moderator' })
})

describe('POST /api/admin/users/unban — rang de l’auteur du ban', () => {
  it('un modérateur ne lève pas le ban définitif posé par un admin', async () => {
    users.set('joueur', bannedPlayer({ type: 'permanent', by: 'admin' }))

    const res = await unban()

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'sanction_outranked' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.accountBanEvent.create).not.toHaveBeenCalled()
  })

  it('un modérateur ne lève pas non plus le ban temporaire d’un admin', async () => {
    users.set('joueur', bannedPlayer({ type: 'temporary', by: 'admin' }))

    const res = await unban()

    expect(res.status).toBe(403)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('un admin ne lève pas le ban d’un fondateur', async () => {
    userMock.mockResolvedValue({ id: 'admin', role: 'admin' })
    users.set('joueur', bannedPlayer({ type: 'permanent', by: 'fondateur' }))

    const res = await unban()

    expect(res.status).toBe(403)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('auteur supprimé : un ban définitif reste réservé à qui peut le poser', async () => {
    users.set('joueur', bannedPlayer({ type: 'permanent', by: 'compte-supprime' }))

    const res = await unban()

    expect(res.status).toBe(403)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('un modérateur lève le ban temporaire d’un autre modérateur', async () => {
    users.set('joueur', bannedPlayer({ type: 'temporary', by: 'modo2' }))

    const res = await unban()

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.accountBanEvent.create.mock.calls[0]).toMatchObject([
      { data: { userId: 'joueur', actorId: 'modo', action: 'unban' } },
    ])
  })

  it('un admin lève le ban définitif d’un pair', async () => {
    userMock.mockResolvedValue({ id: 'admin', role: 'admin' })
    users.set('joueur', bannedPlayer({ type: 'permanent', by: 'admin2' }))

    const res = await unban()

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
  })

  it('ban temporaire déjà échu : plus rien à protéger, la levée passe', async () => {
    users.set('joueur', bannedPlayer({ type: 'temporary', by: 'admin', untilMs: -DAY_MS }))

    const res = await unban()

    expect(res.status).toBe(200)
  })

  it('requête venue d’un autre site : refusée avant toute lecture', async () => {
    users.set('joueur', bannedPlayer({ type: 'temporary', by: 'modo2' }))

    const res = await unban({ origin: 'https://evil.example' })

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'cross_site_request' })
    expect(userMock).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
