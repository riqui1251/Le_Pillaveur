import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma et next/headers sont remplacés : on teste ici la règle « le cookie
// porte le jeton brut, la base ne voit que son empreinte », et la session
// glissante (seuil de renouvellement, durées, cookie aligné sur la base).
const { sessionMock, userMock, cookieJar } = vi.hoisted(() => ({
  sessionMock: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    updateMany: vi.fn(),
  },
  // Lu par clearExpiredBanIfNeeded (ban-server) : aucun ban à lever.
  userMock: { findUnique: vi.fn() },
  cookieJar: new Map<string, string>(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { session: sessionMock, user: userMock } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}))

import {
  GUEST_SESSION_DAYS,
  SESSION_COOKIE,
  SESSION_DAYS,
  alignedSessionCookieOptions,
  createSession,
  deleteIncomingSession,
  deleteSession,
  getSessionFromToken,
  getUserFromSessionToken,
  hashToken,
  renewSessionIfStale,
  sessionCookieOptions,
  sessionDaysFor,
  shouldRenewSession,
  type AuthUser,
  type ValidSession,
} from '@/lib/auth-server'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-01T12:00:00.000Z')

function fakeUser(isGuest: boolean, role: AuthUser['role'] = 'user'): AuthUser {
  return {
    id: 'user-1',
    email: isGuest ? '' : 'joueur@example.test',
    displayName: 'Joueur',
    onlineDisplayName: null,
    onlinePreferences: {} as AuthUser['onlinePreferences'],
    accountCode: 'LP-TEST01',
    role,
    locale: 'fr',
    playMode: 'online',
    ambianceMode: 'alcool',
    onlineXp: 0,
    isGuest,
  }
}

function sessionExpiringIn(ms: number, isGuest = false, role: AuthUser['role'] = 'user'): ValidSession {
  return { user: fakeUser(isGuest, role), token: 'jeton-brut', expiresAt: new Date(NOW.getTime() + ms) }
}

beforeEach(() => {
  sessionMock.create.mockReset()
  sessionMock.deleteMany.mockReset()
  sessionMock.findUnique.mockReset()
  sessionMock.findUnique.mockResolvedValue(null)
  sessionMock.delete.mockReset()
  sessionMock.updateMany.mockReset()
  sessionMock.updateMany.mockResolvedValue({ count: 1 })
  userMock.findUnique.mockReset()
  userMock.findUnique.mockResolvedValue(null)
  cookieJar.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('jetons de session hachés en base', () => {
  it('stocke l empreinte du jeton, jamais le jeton brut', async () => {
    const token = await createSession('user-1')
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const stored = sessionMock.create.mock.calls[0][0].data
    expect(stored.token).toBe(hashToken(token))
    expect(stored.token).not.toBe(token)
    expect(stored.userId).toBe('user-1')
  })

  it('recherche la session par empreinte', async () => {
    await getUserFromSessionToken('jeton-brut')
    expect(sessionMock.findUnique.mock.calls[0][0].where).toEqual({
      token: hashToken('jeton-brut'),
    })
  })

  it('supprime la session par empreinte', async () => {
    await deleteSession('jeton-brut')
    expect(sessionMock.deleteMany.mock.calls[0][0].where).toEqual({
      token: hashToken('jeton-brut'),
    })
  })

  it('ignore un cookie absent sans interroger la base', async () => {
    expect(await getUserFromSessionToken(undefined)).toBeNull()
    expect(sessionMock.findUnique).not.toHaveBeenCalled()
  })
})

describe('durées de session et cookie', () => {
  it('30 jours pour un compte, 91 pour un invité', () => {
    expect(SESSION_DAYS).toBe(30)
    // 90 jours sans activité promis + 1 jour de marge (seuil de renouvellement).
    expect(GUEST_SESSION_DAYS).toBe(91)
    expect(sessionDaysFor(false)).toBe(SESSION_DAYS)
    expect(sessionDaysFor(undefined)).toBe(SESSION_DAYS)
    expect(sessionDaysFor(true)).toBe(GUEST_SESSION_DAYS)
  })

  it('crée une session de compte à 30 jours par défaut', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    await createSession('user-1')
    const stored = sessionMock.create.mock.calls[0][0].data
    expect(stored.expiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY_MS)
  })

  it('crée une session d invité à 91 jours, cookie de même durée', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const token = await createSession('guest-1', GUEST_SESSION_DAYS)
    const stored = sessionMock.create.mock.calls[0][0].data
    expect(stored.expiresAt.getTime()).toBe(NOW.getTime() + 91 * DAY_MS)

    const cookie = sessionCookieOptions(token, GUEST_SESSION_DAYS)
    expect(cookie.name).toBe(SESSION_COOKIE)
    expect(cookie.value).toBe(token)
    // maxAge (secondes) = échéance en base − maintenant : cookie et base alignés.
    expect(cookie.maxAge * 1000).toBe(stored.expiresAt.getTime() - NOW.getTime())
  })

  it('cookie de compte à 30 jours par défaut', () => {
    expect(sessionCookieOptions('jeton').maxAge).toBe(30 * 24 * 60 * 60)
    expect(sessionCookieOptions('jeton', GUEST_SESSION_DAYS).maxAge).toBe(91 * 24 * 60 * 60)
  })
})

