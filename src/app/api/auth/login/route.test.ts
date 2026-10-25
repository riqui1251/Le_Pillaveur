import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/login — quotas, temps de réponse, calculs bcrypt.
 *
 * Le quota par adresse IP + e-mail se contournait : en changeant d'IP toutes
 * les dix tentatives (force brute sur un compte), ou d'e-mail à chaque essai
 * (un mot de passe essayé sur des milliers de comptes). S'y ajoutent un
 * compteur d'ÉCHECS par réseau et un par compte, appliqués avant tout bcrypt.
 * Un compte inconnu passe par le même calcul qu'un mot de passe faux (pas
 * d'énumération par le temps), et un e-mail géant n'entre plus dans le
 * limiteur. Vraie route ; base, bcrypt, session et cookies simulés. Modules
 * rechargés à chaque test : chacun part d'un limiteur vide.
 */

const { userDb, verifyMock } = vi.hoisted(() => ({
  userDb: { findUnique: vi.fn(), update: vi.fn() },
  verifyMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ has: () => false, get: () => undefined }),
}))
vi.mock('@/lib/auth-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-server')>()),
  createSession: vi.fn(async () => 'jeton-session'),
  deleteIncomingSession: vi.fn(async () => {}),
  verifyPassword: verifyMock,
}))
vi.mock('@/lib/account-code', () => ({ ensureUserAccountCode: vi.fn(async () => 'CODE1234') }))
vi.mock('@/lib/ban-server', () => ({
  clearExpiredBanIfNeeded: vi.fn(async () => {}),
  getBanState: () => ({ banned: false }),
}))
vi.mock('@/lib/name-moderation-attempts-server', () => ({ linkVisitorNameModerationAttempts: vi.fn() }))

const account = {
  id: 'compte-cible',
  email: 'cible@exemple.fr',
  passwordHash: '$2b$12$hash-du-compte',
  displayName: 'Cible',
  name: 'Cible',
  accountCode: 'CIBLE123',
  role: 'user',
  locale: 'fr',
  playMode: 'local',
  ambianceMode: 'alcool',
}

async function login(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { POST } = await import('./route')
  return POST(
    new Request('http://test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )
}

const fromIp = (ip: string) => ({ 'cf-connecting-ip': ip })

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  userDb.findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: string } }) =>
    where.email === account.email || where.id === account.id ? account : null
  )
  userDb.update.mockResolvedValue({})
  verifyMock.mockResolvedValue(false)
})

describe('POST /api/auth/login — temps de réponse', () => {
  it('adresse inconnue : bcrypt lancé quand même (leurre), même refus qu’un mot de passe faux', async () => {
    const res = await login({ email: 'inconnu@exemple.fr', password: 'Motdepasse1' }, fromIp('198.51.100.1'))

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid_credentials')
    expect(verifyMock).toHaveBeenCalledWith('Motdepasse1', '')
  })

  it('compte sans mot de passe (Google) : même leurre', async () => {
    userDb.findUnique.mockResolvedValue({ ...account, passwordHash: '' })

    const res = await login({ email: account.email, password: 'Motdepasse1' }, fromIp('198.51.100.2'))

    expect(res.status).toBe(401)
    expect(verifyMock).toHaveBeenCalledWith('Motdepasse1', '')
  })

  it('bon mot de passe : connexion', async () => {
    verifyMock.mockResolvedValue(true)

    const res = await login({ email: account.email, password: 'Motdepasse1' }, fromIp('198.51.100.3'))

    expect(res.status).toBe(200)
    expect((await res.json()).user.id).toBe('compte-cible')
    expect(res.headers.get('set-cookie')).toContain('lp_session=jeton-session')
  })
})

describe('POST /api/auth/login — quotas', () => {
  it('force brute sur un compte en changeant d’IP : 20 échecs, puis 429 sans bcrypt', async () => {
    const statuses: number[] = []
    for (let i = 1; i <= 21; i += 1) {
      statuses.push((await login({ email: account.email, password: `essai${i}` }, fromIp(`203.0.113.${i}`))).status)
    }

    expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true)
    expect(statuses[20]).toBe(429)
    expect(verifyMock).toHaveBeenCalledTimes(20)
  })

  it('pulvérisation depuis un même /64 IPv6 sur des comptes différents : 50 échecs, puis 429 sans bcrypt', async () => {
    const statuses: number[] = []
    for (let i = 1; i <= 51; i += 1) {
      const res = await login(
        { email: `joueur${i}@exemple.fr`, password: 'Azerty123' },
        fromIp(`2001:db8:abcd:12::${i.toString(16)}`)
      )
      statuses.push(res.status)
    }

    expect(statuses.slice(0, 50).every((status) => status === 401)).toBe(true)
    expect(statuses[50]).toBe(429)
    expect(verifyMock).toHaveBeenCalledTimes(50)
  })

  it('les connexions réussies ne comptent pas comme des échecs', async () => {
    verifyMock.mockResolvedValue(true)

    for (let i = 1; i <= 25; i += 1) {
      const res = await login({ email: account.email, password: 'Motdepasse1' }, fromIp(`192.0.2.${i}`))
      expect(res.status).toBe(200)
    }
  })

  it('« e-mail » de 8 000 caractères : refusé avant le limiteur, jamais mémorisé', async () => {
    const giant = `${'a'.repeat(8000)}@exemple.fr`
    const statuses: number[] = []
    for (let i = 0; i < 15; i += 1) {
      statuses.push((await login({ email: giant, password: 'Motdepasse1' }, fromIp('198.51.100.9'))).status)
    }

    expect(statuses.every((status) => status === 401)).toBe(true)
    expect(userDb.findUnique).not.toHaveBeenCalled()
  })

  it('trop de calculs bcrypt en cours : 503 avec Retry-After', async () => {
    const { PasswordHashBusyError } = await import('@/lib/auth-server')
    verifyMock.mockRejectedValue(new PasswordHashBusyError())

    const res = await login({ email: account.email, password: 'Motdepasse1' }, fromIp('198.51.100.10'))

    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('2')
    expect(await res.json()).toMatchObject({ error: 'service_unavailable', retryAfterSec: 2 })
  })
})

describe('POST /api/auth/login — écriture venue d’un autre site', () => {
  it('formulaire posté depuis une page tierce : 403 avant toute lecture', async () => {
    const res = await login(
      { email: 'attaquant@exemple.fr', password: 'Motdepasse1', x: '=' },
      { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' }
    )

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('cross_site_request')
    expect(userDb.findUnique).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
