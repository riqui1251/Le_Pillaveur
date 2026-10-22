import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/login — quotas.
 *
 * Vraie route, base et session simulées. Le quota par couple (IP, e-mail)
 * freine l'acharnement sur UN compte ; le plafond par réseau freine le script
 * qui essaie un mot de passe sur des milliers d'adresses depuis une seule IP
 * (chaque adresse neuve repartait de zéro).
 */

const { userDb } = vi.hoisted(() => ({
  userDb: { findUnique: vi.fn(), update: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ has: () => false, get: () => undefined }),
}))
vi.mock('@/lib/auth-server', () => ({
  createSession: vi.fn(async () => 'jeton-session'),
  clearLocalPlayCookieOptions: () => ({ name: 'lp_local_play', value: '', path: '/', maxAge: 0 }),
  deleteIncomingSession: vi.fn(async () => {}),
  isValidEmail: (email: string) => email.includes('@'),
  sessionCookieOptions: (token: string) => ({ name: 'lp_session', value: token, path: '/' }),
  verifyPassword: vi.fn(async () => false),
}))
vi.mock('@/lib/account-code', () => ({ ensureUserAccountCode: vi.fn(async () => 'CODE1234') }))
vi.mock('@/lib/ban-server', () => ({
  clearExpiredBanIfNeeded: vi.fn(async () => {}),
  getBanState: () => ({ banned: false }),
}))
vi.mock('@/lib/name-moderation-attempts-server', () => ({ linkVisitorNameModerationAttempts: vi.fn() }))
vi.mock('@/lib/auth-cookies', () => ({ readConsentedVisitorId: () => null }))

import { POST } from './route'

const login = (ip: string, email: string) =>
  POST(
    new Request('http://test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password: 'devine-moi-1' }),
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  userDb.findUnique.mockResolvedValue(null)
})

describe('POST /api/auth/login — quotas', () => {
  it('une même adresse depuis une même IP : coupée au 11e essai', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await login('192.0.2.10', 'cible@exemple.fr')).status).toBe(401)
    }
    expect((await login('192.0.2.10', 'cible@exemple.fr')).status).toBe(429)
  })

  it('mille adresses depuis une seule IP : le réseau est coupé au 31e essai', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await login('192.0.2.20', `victime${i}@exemple.fr`)).status).toBe(401)
    }
    const blocked = await login('192.0.2.20', 'victime30@exemple.fr')
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toMatchObject({ code: 'rate_limited' })
    // Le réseau voisin n'est pas touché.
    expect((await login('192.0.2.21', 'victime30@exemple.fr')).status).toBe(401)
  })
})
