import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Suppression de compte et journal des parties : les salles dont le compte est
 * l'hôte partent en CASCADE avec lui (OnlineRoom.host). Leur partie en cours
 * doit donc être close DANS la transaction et AVANT le `user.delete` — après,
 * plus rien ne la date et elle tombe en « fiabilité inconnue ».
 * La base est simulée : chaque requête préparée est un jeton reconnaissable,
 * on vérifie sa place dans le tableau passé à `$transaction`.
 */
const { prismaMock } = vi.hoisted(() => {
  const token = (name: string) => vi.fn(() => name)
  return {
    prismaMock: {
      user: { findFirst: vi.fn(), delete: token('user.delete') },
      onlineRoom: { findMany: vi.fn() },
      onlineGameSession: { updateMany: token('journal.close') },
      stats: { deleteMany: token('stats.deleteMany') },
      achievement: { deleteMany: token('achievement.deleteMany') },
      session: { deleteMany: token('session.deleteMany') },
      accountVisit: { deleteMany: token('accountVisit.deleteMany') },
      accountBanEvent: { updateMany: token('ban.updateMany'), deleteMany: token('ban.deleteMany') },
      userFeedback: { updateMany: token('feedback.updateMany') },
      sitePresence: { updateMany: token('presence.updateMany') },
      $executeRaw: token('ip.delete'),
      $transaction: vi.fn(async () => []),
    },
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { deleteUserAccount } from '@/lib/user-activity-server'

/** Le tableau reçu par l'unique `$transaction`. */
const transactionQueries = () => {
  expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  return (prismaMock.$transaction.mock.calls[0] as unknown[])[0] as unknown[]
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findFirst.mockResolvedValue({ id: 'fondateur' })
})

describe('deleteUserAccount', () => {
  it('ferme les parties des salles hébergées dans la transaction, avant user.delete', async () => {
    prismaMock.onlineRoom.findMany.mockResolvedValue([{ id: 'room-1' }])

    await deleteUserAccount('u1')

    expect(prismaMock.onlineRoom.findMany).toHaveBeenCalledWith({
      where: { hostUserId: 'u1' },
      select: { id: true },
    })
    expect(prismaMock.onlineGameSession.updateMany).toHaveBeenCalledWith({
      where: { roomId: { in: ['room-1'] }, endedAt: null },
      data: { endedAt: expect.any(Date), endReason: 'left' },
    })
    const queries = transactionQueries()
    expect(queries).toContain('journal.close')
    expect(queries.indexOf('journal.close')).toBeLessThan(queries.indexOf('user.delete'))
    // Le compte part en dernier : tout ce qui dépend de lui est traité avant.
    expect(queries[queries.length - 1]).toBe('user.delete')
  })

  it('n’ajoute aucune fermeture pour un compte qui n’héberge aucune salle', async () => {
    prismaMock.onlineRoom.findMany.mockResolvedValue([])

    await deleteUserAccount('u1')

    expect(transactionQueries()).not.toContain('journal.close')
    expect(prismaMock.onlineGameSession.updateMany).not.toHaveBeenCalled()
  })

  it('efface explicitement les visites du compte (AccountVisit) dans la transaction, avant user.delete', async () => {
    prismaMock.onlineRoom.findMany.mockResolvedValue([])

    await deleteUserAccount('u1')

    expect(prismaMock.accountVisit.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    const queries = transactionQueries()
    expect(queries).toContain('accountVisit.deleteMany')
    expect(queries.indexOf('accountVisit.deleteMany')).toBeLessThan(queries.indexOf('user.delete'))
  })
})
