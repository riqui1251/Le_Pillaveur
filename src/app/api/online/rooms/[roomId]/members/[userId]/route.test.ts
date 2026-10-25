import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DELETE /api/online/rooms/[roomId]/members/[userId] — l'hôte exclut un
 * membre. Une invitation encore « en attente » ne doit pas lui rouvrir la
 * table. Vraie route, base, session, expulsion et bus simulés.
 */

const { userMock, roomMock, memberMock, inviteMock, kickMock, bus } = vi.hoisted(() => ({
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn() },
  memberMock: { findUnique: vi.fn() },
  inviteMock: { updateMany: vi.fn() },
  kickMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { onlineRoom: roomMock, onlineRoomMember: memberMock, onlineRoomInvite: inviteMock },
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({ kickMember: kickMock }))
vi.mock('@/lib/online/room-bus', () => bus)

import { DELETE } from './route'

const kick = (callerId: string, targetId: string) => {
  userMock.mockResolvedValue({ id: callerId })
  return DELETE(new Request(`http://test/api/online/rooms/room-1/members/${targetId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ roomId: 'room-1', userId: targetId }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  roomMock.findUnique.mockResolvedValue({ id: 'room-1', hostUserId: 'host', status: 'waiting' })
  memberMock.findUnique.mockResolvedValue({ userId: 'fred' })
  inviteMock.updateMany.mockResolvedValue({ count: 1 })
})

describe('DELETE /members/[userId]', () => {
  it('l’exclu perd son invitation encore en attente', async () => {
    const res = await kick('host', 'fred')

    expect(res.status).toBe(200)
    expect(kickMock).toHaveBeenCalledWith('room-1', 'host', 'fred', 'kicked')
    expect(inviteMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', invitedUserId: 'fred', status: 'pending' },
      data: { status: 'revoked', respondedAt: expect.any(Date) },
    })
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('pas l’hôte : refus, rien n’est touché', async () => {
    const res = await kick('bob', 'fred')

    expect(res.status).toBe(403)
    expect(kickMock).not.toHaveBeenCalled()
    expect(inviteMock.updateMany).not.toHaveBeenCalled()
  })

  it('envoi depuis un autre site : 403 cross_site_request', async () => {
    userMock.mockResolvedValue({ id: 'host' })
    const res = await DELETE(
      new Request('http://test/api/online/rooms/room-1/members/fred', {
        method: 'DELETE',
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
      { params: Promise.resolve({ roomId: 'room-1', userId: 'fred' }) }
    )

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('cross_site_request')
    expect(kickMock).not.toHaveBeenCalled()
  })
})
