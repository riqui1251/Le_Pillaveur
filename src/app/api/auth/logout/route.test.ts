import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/logout — déconnexion forcée depuis un autre site.
 *
 * Le cookie Lax n'est pas envoyé par un formulaire posté depuis une page
 * tierce, mais la réponse « lp_session=; Max-Age=0 » était appliquée par le
 * navigateur : un invité, dont le cookie est la seule clé, perdait son compte.
 * Vraie route ; session et cookies simulés.
 */

const { deleteSessionMock } = vi.hoisted(() => ({ deleteSessionMock: vi.fn(async () => {}) }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'lp_session' ? { name, value: 'jeton' } : undefined) }),
}))
vi.mock('@/lib/auth-server', () => ({
  SESSION_COOKIE: 'lp_session',
  clearSessionCookieOptions: () => ({ name: 'lp_session', value: '', path: '/', maxAge: 0 }),
  deleteSession: deleteSessionMock,
}))

import { POST } from './route'

// Le handler n'a pas besoin de la requête, mais Next (et l'enveloppe) la reçoivent.
const logout = (headers: Record<string, string> = {}) =>
  (POST as unknown as (request: Request) => Promise<Response>)(
    new Request('http://test/api/auth/logout', { method: 'POST', headers })
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/logout', () => {
  it('formulaire posté depuis une page tierce : 403, cookie et session intacts', async () => {
    const res = await logout({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('cross_site_request')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(deleteSessionMock).not.toHaveBeenCalled()
  })

  it('depuis le site : session supprimée, cookie effacé', async () => {
    const res = await logout({ origin: 'http://test', 'sec-fetch-site': 'same-origin' })

    expect(res.status).toBe(200)
    expect(deleteSessionMock).toHaveBeenCalledWith('jeton')
    expect(res.headers.get('set-cookie')).toContain('lp_session=;')
  })
})
