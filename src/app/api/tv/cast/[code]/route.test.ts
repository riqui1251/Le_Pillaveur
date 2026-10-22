import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT /api/tv/cast/[code] et POST …/frame — salle de cast d'un jeu local.
 *
 * Vraies routes, base, session et bus simulés. Seul le créateur pousse, et
 * les corps sont bornés comme à la création : l'état est écrit tel quel en
 * base, la trame est recopiée vers chaque écran abonné.
 */

const { roomDb, currentUserMock, publishChangedMock, publishFrameMock } = vi.hoisted(() => ({
  roomDb: { findUnique: vi.fn(), update: vi.fn() },
  currentUserMock: vi.fn(),
  publishChangedMock: vi.fn(),
  publishFrameMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomDb } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/online/room-bus', () => ({
  publishRoomChanged: publishChangedMock,
  publishCastFrame: publishFrameMock,
}))

import { PUT } from './route'
import { POST as POST_FRAME } from './frame/route'

const params = { params: Promise.resolve({ code: 'abc123' }) }

const put = (body: string) => PUT(new Request('http://test/api/tv/cast/abc123', { method: 'PUT', body }), params)

const frame = (body: string) =>
  POST_FRAME(new Request('http://test/api/tv/cast/abc123/frame', { method: 'POST', body }), params)

beforeEach(() => {
  vi.clearAllMocks()
  currentUserMock.mockResolvedValue({ id: 'hote' })
  roomDb.findUnique.mockResolvedValue({ id: 'salle-1', status: 'cast', hostUserId: 'hote' })
  roomDb.update.mockResolvedValue({})
})

describe('PUT /api/tv/cast/[code]', () => {
  it('le créateur pousse son état : écrit et diffusé', async () => {
    const res = await put(JSON.stringify({ state: '{"tour":1}' }))
    expect(res.status).toBe(200)
    expect(roomDb.update.mock.calls[0][0].data.gameStateJson).toBe('{"tour":1}')
    expect(publishChangedMock).toHaveBeenCalledWith('salle-1', { type: 'changed' })
  })

  it('un autre compte : refusé', async () => {
    currentUserMock.mockResolvedValue({ id: 'intrus' })
    const res = await put(JSON.stringify({ state: '{}' }))
    expect(res.status).toBe(403)
    expect(roomDb.update).not.toHaveBeenCalled()
  })

  it('état démesuré : 413, rien n’est écrit en base', async () => {
    const res = await put(JSON.stringify({ state: 'x'.repeat(300 * 1024) }))
    expect(res.status).toBe(413)
    expect(roomDb.update).not.toHaveBeenCalled()
    expect(publishChangedMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/tv/cast/[code]/frame', () => {
  it('trame ordinaire : relayée aux écrans', async () => {
    const res = await frame(JSON.stringify({ x: 0.5, y: 0.25 }))
    expect(res.status).toBe(200)
    expect(publishFrameMock).toHaveBeenCalledWith('salle-1', { x: 0.5, y: 0.25 })
  })

  it('trame démesurée : 413, rien n’est diffusé', async () => {
    const res = await frame(JSON.stringify({ points: 'x'.repeat(64 * 1024) }))
    expect(res.status).toBe(413)
    expect(publishFrameMock).not.toHaveBeenCalled()
  })
})
