import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/admin/users/ban — vraie route, vraie garde, vrais rôles ; session
 * et base simulées. Un nouveau ban REMPLACE celui en place : poser un ban
 * temporaire court sur un compte banni définitivement revenait à lever ce
 * ban. Le remplacement exige donc les mêmes droits que la levée, et une durée
 * fractionnaire (tronquée par setDate, donc déjà échue) est refusée.
 */

type UserRow = {
  id: string
  role: string
  displayName: string
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
      session: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
  }
})

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { POST } from './route'

const DAY_MS = 24 * 60 * 60 * 1000

function account(id: string, role: string, ban?: { type: 'permanent' | 'temporary'; by: string }): UserRow {
  return {
    id,
    role,
    displayName: id,
    banType: ban?.type ?? null,
    bannedUntil: ban?.type === 'temporary' ? new Date(Date.now() + 7 * DAY_MS) : null,
    banComment: null,
    bannedAt: ban ? new Date() : null,
    bannedById: ban?.by ?? null,
  }
}

function ban(body: Record<string, unknown>) {
  return POST(
    new Request('http://test/api/admin/users/ban', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'joueur', ...body }),
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  users.clear()
  for (const row of [account('modo', 'moderator'), account('admin', 'admin')]) users.set(row.id, row)
  userMock.mockResolvedValue({ id: 'modo', role: 'moderator' })
})

describe('POST /api/admin/users/ban — ban déjà en place', () => {
  it('un modérateur ne remplace pas le ban définitif d’un admin par un ban temporaire', async () => {
    users.set('joueur', account('joueur', 'user', { type: 'permanent', by: 'admin' }))

    const res = await ban({ type: 'temporary', durationDays: 1 })

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'sanction_outranked' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.accountBanEvent.create).not.toHaveBeenCalled()
  })

  it('un modérateur ne raccourcit pas le ban temporaire d’un admin', async () => {
    users.set('joueur', account('joueur', 'user', { type: 'temporary', by: 'admin' }))

    const res = await ban({ type: 'temporary', durationDays: 1 })

    expect(res.status).toBe(403)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('un admin durcit le ban temporaire d’un modérateur en ban définitif', async () => {
    userMock.mockResolvedValue({ id: 'admin', role: 'admin' })
    users.set('joueur', account('joueur', 'user', { type: 'temporary', by: 'modo' }))

    const res = await ban({ type: 'permanent' })

    expect(res.status).toBe(200)
    expect(prismaMock.user.update.mock.calls[0]).toMatchObject([
      { where: { id: 'joueur' }, data: { banType: 'permanent', bannedById: 'admin' } },
    ])
  })

  it('compte sans ban : un modérateur pose son ban temporaire', async () => {
    users.set('joueur', account('joueur', 'user'))

    const res = await ban({ type: 'temporary', durationDays: 3 })

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/admin/users/ban — durée', () => {
  it('refuse une durée fractionnaire, que setDate tronquait en ban déjà échu', async () => {
    users.set('joueur', account('joueur', 'user'))

    const res = await ban({ type: 'temporary', durationDays: 0.5 })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_duration' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
