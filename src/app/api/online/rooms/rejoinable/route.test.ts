import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/rooms/rejoinable — la partie que le joueur peut reprendre.
 * Elle se trouve par SES places du journal des parties, sans lire l'état des
 * autres tables ; une partie terminée n'est plus proposée. Vraie route, base
 * et session simulées, adaptateur minimal.
 */

const { userMock, seatMock, roomMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  seatMock: { findMany: vi.fn() },
  roomMock: { findMany: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { onlineGameSessionPlayer: seatMock, onlineRoom: roomMock },
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online/game-adapters', () => ({
  SERVER_AUTHORITATIVE_GAMES: ['menteur'],
  getGameAdapter: () => ({
    parse: (json: string | null) => (json ? JSON.parse(json) : null),
    isFinished: (state: { phase: string }) => state.phase === 'finished',
  }),
}))

import { GET } from './route'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'

/**
 * Un compte NEUF par test : quota et réponse gardée vivent dans le module
 * (même règle que join/route.test.ts).
 */
let seq = 0
const newUser = () => {
  const id = `user-${++seq}`
  userMock.mockResolvedValue({ id })
  return id
}

const room = (userId: string, phase: string, leftAt: number | null) => ({
  id: 'room-1',
  code: 'ABC234',
  gameId: 'menteur',
  gameStateJson: JSON.stringify({ phase, players: [{ id: userId, leftAt }, { id: 'other' }] }),
})

beforeEach(() => {
  vi.resetAllMocks()
  seatMock.findMany.mockResolvedValue([{ session: { roomId: 'room-1' } }])
})

describe('GET /rooms/rejoinable', () => {
  it('ne lit que les parties ouvertes du joueur, puis leurs seuls états', async () => {
    const userId = newUser()
    roomMock.findMany.mockResolvedValue([room(userId, 'bidding', Date.now() - 60_000)])

    const res = await GET()

    const body = await res.json()
    expect(body.rejoinable).toMatchObject({ roomId: 'room-1', code: 'ABC234', gameId: 'menteur' })
    expect(body.rejoinable.graceLeftMs).toBeGreaterThan(ONLINE_REPLACE_GRACE_MS - 61_000)
    expect(seatMock.findMany.mock.calls[0][0].where).toEqual({
      userId,
      session: { endedAt: null, gameId: { in: ['menteur'] } },
    })
    expect(roomMock.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['room-1'] }, status: 'playing' })
  })

  it('aucune partie ouverte : aucun état lu', async () => {
    newUser()
    seatMock.findMany.mockResolvedValue([])

    expect(await (await GET()).json()).toEqual({ rejoinable: null })
    expect(roomMock.findMany).not.toHaveBeenCalled()
  })

  it('partie déjà terminée : plus de bannière « Rejoindre » à 0 s', async () => {
    const userId = newUser()
    roomMock.findMany.mockResolvedValue([room(userId, 'finished', Date.now() - 60_000)])

    expect(await (await GET()).json()).toEqual({ rejoinable: null })
  })

  it('pas parti (aucun leftAt) : rien à reprendre', async () => {
    const userId = newUser()
    roomMock.findMany.mockResolvedValue([room(userId, 'bidding', null)])

    expect(await (await GET()).json()).toEqual({ rejoinable: null })
  })

  it('réponse gardée quelques secondes par compte : les onglets ne relisent pas la base', async () => {
    const userId = newUser()
    roomMock.findMany.mockResolvedValue([room(userId, 'bidding', Date.now())])

    await GET()
    await GET()

    expect(seatMock.findMany).toHaveBeenCalledTimes(1)
  })

  it('quota par compte : 429 au-delà de 30 appels par minute', async () => {
    newUser()
    seatMock.findMany.mockResolvedValue([])

    for (let i = 0; i < 30; i += 1) expect((await GET()).status).toBe(200)
    const res = await GET()

    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('rate_limited')
  })
})
