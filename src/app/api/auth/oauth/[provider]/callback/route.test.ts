import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/auth/oauth/[provider]/callback — retour Discord / Facebook.
 *
 * Vraie route ; base, session, fournisseur et cookies simulés. On vérifie ce
 * qui protège les comptes : l'état de l'aller est exigé, une adresse non
 * confirmée ne retrouve ni ne crée aucun compte, l'identité du fournisseur
 * prime sur l'adresse, et seule une identité LIÉE au compte connecté en
 * confirme la suppression.
 */

const { userDb, linkDb, cookieJar, profileMock, currentUserMock, deleteUserMock, createSessionMock } = vi.hoisted(
  () => ({
    userDb: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    linkDb: { findUnique: vi.fn(), upsert: vi.fn() },
    cookieJar: new Map<string, string>(),
    profileMock: vi.fn(),
    currentUserMock: vi.fn(),
    deleteUserMock: vi.fn(async () => {}),
    createSessionMock: vi.fn(async () => 'jeton-session'),
  })
)

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: userDb,
    oAuthAccount: linkDb,
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    has: (name: string) => cookieJar.has(name),
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}))
vi.mock('@/lib/auth-server', () => ({
  createSession: createSessionMock,
  clearLocalPlayCookieOptions: () => ({ name: 'lp_local_play', value: '', path: '/', maxAge: 0 }),
  clearSessionCookieOptions: () => ({ name: 'lp_session', value: '', path: '/', maxAge: 0 }),
  deleteIncomingSession: vi.fn(async () => {}),
  getCurrentUser: currentUserMock,
  sessionCookieOptions: (token: string) => ({ name: 'lp_session', value: token, path: '/' }),
}))
vi.mock('@/lib/account-code', () => ({ createUniqueAccountCode: vi.fn(async () => 'CODE1234') }))
vi.mock('@/lib/ban-server', () => ({
  clearExpiredBanIfNeeded: vi.fn(async () => {}),
  getBanState: (user: { banType?: string | null }) => ({ banned: Boolean(user.banType) }),
}))
vi.mock('@/lib/display-name', () => ({
  DISPLAY_NAME_MAX_LENGTH: 30,
  getDisplayNameValidationError: () => null,
  isDisplayNameTaken: async () => false,
}))
vi.mock('@/lib/name-moderation/extra-terms-server', () => ({ ensureServerModerationTermsLoaded: async () => {} }))
vi.mock('@/lib/name-moderation-attempts-server', () => ({ linkVisitorNameModerationAttempts: vi.fn() }))
vi.mock('@/lib/ip-history-server', () => ({ recordIpSeen: vi.fn(async () => {}) }))
vi.mock('@/lib/auth-cookies', () => ({ readConsentedVisitorId: () => null }))
vi.mock('@/lib/user-activity-server', () => ({ deleteUserAccount: deleteUserMock }))
vi.mock('@/lib/oauth-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/oauth-server')>()),
  oauthCredentials: () => ({ clientId: 'id-app', clientSecret: 'secret-app' }),
  fetchOAuthProfile: profileMock,
}))

import { GET, POST } from './route'
import { encodeOAuthState, OAUTH_NAME_COOKIE, OAUTH_STATE_COOKIE, type OAuthState } from '@/lib/oauth-server'

const STATE = 's'.repeat(43)

function aller(overrides: Partial<OAuthState> = {}) {
  cookieJar.set(
    OAUTH_STATE_COOKIE,
    encodeOAuthState({
      state: STATE,
      provider: 'discord',
      intent: 'login',
      redirect: '/jeux?join=ABC123',
      locale: 'fr',
      ambianceMode: null,
      userId: null,
      ...overrides,
    })
  )
}

let seq = 0
async function retour(query: Record<string, string> = { code: 'code-1', state: STATE }, provider = 'discord') {
  const res = await GET(
    new Request(`http://test/api/auth/oauth/${provider}/callback?${new URLSearchParams(query)}`, {
      headers: { 'x-forwarded-for': `198.51.100.${++seq}` },
    }),
    { params: Promise.resolve({ provider }) }
  )
  const location = new URL(res.headers.get('location') ?? '', 'http://x')
  return { res, location, path: location.pathname, params: location.searchParams }
}

const discordProfile = { id: 'discord-42', email: 'kevin@exemple.fr', emailVerified: true, name: 'Kevin' }

