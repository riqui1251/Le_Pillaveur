import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/name-moderation/attempt — journal des pseudos refusés, ouvert aux
 * anonymes. Vraie route, vrais quotas (rate-limit.ts, en mémoire), base et
 * cookies simulés : 20 lignes par heure et par RÉSEAU, une plage IPv6 /64 ne
 * se contourne plus en changeant d'adresse ; refus d'un autre site.
 */

const { attemptDb, userDb, currentUserMock } = vi.hoisted(() => ({
  attemptDb: { create: vi.fn(), count: vi.fn() },
  userDb: { updateMany: vi.fn() },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { nameModerationAttempt: attemptDb, user: userDb } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/auth-server', () => ({
  getCurrentUser: currentUserMock,
  createVisitorId: () => 'f'.repeat(32),
  visitorCookieOptions: (value: string) => ({ name: 'lp_vid', value, path: '/' }),
}))

import { POST } from './route'

let seq = 0

const send = (from: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://test/api/name-moderation/attempt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': from, ...headers },
      body: JSON.stringify({ attemptedName: 'Pseudo', reason: 'profanity', context: 'register' }),
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  seq += 1
  currentUserMock.mockResolvedValue(null)
  attemptDb.create.mockResolvedValue({})
  attemptDb.count.mockResolvedValue(0)
})

describe('quota par réseau', () => {
  it('40 adresses d’un même /64 : 20 lignes par heure en tout, puis 429', async () => {
    const statuses: number[] = []
    for (let a = 1; a <= 40; a += 1) {
      statuses.push((await send(`2001:db8:${seq}:5::${a.toString(16)}`)).status)
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(20)
    expect(statuses.filter((s) => s === 429)).toHaveLength(20)
    expect(attemptDb.create).toHaveBeenCalledTimes(20)

    // Un autre /64 garde son propre quota.
    expect((await send(`2001:db8:${seq}:6::1`)).status).toBe(200)
  })
})

describe('enveloppe commune', () => {
  it('envoi depuis un autre site : 403 cross_site_request, rien d’écrit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await send(`10.11.${seq}.1`, { origin: 'https://ailleurs.example' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'cross_site_request', code: 'cross_site_request' })
    expect(attemptDb.create).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
