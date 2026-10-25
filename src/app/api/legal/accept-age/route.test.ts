import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/legal/accept-age — portail 18+ et choix des statistiques. Route
 * publique, sans compte : corps lu borné (1 Ko) sans jamais matérialiser un
 * corps hostile, quota par réseau compté avant toute lecture et tout
 * effacement, refus d'un autre site. Vraie route, vrais quotas, base et
 * cookies simulés.
 */

const { cookieJar, eraseVisitorTracking, accountVisitDb, currentUserMock, afterMock } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  eraseVisitorTracking: vi.fn(),
  accountVisitDb: { deleteMany: vi.fn() },
  currentUserMock: vi.fn(),
  afterMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: afterMock,
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/analytics-server', () => ({ eraseVisitorTracking }))
vi.mock('@/lib/prisma', () => ({ prisma: { accountVisit: accountVisitDb } }))

import { POST } from './route'

let seq = 0
let ip = ''

const send = (body: BodyInit | null, headers: Record<string, string> = {}, from = ip) =>
  POST(
    new Request('http://test/api/legal/accept-age', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': from, ...headers },
      body,
      ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
    } as RequestInit)
  )

const cookiesOf = (res: Response) => res.headers.getSetCookie().join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  seq += 1
  ip = `198.51.100.${seq}`
  cookieJar.clear()
  currentUserMock.mockResolvedValue(null)
  eraseVisitorTracking.mockResolvedValue(undefined)
  accountVisitDb.deleteMany.mockResolvedValue({ count: 0 })
})

describe('corps borné', () => {
  it('accord sous le libellé actuel : âge et accord posés', async () => {
    const res = await send(JSON.stringify({ analytics: true, consentVersion: '2' }))
    expect(res.status).toBe(200)
    expect(cookiesOf(res)).toContain('lp_age_verified=1')
    expect(cookiesOf(res)).toContain('lp_analytics_consent=2')
  })

  it('corps vide (ancien client) : refus par défaut, comme avant', async () => {
    const res = await send(null)
    expect(res.status).toBe(200)
    expect(cookiesOf(res)).toContain('lp_analytics_consent=0')
  })

  it('corps de plus de 1 Ko : jamais parsé, refus par défaut — un accord gonflé ne vaut rien', async () => {
    const res = await send(
      JSON.stringify({ analytics: true, consentVersion: '2', padding: 'x'.repeat(2000) })
    )
    expect(res.status).toBe(200)
    expect(cookiesOf(res)).toContain('lp_analytics_consent=0')
    expect(cookiesOf(res)).not.toContain('lp_analytics_consent=2')
  })

  it('corps en flux sans Content-Length : lecture coupée dès le plafond, le reste n’est jamais tiré', async () => {
    let pulled = 0
    const chunk = new TextEncoder().encode('[' + '[],'.repeat(340) + '[]')
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        if (pulled > 10_000) controller.close()
        else controller.enqueue(chunk)
      },
    })

    const res = await send(stream)

    expect(res.status).toBe(200)
    expect(pulled).toBeLessThan(10)
  })
})

describe('quota par réseau', () => {
  it('60 choix par 10 minutes, puis 429 rate_limited sans rien effacer ; un autre réseau passe', async () => {
    cookieJar.set('lp_vid', 'a'.repeat(32))
    for (let i = 0; i < 60; i += 1) {
      expect((await send(JSON.stringify({ analytics: false }))).status).toBe(200)
    }
    expect(eraseVisitorTracking).toHaveBeenCalledTimes(60)

    const refused = await send(JSON.stringify({ analytics: false }))
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: 'rate_limited', code: 'rate_limited' })
    expect(refused.headers.getSetCookie()).toEqual([])
    expect(eraseVisitorTracking).toHaveBeenCalledTimes(60)

    expect((await send(JSON.stringify({ analytics: false }), {}, '203.0.113.9')).status).toBe(200)
  })

  it('une plage IPv6 /64 compte pour un seul réseau', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 62; i += 1) {
      const res = await send(JSON.stringify({ analytics: true, consentVersion: '2' }), {}, `2001:db8:${seq}::${i + 1}`)
      statuses.push(res.status)
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(2)
  })
})

describe('enveloppe commune', () => {
  it('envoi depuis un autre site : 403 cross_site_request, aucun cookie posé', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await send(JSON.stringify({ analytics: true, consentVersion: '2' }), {
      origin: 'https://ailleurs.example',
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'cross_site_request', code: 'cross_site_request' })
    expect(res.headers.getSetCookie()).toEqual([])
    warn.mockRestore()
  })
})