const kevin = {
  id: 'compte-kevin',
  email: 'kevin@exemple.fr',
  emailVerified: new Date('2026-01-01'),
  displayName: 'Kevin',
  locale: 'fr',
  role: 'user',
  banType: null,
}

/** Base simulée : comptes par e-mail / id, liens par identifiant du fournisseur. */
function database(users: Array<Record<string, unknown>>, links: Array<{ providerAccountId: string; userId: string }>) {
  const rows = [...users]
  userDb.findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: string } }) => {
    if (where.email !== undefined) return rows.find((u) => u.email === where.email) ?? null
    return rows.find((u) => u.id === where.id) ?? null
  })
  userDb.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: 'compte-neuf', role: 'user', banType: null, ...data }
    rows.push(row)
    return row
  })
  userDb.update.mockResolvedValue({})
  linkDb.findUnique.mockImplementation(
    async ({ where }: { where: { provider_providerAccountId: { providerAccountId: string } } }) => {
      const link = links.find((l) => l.providerAccountId === where.provider_providerAccountId.providerAccountId)
      if (!link) return null
      return { ...link, user: rows.find((u) => u.id === link.userId) ?? null }
    }
  )
  linkDb.upsert.mockResolvedValue({})
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieJar.clear()
  profileMock.mockResolvedValue(discordProfile)
  currentUserMock.mockResolvedValue(null)
  database([kevin], [])
})

describe('état de l’aller', () => {
  it('sans cookie d’état : refus, aucun code échangé', async () => {
    const { path, params } = await retour()
    expect(path).toBe('/fr/compte')
    expect(params.get('authError')).toBe('oauth_failed')
    expect(profileMock).not.toHaveBeenCalled()
  })

  it('state différent de celui de l’aller : refus', async () => {
    aller()
    const { params } = await retour({ code: 'code-1', state: 'autre'.repeat(10) })
    expect(params.get('authError')).toBe('oauth_failed')
    expect(profileMock).not.toHaveBeenCalled()
  })

  it('aller Discord, retour sur Facebook : refus', async () => {
    aller()
    const { params } = await retour({ code: 'code-1', state: STATE }, 'facebook')
    expect(params.get('authError')).toBe('oauth_failed')
  })

  it('fenêtre refermée chez le fournisseur : retour simple, destination gardée, cookie d’état effacé', async () => {
    aller()
    const { res, path, params } = await retour({ error: 'access_denied', state: STATE })
    expect(path).toBe('/fr/compte')
    expect(params.has('authError')).toBe(false)
    expect(params.get('redirect')).toBe('/jeux?join=ABC123')
    expect(res.headers.get('set-cookie')).toContain(`${OAUTH_STATE_COOKIE}=;`)
  })
})

