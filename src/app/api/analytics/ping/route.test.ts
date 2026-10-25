import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PING_NETWORK_LIMIT_PER_MINUTE,
  PING_NEW_PRESENCE_GLOBAL_CAP_PER_HOUR,
  PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR,
} from '@/lib/analytics-ping'

/**
 * POST /api/analytics/ping — route publique, la plus appelée du site. Vraie
 * route, vrais quotas (rate-limit.ts, en mémoire), base et cookies simulés :
 * quota par réseau avant toute écriture, créations de présence bornées par
 * réseau puis globalement (cookie neuf comme lp_vid forgé inconnu de la
 * base), lp_vid hors format jamais recopié, refus d'un autre site.
 */

const { sitePresenceDb, analytics, cookieJar, ipSeen } = vi.hoisted(() => ({
  sitePresenceDb: { findUnique: vi.fn() },
  analytics: {
    eraseVisitorTracking: vi.fn(),
    recordAccountPresence: vi.fn(),
    recordVisitorPing: vi.fn(),
    syncVisitorLocalPlayers: vi.fn(),
  },
  cookieJar: new Map<string, string>(),
  ipSeen: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { sitePresence: sitePresenceDb } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
}))
vi.mock('@/lib/auth-server', () => ({
  VISITOR_COOKIE: 'lp_vid',
  createVisitorId: () => randomBytes(16).toString('hex'),
  getCurrentSession: vi.fn(async () => null),
  renewSessionIfStale: vi.fn(async () => null),
  sessionCookieOptions: vi.fn(),
  visitorCookieOptions: (value: string) => ({ name: 'lp_vid', value, path: '/', httpOnly: true }),
}))
vi.mock('@/lib/analytics-server', () => analytics)
vi.mock('@/lib/account-visits-server', () => ({ recordAccountBeat: vi.fn() }))
vi.mock('@/lib/ip-history-server', () => ({ recordIpSeen: ipSeen }))
vi.mock('@/lib/retention-sweep', () => ({ runRetentionSweep: vi.fn(async () => undefined) }))

type RouteModule = typeof import('./route')
let route: RouteModule

/**
 * Chaque test a son réseau ET un module neuf : les compteurs vivent en
 * mémoire, le plafond global compris, ils ne doivent pas déborder d'un test à
 * l'autre.
 */
let seq = 0
let ip = ''

const ping = (body: unknown = { beat: true }, from = ip, headers: Record<string, string> = {}) =>
  route.POST(
    new Request('http://test/api/analytics/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': from, ...headers },
      body: JSON.stringify(body),
    })
  )

const newVisitorCookie = (res: Response): string | null => {
  const header = res.headers.get('set-cookie') ?? ''
  return /lp_vid=([0-9a-f]{32})/.exec(header)?.[1] ?? null
}

const visitorIdsWritten = () => analytics.recordVisitorPing.mock.calls.map((call) => call[0] as string)

beforeEach(async () => {
  vi.clearAllMocks()
  seq += 1
  ip = `198.51.100.${seq}`
  cookieJar.clear()
  cookieJar.set('lp_analytics_consent', '2')
  sitePresenceDb.findUnique.mockResolvedValue(null)
  analytics.recordVisitorPing.mockResolvedValue(undefined)
  analytics.syncVisitorLocalPlayers.mockResolvedValue(true)
  vi.resetModules()
  route = await import('./route')
})

describe('quota par réseau, avant toute écriture', () => {
  it('120 pings par minute, puis 429 rate_limited sans rien écrire ; un autre réseau passe', async () => {
    const knownVisitor = randomBytes(16).toString('hex')
    cookieJar.set('lp_vid', knownVisitor)
    sitePresenceDb.findUnique.mockResolvedValue({ visitorId: knownVisitor })

    for (let i = 0; i < PING_NETWORK_LIMIT_PER_MINUTE; i += 1) {
      expect((await ping()).status).toBe(200)
    }
    expect(analytics.recordVisitorPing).toHaveBeenCalledTimes(PING_NETWORK_LIMIT_PER_MINUTE)

    const refused = await ping()
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: 'rate_limited', code: 'rate_limited' })
    expect(analytics.recordVisitorPing).toHaveBeenCalledTimes(PING_NETWORK_LIMIT_PER_MINUTE)
    expect(ipSeen).toHaveBeenCalledTimes(PING_NETWORK_LIMIT_PER_MINUTE)

    expect((await ping({ beat: true }, '203.0.113.250')).status).toBe(200)
  })

  it('le réseau compte une plage IPv6 /64 entière, pas chaque adresse', async () => {
    cookieJar.set('lp_vid', randomBytes(16).toString('hex'))
    sitePresenceDb.findUnique.mockResolvedValue({ visitorId: 'x' })
    const statuses: number[] = []
    for (let i = 0; i < PING_NETWORK_LIMIT_PER_MINUTE + 5; i += 1) {
      statuses.push((await ping({ beat: true }, `2001:db8:${seq}:7::${(i + 1).toString(16)}`)).status)
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(5)
  })
})