describe('session glissante : seuil de renouvellement', () => {
  it('ne renouvelle pas tant qu il reste plus que durée − 1 jour', () => {
    expect(shouldRenewSession(new Date(NOW.getTime() + 29.5 * DAY_MS), 30, NOW)).toBe(false)
    // Borne exacte : « inférieure à » durée − 1 jour, donc pile 29 jours ne suffit pas.
    expect(shouldRenewSession(new Date(NOW.getTime() + 29 * DAY_MS), 30, NOW)).toBe(false)
    expect(shouldRenewSession(new Date(NOW.getTime() + 29 * DAY_MS - 1), 30, NOW)).toBe(true)
  })

  it('jamais pour une session déjà expirée', () => {
    expect(shouldRenewSession(new Date(NOW.getTime() - 1), 30, NOW)).toBe(false)
  })

  it('au plus une écriture par jour : rien dans les 24 h qui suivent un renouvellement', () => {
    const renewedUntil = new Date(NOW.getTime() + 30 * DAY_MS)
    expect(shouldRenewSession(renewedUntil, 30, new Date(NOW.getTime() + 23 * 60 * 60 * 1000))).toBe(false)
    expect(shouldRenewSession(renewedUntil, 30, new Date(NOW.getTime() + DAY_MS + 1))).toBe(true)
  })

  it('compte : aucune écriture quand il reste plus de 29 jours', async () => {
    expect(await renewSessionIfStale(sessionExpiringIn(29.5 * DAY_MS), NOW)).toBeNull()
    expect(sessionMock.updateMany).not.toHaveBeenCalled()
  })

  it('compte : repousse à maintenant + 30 jours, écriture conditionnelle sous le seuil', async () => {
    expect(await renewSessionIfStale(sessionExpiringIn(12 * DAY_MS), NOW)).toBe(SESSION_DAYS)
    expect(sessionMock.updateMany).toHaveBeenCalledTimes(1)
    const args = sessionMock.updateMany.mock.calls[0][0]
    // Une écriture concurrente déjà passée a remis l'échéance au-dessus du
    // seuil : la seconde ne correspond plus à aucune ligne.
    expect(args.where).toEqual({
      token: hashToken('jeton-brut'),
      expiresAt: { gt: NOW, lt: new Date(NOW.getTime() + 29 * DAY_MS) },
    })
    expect(args.data.expiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY_MS)
  })

  it('invité : aucune écriture quand il reste plus de 90 jours', async () => {
    expect(await renewSessionIfStale(sessionExpiringIn(90.5 * DAY_MS, true), NOW)).toBeNull()
    expect(sessionMock.updateMany).not.toHaveBeenCalled()
  })

  it('invité : une ancienne session de 30 jours repart à 91 jours', async () => {
    const session = sessionExpiringIn(20 * DAY_MS, true)
    expect(await renewSessionIfStale(session, NOW)).toBe(GUEST_SESSION_DAYS)
    const args = sessionMock.updateMany.mock.calls[0][0]
    expect(args.data.expiresAt.getTime()).toBe(NOW.getTime() + 91 * DAY_MS)
  })

  it('invité : après une visite, la session ne tombe jamais avant 90 jours sans activité', () => {
    // Renouvelée à NOW, puis dernière visite 23 h plus tard (sans réécriture).
    const renewedUntil = new Date(NOW.getTime() + GUEST_SESSION_DAYS * DAY_MS)
    const lastVisit = new Date(NOW.getTime() + 23 * 60 * 60 * 1000)
    expect(shouldRenewSession(renewedUntil, GUEST_SESSION_DAYS, lastVisit)).toBe(false)
    expect(renewedUntil.getTime() - lastVisit.getTime()).toBeGreaterThanOrEqual(90 * DAY_MS)
  })

  it('équipe : échéance fixe, jamais prolongée', async () => {
    for (const role of ['moderator', 'admin', 'superadmin', 'fondateur'] as const) {
      expect(await renewSessionIfStale(sessionExpiringIn(DAY_MS, false, role), NOW)).toBeNull()
    }
    expect(sessionMock.updateMany).not.toHaveBeenCalled()
  })

  it('écriture concurrente déjà passée (count 0) : rien à reposer', async () => {
    sessionMock.updateMany.mockResolvedValue({ count: 0 })
    expect(await renewSessionIfStale(sessionExpiringIn(DAY_MS), NOW)).toBeNull()
  })

  it('base verrouillée : pas de renouvellement, sans lever', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sessionMock.updateMany.mockRejectedValue(new Error('SQLITE_BUSY'))
    expect(await renewSessionIfStale(sessionExpiringIn(DAY_MS), NOW)).toBeNull()
    spy.mockRestore()
  })
})

