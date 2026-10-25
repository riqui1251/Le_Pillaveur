import { beforeEach, describe, expect, it, vi } from 'vitest'

/** POST /api/name-moderation/dismiss-warning — écriture d'un compte connecté, refusée depuis un autre site. */

const { userDb, currentUserMock } = vi.hoisted(() => ({
  userDb: { update: vi.fn(), updateMany: vi.fn() },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))

import { POST } from './route'

/** Next passe toujours la requête au handler, même quand il ne la déclare pas. */
const handler = POST as unknown as (request: Request) => Promise<Response>

const send = (headers: Record<string, string> = {}) =>
  handler(new Request('http://test/api/name-moderation/dismiss-warning', { method: 'POST', headers }))

beforeEach(() => {
  vi.clearAllMocks()
  currentUserMock.mockResolvedValue({ id: 'compte-1' })
  userDb.update.mockResolvedValue({})
  userDb.updateMany.mockResolvedValue({ count: 1 })
})

describe('dismiss-warning', () => {
  it('même origine : bandeau fermé', async () => {
    const res = await send({ origin: 'http://test' })
    expect(res.status).toBe(200)
  })

  it('envoi depuis un autre site : 403 cross_site_request, rien d’écrit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await send({ 'sec-fetch-site': 'cross-site' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'cross_site_request', code: 'cross_site_request' })
    expect(userDb.update).not.toHaveBeenCalled()
    expect(userDb.updateMany).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
