import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/tv/cast — création d'une salle de cast. Vraie route, base,
 * session et générateur de code simulés. Ce qu'on tient : refus en codes
 * stables (enveloppe commune), corps borné, écriture d'un autre site refusée.
 */

const { db, currentUserMock } = vi.hoisted(() => ({
  db: { onlineRoom: { deleteMany: vi.fn(), create: vi.fn() } },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/online-room', () => ({ createUniqueRoomCode: vi.fn(async () => 'NEW234') }))

import { POST } from './route'
import { MAX_CAST_BODY_BYTES } from '@/lib/cast-types'

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/tv/cast', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  currentUserMock.mockResolvedValue({ id: 'host-1' })
  db.onlineRoom.deleteMany.mockResolvedValue({ count: 0 })
  db.onlineRoom.create.mockImplementation(async ({ data }) => ({ id: 'room-cast', ...data }))
})

describe('POST /api/tv/cast', () => {
  it('jeu diffusable : salle créée, code rendu', async () => {
    const res = await post(JSON.stringify({ gameId: 'plinko', state: '{}' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ code: 'NEW234' })
  })

  it('corps au-delà du plafond : 413 payload_too_large, rien de créé', async () => {
    const res = await post(JSON.stringify({ gameId: 'plinko', state: 'x'.repeat(MAX_CAST_BODY_BYTES) }))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('payload_too_large')
    expect(db.onlineRoom.create).not.toHaveBeenCalled()
  })

  it('jeu non diffusable : 400 invalid_game', async () => {
    const res = await post(JSON.stringify({ gameId: 'menteur' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_game')
  })

  it('sans compte : 401 auth_required', async () => {
    currentUserMock.mockResolvedValue(null)
    const res = await post(JSON.stringify({ gameId: 'plinko' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('auth_required')
  })

  it('écriture venue d’un autre site : 403 cross_site_request, aucune salle purgée', async () => {
    const res = await post(JSON.stringify({ gameId: 'plinko' }), { 'sec-fetch-site': 'cross-site' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('cross_site_request')
    expect(db.onlineRoom.deleteMany).not.toHaveBeenCalled()
  })
})
