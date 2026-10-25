import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEEDBACK_SCREENSHOT_DAILY_BYTES_CAP } from '@/lib/feedback'

/**
 * POST /api/feedback — retour ouvert aux anonymes. Vraie route, vrais quotas
 * (rate-limit.ts, en mémoire), base et session simulées : quota anonyme par
 * RÉSEAU (une plage IPv6 /64 ne se contourne plus en changeant d'adresse),
 * plafond commun d'octets de captures par 24 h (le texte du retour passe
 * toujours), refus d'un autre site.
 */

const { feedbackDb, currentUserMock } = vi.hoisted(() => ({
  feedbackDb: { create: vi.fn() },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { userFeedback: feedbackDb } }))
vi.mock('@/lib/auth-server', () => ({
  getCurrentUser: currentUserMock,
  isValidEmail: (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
}))

type RouteModule = typeof import('./route')
let route: RouteModule

let seq = 0

const send = (body: unknown, from: string, headers: Record<string, string> = {}) =>
  route.POST(
    new Request('http://test/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': from, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

/** Capture valide d'environ 400 Ko décodés (≈ 533 Ko en base64). */
const SHOT = 'data:image/png;base64,' + 'A'.repeat(Math.floor((400 * 1024 * 4) / 3))
const BUG = { type: 'bug', message: 'Le chrono ne part pas', screenshots: [SHOT, SHOT, SHOT] }

const storedScreenshotBytes = () =>
  feedbackDb.create.mock.calls.reduce((total, [args]) => {
    const raw = args.data.screenshots as string | null
    return total + (raw ? (JSON.parse(raw) as string[]).reduce((sum, s) => sum + s.length, 0) : 0)
  }, 0)

beforeEach(async () => {
  vi.clearAllMocks()
  seq += 1
  currentUserMock.mockResolvedValue(null)
  feedbackDb.create.mockImplementation(async () => ({ id: `retour-${feedbackDb.create.mock.calls.length}` }))
  // Module neuf : quotas et plafond de captures remis à zéro.
  vi.resetModules()
  route = await import('./route')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('quota anonyme par réseau', () => {
  it('30 adresses d’un même /64 : 3 retours par heure en tout, pas 3 par adresse', async () => {
    const statuses: number[] = []
    for (let a = 1; a <= 30; a += 1) {
      for (let i = 0; i < 4; i += 1) {
        const res = await send({ type: 'comment', message: 'Salut' }, `2001:db8:${seq}:2::${a.toString(16)}`)
        statuses.push(res.status)
      }
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(3)
    expect(feedbackDb.create).toHaveBeenCalledTimes(3)

    // Un autre /64 garde son propre quota.
    expect((await send({ type: 'comment', message: 'Salut' }, `2001:db8:${seq}:3::1`)).status).toBe(200)
  })

  it('compte connecté : quota par compte, indépendant du réseau', async () => {
    currentUserMock.mockResolvedValue({ id: `compte-${seq}`, email: 'a@exemple.fr' })
    for (let i = 0; i < 3; i += 1) {
      expect((await send({ type: 'comment', message: 'Salut' }, `10.3.${seq}.${i + 1}`)).status).toBe(200)
    }
    expect((await send({ type: 'comment', message: 'Salut' }, `10.4.${seq}.1`)).status).toBe(429)
  })
})

describe('plafond commun des captures sur 24 h', () => {
  it('au-delà du plafond, les retours passent sans leurs captures ; le plafond n’est jamais dépassé', async () => {
    const perFeedback = SHOT.length * 3
    const admitted = Math.floor(FEEDBACK_SCREENSHOT_DAILY_BYTES_CAP / perFeedback)

    for (let n = 0; n < admitted + 5; n += 1) {
      const res = await send(BUG, `10.5.${Math.floor(n / 200)}.${(n % 200) + 1}`)
      expect(res.status).toBe(200)
    }

    expect(feedbackDb.create).toHaveBeenCalledTimes(admitted + 5)
    expect(storedScreenshotBytes()).toBe(admitted * perFeedback)
    expect(storedScreenshotBytes()).toBeLessThanOrEqual(FEEDBACK_SCREENSHOT_DAILY_BYTES_CAP)
    const last = feedbackDb.create.mock.calls.at(-1)![0].data
    expect(last.screenshots).toBeNull()
    expect(last.message).toBe(BUG.message)
  })

  it('la fenêtre se rouvre après 24 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'))
    const perFeedback = SHOT.length * 3
    const admitted = Math.floor(FEEDBACK_SCREENSHOT_DAILY_BYTES_CAP / perFeedback)
    for (let n = 0; n <= admitted; n += 1) await send(BUG, `10.6.${Math.floor(n / 200)}.${(n % 200) + 1}`)
    expect(feedbackDb.create.mock.calls.at(-1)![0].data.screenshots).toBeNull()

    vi.setSystemTime(new Date('2026-10-21T10:00:01Z'))
    expect((await send(BUG, '10.7.0.1')).status).toBe(200)
    expect(feedbackDb.create.mock.calls.at(-1)![0].data.screenshots).not.toBeNull()
  })
})

describe('enveloppe commune', () => {
  it('envoi depuis un autre site : 403 cross_site_request, rien d’écrit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await send({ type: 'comment', message: 'Salut' }, `10.8.${seq}.1`, {
      'sec-fetch-site': 'cross-site',
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'cross_site_request', code: 'cross_site_request' })
    expect(feedbackDb.create).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
