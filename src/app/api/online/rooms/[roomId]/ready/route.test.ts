import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT /api/online/rooms/[roomId]/ready — l'appartenance est vérifiée AVANT
 * la lecture du corps, et le corps est borné à 1 Ko. Vraie route, base,
 * session, cache et bus simulés.
 */

const { userMock, memberMock, dtoMock, bus, cache } = vi.hoisted(() => ({
  userMock: vi.fn(),
  memberMock: { findUnique: vi.fn(), updateMany: vi.fn() },
  dtoMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
  cache: { invalidateLobbiesCache: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoomMember: memberMock } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({ buildRoomDto: dtoMock }))
vi.mock('@/lib/online/room-bus', () => bus)
vi.mock('@/lib/online/lobbies-cache', () => cache)

import { PUT } from './route'

const request = (body: string) =>
  new Request('http://test/api/online/rooms/room-1/ready', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  })

const ready = (req: Request) => PUT(req, { params: Promise.resolve({ roomId: 'room-1' }) })

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'alice' })
  memberMock.findUnique.mockResolvedValue({ userId: 'alice' })
  memberMock.updateMany.mockResolvedValue({ count: 1 })
  dtoMock.mockResolvedValue({ id: 'room-1' })
})

describe('PUT /ready', () => {
  it('membre : coche écrite, table prévenue', async () => {
    const res = await ready(request(JSON.stringify({ isReady: true })))

    expect(res.status).toBe(200)
    expect(memberMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', userId: 'alice' },
      data: { isReady: true, lastSeenAt: expect.any(Date) },
    })
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('hors de la table : 403 sans lire le corps', async () => {
    memberMock.findUnique.mockResolvedValue(null)
    const req = request(JSON.stringify({ isReady: true, pad: 'x'.repeat(100_000) }))

    const res = await ready(req)

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('not_a_member')
    expect(req.bodyUsed).toBe(false)
    expect(memberMock.updateMany).not.toHaveBeenCalled()
  })

  it('corps de plus de 1 Ko : 413, rien écrit', async () => {
    const res = await ready(request(JSON.stringify({ isReady: true, pad: 'x'.repeat(2048) })))

    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('payload_too_large')
    expect(memberMock.updateMany).not.toHaveBeenCalled()
  })

  it('JSON illisible : 400 invalid_json, plus une erreur 500', async () => {
    const res = await ready(request('{pas du json'))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_json')
  })
})
