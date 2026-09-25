import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/rooms/[roomId] hors de la table : le 403 dit POURQUOI
 * quand le serveur a retiré le joueur lui-même (online/departures.ts) — une
 * fois, puis il retombe sur le refus nu. Vraie route, base et session
 * simulées, registre des départs réel.
 */

const { userMock, memberMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  memberMock: { findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoomMember: memberMock } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({
  buildRoomDto: vi.fn(),
  closeGameSessionBeforeRoomDelete: vi.fn(),
  touchMemberPresence: vi.fn(),
}))
vi.mock('@/lib/online-petit-buveur', () => ({ resetRoomToWaitingLobby: vi.fn() }))
vi.mock('@/lib/online/room-bus', () => ({ publishRoomChanged: vi.fn() }))
vi.mock('@/lib/online/lobbies-cache', () => ({ invalidateLobbiesCache: vi.fn() }))
vi.mock('@/lib/online/game-adapters', () => ({ getGameAdapter: vi.fn() }))
vi.mock('@/lib/online/room-ticker', () => ({ armRoomTicker: vi.fn() }))

import { GET } from './route'
import { recordDeparture } from '@/lib/online/departures'

const get = (userId: string, roomId = 'room-1') => {
  userMock.mockResolvedValue({ id: userId })
  return GET(new Request(`http://test/api/online/rooms/${roomId}`), {
    params: Promise.resolve({ roomId }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  memberMock.findUnique.mockResolvedValue(null)
})

describe('GET /rooms/[roomId] — raison du 403', () => {
  it('rend la raison d’un départ forcé, une seule fois', async () => {
    recordDeparture('kicked-bob', 'room-1', 'kicked')

    const first = await get('kicked-bob')
    expect(first.status).toBe(403)
    expect(await first.json()).toMatchObject({ error: 'forbidden', reason: 'kicked' })

    const second = await get('kicked-bob')
    expect(second.status).toBe(403)
    expect(await second.json()).not.toHaveProperty('reason')
  })

  it('pas de raison pour une autre table', async () => {
    recordDeparture('absent-ann', 'room-2', 'absent')

    const res = await get('absent-ann', 'room-1')

    expect(await res.json()).not.toHaveProperty('reason')
  })

  it('refus nu sans départ connu', async () => {
    const res = await get('inconnu')

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden', message: expect.any(String) })
  })
})