describe('lecture de session', () => {
  it('expose l échéance lue et le jeton brut, sans aucune écriture', async () => {
    const expiresAt = new Date(Date.now() + 10 * DAY_MS)
    sessionMock.findUnique.mockResolvedValue({
      id: 'session-1',
      expiresAt,
      user: {
        id: 'guest-1',
        email: null,
        isGuest: true,
        displayName: 'Invité',
        name: 'Invité',
        accountCode: 'LP-GUEST1',
        role: 'user',
        locale: 'fr',
        playMode: 'online',
        ambianceMode: 'alcool',
        onlineXp: 0,
        onlinePreferencesJson: null,
        banType: null,
        bannedUntil: null,
        banComment: null,
        bannedAt: null,
      },
    })
    const session = await getSessionFromToken('jeton-brut')
    expect(session?.token).toBe('jeton-brut')
    expect(session?.expiresAt).toBe(expiresAt)
    expect(session?.user.isGuest).toBe(true)
    expect(sessionMock.findUnique).toHaveBeenCalledTimes(1)
    expect(sessionMock.updateMany).not.toHaveBeenCalled()
  })
})

describe('cookie réaligné sur la base (/api/auth/me)', () => {
  it('rien à prolonger : cookie recalé sur l échéance en base, jeton brut inchangé', () => {
    const cookie = alignedSessionCookieOptions(sessionExpiringIn(29.5 * DAY_MS), NOW)
    expect(cookie?.name).toBe(SESSION_COOKIE)
    expect(cookie?.value).toBe('jeton-brut')
    expect(cookie?.maxAge).toBe(29.5 * 24 * 60 * 60)
  })

  it('renouvellement dû : rien (la réponse qui a prolongé porte le bon cookie)', () => {
    expect(alignedSessionCookieOptions(sessionExpiringIn(12 * DAY_MS), NOW)).toBeNull()
    expect(alignedSessionCookieOptions(sessionExpiringIn(20 * DAY_MS, true), NOW)).toBeNull()
  })

  it('équipe : toujours recalé, l échéance fixe ne bouge pas', () => {
    expect(alignedSessionCookieOptions(sessionExpiringIn(12 * DAY_MS, false, 'admin'), NOW)?.maxAge).toBe(
      12 * 24 * 60 * 60
    )
  })

  it('session échue : rien', () => {
    expect(alignedSessionCookieOptions(sessionExpiringIn(-1), NOW)).toBeNull()
  })
})

describe('connexion par-dessus une session', () => {
  it('supprime la session du cookie reçu', async () => {
    cookieJar.set(SESSION_COOKIE, 'ancien-jeton')
    await deleteIncomingSession()
    expect(sessionMock.deleteMany.mock.calls[0][0].where).toEqual({
      token: hashToken('ancien-jeton'),
    })
  })

  it('ne touche à rien sans cookie', async () => {
    await deleteIncomingSession()
    expect(sessionMock.deleteMany).not.toHaveBeenCalled()
  })

  it('simple nettoyage : un échec ne fait pas échouer la connexion déjà acquise', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    cookieJar.set(SESSION_COOKIE, 'ancien-jeton')
    sessionMock.deleteMany.mockRejectedValue(new Error('SQLITE_BUSY'))
    await expect(deleteIncomingSession()).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
