import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma et la suppression de compte sont remplacés : on ne teste ici QUE les
// critères des purges et l'indépendance des blocs, pas le SQL généré.
const { prismaMock, deleteUserAccountMock } = vi.hoisted(() => ({
  prismaMock: {
    $executeRaw: vi.fn(),
    sitePresence: { deleteMany: vi.fn() },
    chatMessage: { deleteMany: vi.fn() },
    nameModerationAttempt: { deleteMany: vi.fn() },
    dailyVisitor: { deleteMany: vi.fn() },
    onlineGameSession: { deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    user: { updateMany: vi.fn(), findMany: vi.fn() },
  },
  deleteUserAccountMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/user-activity-server', () => ({ deleteUserAccount: deleteUserAccountMock }))

const NOW = new Date('2026-10-10T12:00:00.000Z').getTime()
const DAY_MS = 24 * 60 * 60 * 1000

type FindManyArgs = { where: Record<string, unknown>; take?: number }

/** Les deux purges de comptes passent par user.findMany et filtrent toutes deux
 *  les sessions : les orphelins se reconnaissent au filtre sur les signalements. */
const isOrphanQuery = (args: FindManyArgs) => 'abuseReportsReceived' in args.where

function findManyCall(predicate: (args: FindManyArgs) => boolean): FindManyArgs | undefined {
  return prismaMock.user.findMany.mock.calls
    .map(([args]) => args as FindManyArgs)
    .find(predicate)
}

async function runSweep() {
  // Le balayage est limité à un passage par processus toutes les 6 h : un
  // module neuf par test remet ce compteur à zéro.
  vi.resetModules()
  const { runRetentionSweep } = await import('@/lib/retention-sweep')
  await runRetentionSweep()
}

describe('balayage de conservation', () => {
  let orphans: Array<{ id: string }>
  let staleGuests: Array<{ id: string }>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    orphans = []
    staleGuests = []

    prismaMock.$executeRaw.mockReset().mockResolvedValue(0)
    for (const model of [
      prismaMock.sitePresence,
      prismaMock.chatMessage,
      prismaMock.nameModerationAttempt,
      prismaMock.dailyVisitor,
      prismaMock.onlineGameSession,
      prismaMock.session,
    ]) {
      model.deleteMany.mockReset().mockResolvedValue({ count: 0 })
    }
    prismaMock.user.updateMany.mockReset().mockResolvedValue({ count: 0 })
    prismaMock.user.findMany
      .mockReset()
      .mockImplementation(async (args: FindManyArgs) => (isOrphanQuery(args) ? orphans : staleGuests))
    deleteUserAccountMock.mockReset().mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('supprime les sessions échues', async () => {
    await runSweep()
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date(NOW) } },
    })
  })

  it('cible les invités orphelins non bannis, sans session valide, inactifs depuis 7 jours et sans signalement ouvert', async () => {
    await runSweep()
    const cutoff = new Date(NOW - 7 * DAY_MS)
    const query = findManyCall(isOrphanQuery)
    expect(query).toEqual({
      where: {
        isGuest: true,
        banType: null,
        sessions: { none: { expiresAt: { gt: new Date(NOW) } } },
        abuseReportsReceived: { none: { status: 'open' } },
        OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true },
      take: 50,
    })
  })

  it('supprime chaque orphelin par la routine complète', async () => {
    orphans = [{ id: 'guest-a' }, { id: 'guest-b' }]
    await runSweep()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-a')
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-b')
    expect(deleteUserAccountMock).toHaveBeenCalledTimes(2)
  })

  it('garde la purge des invités inactifs depuis 90 jours, sauf session encore valide', async () => {
    staleGuests = [{ id: 'guest-old' }]
    await runSweep()
    const cutoff = new Date(NOW - 90 * DAY_MS)
    expect(findManyCall((args) => !isOrphanQuery(args))).toEqual({
      where: {
        isGuest: true,
        // Ping bloqué : /api/auth/me prolonge la session sans écrire
        // lastSeenAt — un invité qui joue encore ne doit pas partir.
        sessions: { none: { expiresAt: { gt: new Date(NOW) } } },
        OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true },
      take: 50,
    })
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-old')
  })

  it("un compte impossible à supprimer n'arrête pas les suivants", async () => {
    orphans = [{ id: 'guest-a' }, { id: 'guest-b' }]
    deleteUserAccountMock.mockRejectedValueOnce(new Error('contrainte'))
    await runSweep()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-b')
  })

  it("l'échec d'une purge simple n'empêche ni les autres ni les suppressions de comptes", async () => {
    prismaMock.chatMessage.deleteMany.mockRejectedValue(new Error('base verrouillée'))
    orphans = [{ id: 'guest-a' }]
    staleGuests = [{ id: 'guest-old' }]
    await expect(runSweep()).resolves.toBeUndefined()
    expect(prismaMock.session.deleteMany).toHaveBeenCalled()
    expect(prismaMock.user.updateMany).toHaveBeenCalled()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-a')
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-old')
  })

  it("l'échec de la recherche des orphelins laisse passer la purge à 90 jours", async () => {
    staleGuests = [{ id: 'guest-old' }]
    prismaMock.user.findMany.mockImplementation(async (args: FindManyArgs) => {
      if (isOrphanQuery(args)) throw new Error('requête refusée')
      return staleGuests
    })
    await runSweep()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-old')
  })
})
