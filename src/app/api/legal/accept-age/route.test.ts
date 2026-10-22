import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/legal/accept-age — portail 18+ et choix des statistiques.
 *
 * Vraie route, cookies et base simulés. Route publique (aucune session) : le
 * corps est lu borné, un corps démesuré est refusé sans rien poser.
 */

const { eraseMock } = vi.hoisted(() => ({ eraseMock: vi.fn(async () => {}) }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ has: () => false, get: () => undefined }),
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: vi.fn(async () => null) }))
vi.mock('@/lib/analytics-server', () => ({ eraseVisitorTracking: eraseMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { accountVisit: { deleteMany: vi.fn() } } }))

import { POST } from './route'

const accept = (body: string) =>
  POST(
    new Request('http://test/api/legal/accept-age', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/legal/accept-age', () => {
  it('accord au libellé actuel : âge et statistiques posés', async () => {
    const res = await accept(JSON.stringify({ analytics: true, consentVersion: '2' }))
    expect(res.status).toBe(200)
    const cookies = res.headers.get('set-cookie') ?? ''
    expect(cookies).toContain('lp_age_verified=1')
    expect(cookies).toContain('lp_analytics_consent=2')
  })

  it('corps vide (ancien client) : âge posé, statistiques refusées', async () => {
    const res = await accept('')
    expect(res.status).toBe(200)
    const cookies = res.headers.get('set-cookie') ?? ''
    expect(cookies).toContain('lp_age_verified=1')
    expect(cookies).toContain('lp_analytics_consent=0')
  })

  it('corps démesuré : 413, aucun cookie posé', async () => {
    const res = await accept(JSON.stringify({ analytics: true, consentVersion: '2', bourrage: 'x'.repeat(64 * 1024) }))
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ code: 'payload_too_large' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
