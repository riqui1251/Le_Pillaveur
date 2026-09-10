import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Prisma est remplacé par une table Friendship en mémoire dont `deleteMany`
 * RESPECTE la clause `where` (statut + paires) : c'est justement cette clause
 * qui est en cause ici, la simuler à moitié ne prouverait rien.
 */
const { friendshipMock, userBlockMock } = vi.hoisted(() => ({
  friendshipMock: { deleteMany: vi.fn() },
  userBlockMock: { upsert: vi.fn(), deleteMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    friendship: friendshipMock,
    userBlock: userBlockMock,
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}))

import { blockUser, unblockUser } from './blocks'
import { isDeclineCooldownActive } from '@/lib/friends'

type Row = { requesterId: string; addresseeId: string; status: string; respondedAt: Date | null }
type Pair = { requesterId: string; addresseeId: string }
type Where = { status?: { in: string[] }; OR?: Pair[] }
type BlockRow = { blockerId: string; blockedId: string }

let friendships: Row[]
let blocks: BlockRow[]

const REFUSED_AT = new Date('2026-09-08T12:00:00.000Z')

beforeEach(() => {
  vi.resetAllMocks()
  blocks = []
  friendshipMock.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
    const before = friendships.length
    friendships = friendships.filter((row) => {
      const statusHit = !where.status || where.status.in.includes(row.status)
      const pairHit =
        !where.OR ||
        where.OR.some(
          (p) => p.requesterId === row.requesterId && p.addresseeId === row.addresseeId
        )
      return !(statusHit && pairHit)
    })
    return { count: before - friendships.length }
  })
  userBlockMock.upsert.mockImplementation(async ({ create }: { create: BlockRow }) => {
    blocks.push(create)
    return create
  })
  userBlockMock.deleteMany.mockImplementation(async () => {
    blocks = []
    return { count: 1 }
  })
})

describe('blockUser — ce que le blocage efface, et ce qu’il ne doit pas effacer', () => {
  it('préserve le refus, donc le délai avant de pouvoir redemander', async () => {
    friendships = [
      { requesterId: 'alice', addresseeId: 'bob', status: 'declined', respondedAt: REFUSED_AT },
    ]

    // Le contournement visé : alice bloque bob, débloque, et redemande.
    await blockUser('alice', 'bob')
    await unblockUser('alice', 'bob')

    expect(friendships).toHaveLength(1)
    expect(friendships[0].status).toBe('declined')
    // L'horodatage du refus survit : le délai court toujours.
    expect(friendships[0].respondedAt).toEqual(REFUSED_AT)
    expect(isDeclineCooldownActive(friendships[0].respondedAt, new Date('2026-09-10T12:00:00.000Z')))
      .toBe(true)
  })

  it('préserve aussi un refus posé dans l’autre sens', async () => {
    friendships = [
      { requesterId: 'bob', addresseeId: 'alice', status: 'declined', respondedAt: REFUSED_AT },
    ]

    await blockUser('alice', 'bob')

    expect(friendships).toHaveLength(1)
    expect(friendships[0].status).toBe('declined')
  })

  it('supprime bien l’amitié acceptée et la demande en attente, dans les deux sens', async () => {
    friendships = [
      { requesterId: 'alice', addresseeId: 'bob', status: 'accepted', respondedAt: REFUSED_AT },
      { requesterId: 'bob', addresseeId: 'alice', status: 'pending', respondedAt: null },
      // Relation avec un TIERS : elle n'a rien à voir avec ce blocage.
      { requesterId: 'alice', addresseeId: 'carol', status: 'accepted', respondedAt: null },
    ]

    await blockUser('alice', 'bob')

    expect(friendships).toEqual([
      { requesterId: 'alice', addresseeId: 'carol', status: 'accepted', respondedAt: null },
    ])
  })

  it('enregistre le blocage dans le sens demandé', async () => {
    friendships = []

    await blockUser('alice', 'bob')

    expect(blocks).toEqual([{ blockerId: 'alice', blockedId: 'bob' }])
  })
})
