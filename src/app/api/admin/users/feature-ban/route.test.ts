import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/admin/users/feature-ban — vraie route, vraie garde, vraies
 * fonctions de feature-bans.ts ; session et base simulées.
 * - Lever ou remplacer un ban vocal/chat en place exige un grade au moins
 *   égal à celui de son auteur.
 * - Chaque pose, remplacement et levée laisse une ligne dans l'historique du
 *   compte (AccountBanEvent) : la ligne FeatureBan, écrasée ou supprimée, ne
 *   gardait aucune trace de la sanction ni de qui l'avait levée.
 */

type FeatureBanRow = { until: Date | null; actorRole: string | null }

const { userMock, roles, featureBans, prismaMock } = vi.hoisted(() => {
  const roles = new Map<string, string>()
  const featureBans = new Map<string, FeatureBanRow>()
  return {
    roles,
    featureBans,
    userMock: vi.fn(),
    prismaMock: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const role = roles.get(where.id)
          return role ? { id: where.id, role } : null
        }),
      },
      featureBan: {
        findUnique: vi.fn(
          async ({ where }: { where: { userId_feature: { userId: string; feature: string } } }) => {
            const { userId, feature } = where.userId_feature
            const row = featureBans.get(`${userId}:${feature}`)
            if (!row) return null
            return { until: row.until, actor: row.actorRole ? { role: row.actorRole } : null }
          }
        ),
        upsert: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 1 })),
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

function send(body: Record<string, unknown>) {
  return POST(
    new Request('http://test/api/admin/users/feature-ban', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'joueur', feature: 'voice', ...body }),
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  roles.clear()
  featureBans.clear()
  roles.set('modo', 'moderator')
  roles.set('admin', 'admin')
  roles.set('joueur', 'user')
  userMock.mockResolvedValue({ id: 'modo', role: 'moderator' })
})

describe('POST /api/admin/users/feature-ban — rang de l’auteur', () => {
  it('un modérateur ne rend pas le vocal coupé par un admin', async () => {
    featureBans.set('joueur:voice', { until: null, actorRole: 'admin' })

    const res = await send({ action: 'unban' })

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'sanction_outranked' })
    expect(prismaMock.featureBan.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.accountBanEvent.create).not.toHaveBeenCalled()
  })

  it('un modérateur ne remplace pas le ban définitif d’un admin par un ban d’un jour', async () => {
    featureBans.set('joueur:voice', { until: null, actorRole: 'admin' })

    const res = await send({ action: 'ban', durationDays: 1 })

    expect(res.status).toBe(403)
    expect(prismaMock.featureBan.upsert).not.toHaveBeenCalled()
  })

  it('ban de l’admin déjà échu : le modérateur pose le sien', async () => {
    featureBans.set('joueur:voice', { until: new Date(Date.now() - DAY_MS), actorRole: 'admin' })

    const res = await send({ action: 'ban', durationDays: 1 })

    expect(res.status).toBe(200)
    expect(prismaMock.featureBan.upsert).toHaveBeenCalledTimes(1)
  })

  it('refuse une durée fractionnaire', async () => {
    const res = await send({ action: 'ban', durationDays: 0.5 })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_duration' })
    expect(prismaMock.featureBan.upsert).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/feature-ban — historique du compte', () => {
  it('la levée est notée avec son auteur', async () => {
    featureBans.set('joueur:voice', { until: null, actorRole: 'moderator' })

    const res = await send({ action: 'unban', comment: ' excuses reçues ' })

    expect(res.status).toBe(200)
    expect(prismaMock.featureBan.deleteMany).toHaveBeenCalledWith({ where: { userId: 'joueur', feature: 'voice' } })
    expect(prismaMock.accountBanEvent.create).toHaveBeenCalledWith({
      data: { userId: 'joueur', actorId: 'modo', action: 'feature-unban:voice', comment: 'excuses reçues' },
    })
  })

  it('la pose est notée avec son échéance', async () => {
    userMock.mockResolvedValue({ id: 'admin', role: 'admin' })

    const res = await send({ feature: 'chat', action: 'ban', durationDays: 3, comment: 'insultes' })

    expect(res.status).toBe(200)
    expect(prismaMock.featureBan.upsert).toHaveBeenCalledTimes(1)
    const [{ data }] = prismaMock.accountBanEvent.create.mock.calls[0] as unknown as [
      { data: { action: string; actorId: string; comment: string; bannedUntil: Date } },
    ]
    expect(data).toMatchObject({ action: 'feature-ban:chat', actorId: 'admin', comment: 'insultes' })
    expect(data.bannedUntil.getTime()).toBeGreaterThan(Date.now() + 2 * DAY_MS)
  })

  it('un ban définitif est noté sans échéance', async () => {
    const res = await send({ action: 'ban' })

    expect(res.status).toBe(200)
    expect(prismaMock.accountBanEvent.create).toHaveBeenCalledWith({
      data: { userId: 'joueur', actorId: 'modo', action: 'feature-ban:voice', comment: null, bannedUntil: null },
    })
  })

  it('rien à lever : aucune écriture, aucune ligne d’historique', async () => {
    const res = await send({ action: 'unban' })

    expect(res.status).toBe(200)
    expect(prismaMock.featureBan.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.accountBanEvent.create).not.toHaveBeenCalled()
  })
})
