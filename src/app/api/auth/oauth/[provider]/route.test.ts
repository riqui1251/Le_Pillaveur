import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/oauth/[provider] — aller Discord / Facebook.
 * La connexion part sans session ; pérennisation et suppression exigent la
 * session du compte concerné, et la suppression une identité déjà liée.
 */

const { linkDb, userDb, currentUserMock, credentialsMock } = vi.hoisted(() => ({
  linkDb: { findFirst: vi.fn() },
  userDb: { findUnique: vi.fn() },
  currentUserMock: vi.fn(),
  credentialsMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { oAuthAccount: linkDb, user: userDb } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/oauth-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/oauth-server')>()),
  oauthCredentials: credentialsMock,
}))

import { POST } from './route'
import { decodeOAuthState, OAUTH_STATE_COOKIE } from '@/lib/oauth-server'

let seq = 0
const aller = (body: Record<string, unknown>, provider = 'discord') =>
  POST(
    new Request(`http://test/api/auth/oauth/${provider}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${++seq}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ provider }) }
  )

/** Valeur du cookie d'état posé par la réponse. */
function stateCookie(res: Response): string | undefined {
  const header = res.headers.get('set-cookie') ?? ''
  return new RegExp(`${OAUTH_STATE_COOKIE}=([^;]+)`).exec(header)?.[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  credentialsMock.mockReturnValue({ clientId: 'id-app', clientSecret: 'secret-app' })
  currentUserMock.mockResolvedValue(null)
  userDb.findUnique.mockResolvedValue({ passwordHash: '' })
})

describe('POST /api/auth/oauth/[provider]', () => {
  it('connexion : adresse du fournisseur + état posé dans le cookie, destination nettoyée', async () => {
    const res = await aller({ intent: 'login', redirect: '//evil.example', locale: 'es', ambianceMode: 'soft' })

    expect(res.status).toBe(200)
    const { url } = await res.json()
    const authorize = new URL(url)
    expect(authorize.hostname).toBe('discord.com')
    const saved = decodeOAuthState(stateCookie(res))
    expect(saved).toMatchObject({
      provider: 'discord',
      intent: 'login',
      redirect: '/joueurs',
      locale: 'es',
      ambianceMode: 'soft',
      userId: null,
    })
    expect(authorize.searchParams.get('state')).toBe(saved?.state)
  })

  it('fournisseur non configuré sur ce serveur : 503', async () => {
    credentialsMock.mockReturnValue(null)
    const res = await aller({})
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('oauth_unavailable')
  })

  it('fournisseur inconnu : 404', async () => {
    const res = await aller({}, 'twitter')
    expect(res.status).toBe(404)
  })

  it('suppression sans session (lien venu d’un autre site) : 401, aucun état posé', async () => {
    const res = await aller({ intent: 'delete' })
    expect(res.status).toBe(401)
    expect(stateCookie(res)).toBeUndefined()
  })

  it('suppression par un service non lié au compte : 403', async () => {
    currentUserMock.mockResolvedValue({ id: 'compte-1', role: 'user', isGuest: false })
    linkDb.findFirst.mockResolvedValue(null)
    const res = await aller({ intent: 'delete' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('oauth_not_linked')
  })

  it('suppression par le service lié : l’état retient le compte et l’intention', async () => {
    currentUserMock.mockResolvedValue({ id: 'compte-1', role: 'user', isGuest: false })
    linkDb.findFirst.mockResolvedValue({ id: 'lien' })
    const res = await aller({ intent: 'delete' })
    expect(res.status).toBe(200)
    expect(new URL((await res.json()).url).searchParams.get('prompt')).toBe('consent')
    expect(decodeOAuthState(stateCookie(res))).toMatchObject({ intent: 'delete', userId: 'compte-1' })
  })

  it('suppression d’un compte à mot de passe : refusée, le mot de passe reste la preuve', async () => {
    currentUserMock.mockResolvedValue({ id: 'compte-1', role: 'user', isGuest: false })
    linkDb.findFirst.mockResolvedValue({ id: 'lien' })
    userDb.findUnique.mockResolvedValue({ passwordHash: 'hash' })
    const res = await aller({ intent: 'delete' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('wrong_password')
    expect(stateCookie(res)).toBeUndefined()
  })

  it('pérennisation réservée aux invités', async () => {
    currentUserMock.mockResolvedValue({ id: 'compte-1', role: 'user', isGuest: false })
    const res = await aller({ intent: 'upgrade' })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('not_guest')
  })
})