describe('connexion', () => {
  it('premier passage : crée le compte (mode en ligne si la destination l’est), le lie, ouvre la session', async () => {
    database([], [])
    aller({ ambianceMode: 'soft' })

    const { res, path, location } = await retour()

    expect(res.status).toBe(303)
    expect(path).toBe('/fr/jeux')
    expect(location.search).toBe('?join=ABC123')
    const data = userDb.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      email: 'kevin@exemple.fr',
      passwordHash: '',
      displayName: 'Kevin',
      playMode: 'online',
      ambianceMode: 'soft',
    })
    expect(data.emailVerified).toBeInstanceOf(Date)
    expect(linkDb.upsert.mock.calls[0][0].create).toEqual({
      userId: 'compte-neuf',
      provider: 'discord',
      providerAccountId: 'discord-42',
    })
    expect(res.headers.get('set-cookie')).toContain('lp_session=jeton-session')
  })

  it('adresse déjà inscrite (mot de passe ou Google) : le compte existant est lié, rien n’est créé', async () => {
    aller()
    const { path } = await retour()
    expect(path).toBe('/fr/jeux')
    expect(userDb.create).not.toHaveBeenCalled()
    expect(linkDb.upsert.mock.calls[0][0].create.userId).toBe('compte-kevin')
    expect(createSessionMock).toHaveBeenCalledWith('compte-kevin')
  })

  it('compte à mot de passe dont l’adresse n’a jamais été prouvée : refus, rien n’est lié ni ouvert', async () => {
    // Inscription par mot de passe sans confirmation : un tiers a pu la faire
    // au nom de Kevin, et en garderait le mot de passe une fois le lien posé.
    database([{ ...kevin, passwordHash: 'hash-du-tiers', emailVerified: null }], [])
    aller()
    const { params } = await retour()
    expect(params.get('authError')).toBe('email_taken')
    expect(params.get('redirect')).toBe('/jeux?join=ABC123')
    expect(linkDb.upsert).not.toHaveBeenCalled()
    expect(userDb.update).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('compte à mot de passe dont l’adresse est prouvée : lié', async () => {
    database([{ ...kevin, passwordHash: 'hash' }], [])
    aller()
    await retour()
    expect(linkDb.upsert.mock.calls[0][0].create.userId).toBe('compte-kevin')
    expect(createSessionMock).toHaveBeenCalledWith('compte-kevin')
  })

  it('compte Google ancien (sans mot de passe, adresse jamais datée) : lié, adresse datée', async () => {
    database([{ ...kevin, passwordHash: '', emailVerified: null }], [])
    aller()
    await retour()
    expect(linkDb.upsert.mock.calls[0][0].create.userId).toBe('compte-kevin')
    expect(userDb.update.mock.calls[0][0].data.emailVerified).toBeInstanceOf(Date)
    expect(createSessionMock).toHaveBeenCalledWith('compte-kevin')
  })

  it('identité déjà liée : le compte est retrouvé même si l’adresse a changé chez Discord', async () => {
    database([kevin], [{ providerAccountId: 'discord-42', userId: 'compte-kevin' }])
    profileMock.mockResolvedValue({ ...discordProfile, email: 'nouvelle@exemple.fr' })
    aller()
    await retour()
    expect(userDb.create).not.toHaveBeenCalled()
    expect(linkDb.upsert).not.toHaveBeenCalled()
    expect(createSessionMock).toHaveBeenCalledWith('compte-kevin')
  })

  it('adresse NON confirmée chez Discord : ni compte retrouvé, ni compte créé', async () => {
    profileMock.mockResolvedValue({ ...discordProfile, emailVerified: false })
    aller()
    const { params } = await retour()
    expect(params.get('authError')).toBe('oauth_email_unverified')
    expect(params.get('redirect')).toBe('/jeux?join=ABC123')
    expect(createSessionMock).not.toHaveBeenCalled()
    expect(userDb.create).not.toHaveBeenCalled()
  })

  it('aucune adresse partagée : refus explicite', async () => {
    profileMock.mockResolvedValue({ ...discordProfile, email: null, emailVerified: false })
    aller()
    const { params } = await retour()
    expect(params.get('authError')).toBe('oauth_email_required')
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('compte suspendu : pas de session', async () => {
    database([{ ...kevin, banType: 'permanent' }], [])
    aller()
    const { params } = await retour()
    expect(params.get('authError')).toBe('account_suspended')
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('code refusé par le fournisseur : refus', async () => {
    profileMock.mockResolvedValue(null)
    aller()
    const { params } = await retour()
    expect(params.get('authError')).toBe('oauth_failed')
  })
})

describe('pérennisation d’un invité', () => {
  const guest = { id: 'invite-1', isGuest: true, role: 'user' }

  it('l’invité garde son compte : adresse confirmée posée, identité liée', async () => {
    database([], [])
    currentUserMock.mockResolvedValue(guest)
    aller({ intent: 'upgrade', userId: 'invite-1' })

    const { path, params } = await retour()

    expect(path).toBe('/fr/compte')
    expect(params.get('guestSaved')).toBe('1')
    const update = userDb.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'invite-1' })
    expect(update.data).toMatchObject({ email: 'kevin@exemple.fr', isGuest: false })
    expect(linkDb.upsert.mock.calls[0][0].create.userId).toBe('invite-1')
  })

  it('adresse déjà portée par un autre compte : refus neutre, rien n’est touché', async () => {
    currentUserMock.mockResolvedValue(guest)
    aller({ intent: 'upgrade', userId: 'invite-1' })
    const { params } = await retour()
    expect(params.get('upgradeError')).toBe('email_taken')
    expect(userDb.update).not.toHaveBeenCalled()
  })

  it('la session a changé depuis l’aller : refus', async () => {
    currentUserMock.mockResolvedValue({ ...guest, id: 'autre-invite' })
    aller({ intent: 'upgrade', userId: 'invite-1' })
    const { params } = await retour()
    expect(params.get('upgradeError')).toBe('auth_required')
  })
})

describe('Apple — retour en POST (form_post)', () => {
  const postBack = (provider: string, fields: Record<string, string>) =>
    POST(
      new Request(`http://test/api/auth/oauth/${provider}/callback`, {
        method: 'POST',
        body: new URLSearchParams(fields),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
      { params: Promise.resolve({ provider }) }
    )

  it('reformulé en GET vers la même adresse ; le prénom passe par un cookie, pas par l’URL', async () => {
    const res = await postBack('apple', {
      code: 'code-apple',
      state: STATE,
      user: JSON.stringify({ name: { firstName: 'Zoé', lastName: 'M' }, email: 'z@exemple.fr' }),
    })

    expect(res.status).toBe(303)
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.pathname).toBe('/api/auth/oauth/apple/callback')
    expect(location.searchParams.get('code')).toBe('code-apple')
    expect(location.searchParams.get('state')).toBe(STATE)
    expect(location.search).not.toContain('Zo')
    expect(res.headers.get('set-cookie')).toContain(`${OAUTH_NAME_COOKIE}=Zo%C3%A9`)
    expect(profileMock).not.toHaveBeenCalled()
  })

  it('le prénom gardé sert au pseudo du compte créé', async () => {
    database([], [])
    profileMock.mockResolvedValue({ id: 'apple-1', email: 'x7k@privaterelay.appleid.com', emailVerified: true, name: '' })
    cookieJar.set(OAUTH_NAME_COOKIE, 'Zoé')
    aller({ provider: 'apple' })

    await retour({ code: 'code-apple', state: STATE }, 'apple')

    expect(userDb.create.mock.calls[0][0].data.displayName).toBe('Zoé')
  })

  it('corps démesuré : rien n’est lu, rebond sans code ni prénom', async () => {
    const res = await postBack('apple', { code: 'code-apple', state: STATE, bourrage: 'x'.repeat(64 * 1024) })
    expect(res.status).toBe(303)
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.pathname).toBe('/api/auth/oauth/apple/callback')
    expect(location.search).toBe('')
    expect(res.headers.get('set-cookie') ?? '').not.toContain(OAUTH_NAME_COOKIE)
  })

  it('les autres fournisseurs reviennent en GET : POST refusé', async () => {
    const res = await postBack('discord', { code: 'c', state: STATE })
    expect(res.status).toBe(404)
  })
})

describe('suppression confirmée par le fournisseur', () => {
  const session = { id: 'compte-kevin', isGuest: false, role: 'user' }

  it('identité liée au compte connecté : compte supprimé, session effacée', async () => {
    database([kevin], [{ providerAccountId: 'discord-42', userId: 'compte-kevin' }])
    currentUserMock.mockResolvedValue(session)
    aller({ intent: 'delete', userId: 'compte-kevin' })

    const { res, path } = await retour()

    expect(path).toBe('/')
    expect(deleteUserMock).toHaveBeenCalledWith('compte-kevin')
    expect(res.headers.get('set-cookie')).toContain('lp_session=;')
  })

  it('identité liée à UN AUTRE compte : rien n’est supprimé', async () => {
    database([kevin], [{ providerAccountId: 'discord-42', userId: 'compte-autre' }])
    currentUserMock.mockResolvedValue(session)
    aller({ intent: 'delete', userId: 'compte-kevin' })
    const { params } = await retour()
    expect(params.get('deleteError')).toBe('oauth_not_linked')
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('compte à mot de passe : rien n’est supprimé sans le mot de passe', async () => {
    database([{ ...kevin, passwordHash: 'hash' }], [{ providerAccountId: 'discord-42', userId: 'compte-kevin' }])
    currentUserMock.mockResolvedValue(session)
    aller({ intent: 'delete', userId: 'compte-kevin' })
    const { params } = await retour()
    expect(params.get('deleteError')).toBe('wrong_password')
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('compte fondateur : protégé', async () => {
    database([kevin], [{ providerAccountId: 'discord-42', userId: 'compte-kevin' }])
    currentUserMock.mockResolvedValue({ ...session, role: 'fondateur' })
    aller({ intent: 'delete', userId: 'compte-kevin' })
    const { params } = await retour()
    expect(params.get('deleteError')).toBe('founder_protected')
    expect(deleteUserMock).not.toHaveBeenCalled()
  })
})
