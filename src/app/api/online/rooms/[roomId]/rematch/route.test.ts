import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/online/rooms/[roomId]/rematch — quota par compte. Chaque vote
 * relit la salle et fait relire la table à tous ses clients : un compte qui
 * martèle le bouton ne doit pas les inonder. Vrai limiteur, base et session
 * simulées.
 */

const { userMock, roomMock, voteMock, publishMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn() },
  voteMock: vi.fn(),
  publishMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomMock } }))
vi.mock('@/lib/online-room', () => ({ buildRoomDto: vi.fn(async () => ({ id: 'room-1' })), touchMemberPresence: vi.fn() }))
vi.mock('@/lib/online-room-launch', () => ({ processRematchVote: voteMock }))
vi.mock('@/lib/online/room-bus', () => ({ publishRoomChanged: publishMock }))

import { POST } from './route'

const vote = (userId: string) => {
  userMock.mockResolvedValue({ id: userId })
  return POST(new Request('http://test/api/online/rooms/room-1/rematch', { method: 'POST' }), {
    params: Promise.resolve({ roomId: 'room-1' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  roomMock.findUnique.mockResolvedValue({ id: 'room-1', members: [{ userId: 'marteau' }, { userId: 'calme' }] })
})

describe('POST /rematch — quota par compte', () => {
  it('au-delà de 30 votes par minute : 429 rate_limited, ni lecture ni diffusion', async () => {
    for (let i = 0; i < 30; i++) expect((await vote('marteau')).status).toBe(200)
    vi.clearAllMocks()

    const res = await vote('marteau')

    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'rate_limited', code: 'rate_limited' })
    expect(roomMock.findUnique).not.toHaveBeenCalled()
    expect(voteMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('les autres membres votent toujours', async () => {
    expect((await vote('calme')).status).toBe(200)
    expect(voteMock).toHaveBeenCalledTimes(1)
  })
})
