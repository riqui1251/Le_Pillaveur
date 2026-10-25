import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/tv/cast/[code]/frame — trame de billes relayée vers la TV par le
 * bus mémoire. Vraie route, base, session et bus simulés. Ce qu'on tient : la
 * trame est bornée avant d'être lue en entier, et le débit est plafonné par
 * compte (chaque trame est recopiée dans chaque flux TV de la salle).
 */

const { db, currentUserMock, publishMock } = vi.hoisted(() => ({
  db: { onlineRoom: { findUnique: vi.fn() } },
  currentUserMock: vi.fn(),
  publishMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/online/room-bus', () => ({ publishCastFrame: publishMock }))

import { POST } from './route'
import { MAX_CAST_FRAME_BYTES } from '@/lib/cast-types'

const CODE = 'CAST23'

let seq = 0
const newHost = () => {
  seq += 1
  const id = `host-${seq}`
  currentUserMock.mockResolvedValue({ id })
  db.onlineRoom.findUnique.mockResolvedValue({ id: 'room-cast', status: 'cast', hostUserId: id })
  return id
}

const post = (body: string) =>
  POST(
    new Request(`http://localhost/api/tv/cast/${CODE}/frame`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: CODE }) }
  )

const frame = JSON.stringify({ balls: [{ x: 12.5, y: 40, color: 'red' }] })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/tv/cast/[code]/frame', () => {
  it('trame valide : relayée telle quelle', async () => {
    newHost()
    expect((await post(frame)).status).toBe(200)
    expect(publishMock).toHaveBeenCalledWith('room-cast', JSON.parse(frame))
  })

  it('trame au-delà de 16 Ko : 413, rien de relayé', async () => {
    newHost()
    const huge = JSON.stringify({ balls: [], pad: 'x'.repeat(MAX_CAST_FRAME_BYTES) })
    const res = await post(huge)
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('payload_too_large')
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('plafond par compte : au-delà de 1200 trames par minute, 429', async () => {
    newHost()
    const statuses: number[] = []
    for (let i = 0; i < 1201; i += 1) statuses.push((await post(frame)).status)
    expect(statuses.slice(0, 1200).every((s) => s === 200)).toBe(true)
    expect(statuses[1200]).toBe(429)
    expect(publishMock).toHaveBeenCalledTimes(1200)
  })

  it('pas le créateur : 403, rien de relayé', async () => {
    newHost()
    db.onlineRoom.findUnique.mockResolvedValue({ id: 'room-cast', status: 'cast', hostUserId: 'autre' })
    const res = await post(frame)
    expect(res.status).toBe(403)
    expect(publishMock).not.toHaveBeenCalled()
  })
})