describe('création de présences bornée', () => {
  it('sans lp_vid : 20 présences par heure et par réseau, puis plus rien d’écrit (200, sans cookie)', async () => {
    const created: string[] = []
    for (let i = 0; i < PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR + 10; i += 1) {
      const res = await ping()
      expect(res.status).toBe(200)
      const vid = newVisitorCookie(res)
      if (vid) created.push(vid)
    }
    expect(new Set(created).size).toBe(PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR)
    expect(visitorIdsWritten()).toEqual(created)
    expect(ipSeen).toHaveBeenCalledTimes(PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR)

    // Un autre réseau garde son propre quota.
    expect(newVisitorCookie(await ping({ beat: true }, '203.0.113.251'))).not.toBeNull()
  })

  it('lp_vid forgé à chaque requête, inconnu de la base : même quota de créations', async () => {
    for (let i = 0; i < PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR + 10; i += 1) {
      cookieJar.set('lp_vid', randomBytes(16).toString('hex'))
      expect((await ping()).status).toBe(200)
    }
    expect(analytics.recordVisitorPing).toHaveBeenCalledTimes(PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR)
    expect(ipSeen).toHaveBeenCalledTimes(PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR)
  })

  it('un navigateur déjà connu de la base n’entame pas le quota de créations', async () => {
    const knownVisitor = randomBytes(16).toString('hex')
    cookieJar.set('lp_vid', knownVisitor)
    sitePresenceDb.findUnique.mockResolvedValue({ visitorId: knownVisitor })
    for (let i = 0; i < PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR + 10; i += 1) await ping()
    expect(analytics.recordVisitorPing).toHaveBeenCalledTimes(PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR + 10)

    // Le quota de créations du réseau est intact.
    cookieJar.delete('lp_vid')
    expect(newVisitorCookie(await ping())).not.toBeNull()
  })

  it('plafond global horaire, que les refus par réseau n’entament pas', async () => {
    const perNetwork = PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR
    const networks = PING_NEW_PRESENCE_GLOBAL_CAP_PER_HOUR / perNetwork

    // Un réseau qui insiste : 20 créations, 15 refus — hors du plafond commun.
    for (let i = 0; i < perNetwork + 15; i += 1) await ping({ beat: true }, '192.0.2.1')
    for (let n = 1; n < networks; n += 1) {
      for (let i = 0; i < perNetwork; i += 1) {
        expect(newVisitorCookie(await ping({ beat: true }, `10.2.${n}.1`))).not.toBeNull()
      }
    }
    expect(analytics.recordVisitorPing).toHaveBeenCalledTimes(PING_NEW_PRESENCE_GLOBAL_CAP_PER_HOUR)

    // Réseau neuf, quota propre intact : refusé par le plafond global.
    const res = await ping({ beat: true }, '10.9.9.9')
    expect(res.status).toBe(200)
    expect(newVisitorCookie(res)).toBeNull()
    expect(analytics.recordVisitorPing).toHaveBeenCalledTimes(PING_NEW_PRESENCE_GLOBAL_CAP_PER_HOUR)
  })
})

describe('lp_vid hors format', () => {
  it('une valeur forgée de plusieurs Ko n’est recopiée nulle part : nouveau lp_vid posé', async () => {
    const forged = 'f'.repeat(3000)
    cookieJar.set('lp_vid', forged)

    const res = await ping()

    expect(res.status).toBe(200)
    const vid = newVisitorCookie(res)
    expect(vid).toMatch(/^[0-9a-f]{32}$/)
    expect(visitorIdsWritten()).toEqual([vid])
    expect(JSON.stringify(ipSeen.mock.calls)).not.toContain(forged)
    expect(JSON.stringify(sitePresenceDb.findUnique.mock.calls)).not.toContain(forged)
  })

  it('sans accord, le cookie forgé est retiré sans effacement ciblé', async () => {
    cookieJar.set('lp_analytics_consent', '1')
    cookieJar.set('lp_vid', 'pas-un-identifiant')

    const res = await ping()

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie') ?? '').toMatch(/lp_vid=;/)
    expect(analytics.eraseVisitorTracking).not.toHaveBeenCalled()
    expect(analytics.recordVisitorPing).not.toHaveBeenCalled()
  })
})

describe('enveloppe commune', () => {
  it('envoi depuis un autre site : 403 cross_site_request, rien d’écrit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await ping({ beat: true }, ip, { 'sec-fetch-site': 'cross-site' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'cross_site_request', code: 'cross_site_request' })
    expect(analytics.recordVisitorPing).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
