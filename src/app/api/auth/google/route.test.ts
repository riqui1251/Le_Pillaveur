import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/google — ambiance du compte, création contre reconnexion.
 *
 * Le même clic Google crée un compte OU reconnecte un compte existant. Seule
 * la création prend l'ambiance de l'appareil (« Sans alcool » d'office dans
 * l'app) ; un compte existant garde son réglage, choisi ailleurs et suivi d'un
 * appareil à l'autre. Toute valeur inconnue est ignorée (défaut du schéma).
 * Et un compte qui portait l'adresse sans l'avoir jamais confirmée (inscrit
 * par mot de passe, peut-être par un tiers) est RÉCLAMÉ par le titulaire que
 * Google prouve : mot de passe effacé, sessions révoquées.
 * Vraie route, jeton Google, base, session et cookies simulés.
 */

const { userDb, sessionDb, linkDb, verifyMock, createSessionMock } = vi.hoisted(() => ({
  userDb: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  sessionDb: { deleteMany: vi.fn() },
  linkDb: { count: vi.fn(), deleteMany: vi.fn() },
  verifyMock: vi.fn(),
  createSessionMock: vi.fn(async () => 'jeton-session'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: userDb,
    session: sessionDb,
    oAuthAccount: linkDb,
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ has: () => false, get: () => undefined }),
}))
vi.mock('@/lib/google-auth-server', () => ({ verifyGoogleIdToken: verifyMock }))
vi.mock('@/lib/auth-server', async (importOriginal) => ({
  claimUnprovenAccount: (await importOriginal<typeof import('@/lib/auth-server')>()).claimUnprovenAccount,
  createSession: createSessionMock,
  clearLocalPlayCookieOptions: () => ({ name: 'lp_local_play', value: '', path: '/', maxAge: 0 }),
  deleteIncomingSession: vi.fn(async () => {}),
  sessionCookieOptions: (token: string) => ({ name: 'lp_session', value: token, path: '/' }),
}))
vi.mock('@/lib/account-code', () => ({
  createUniqueAccountCode: vi.fn(async () => 'CODE1234'),
  ensureUserAccountCode: vi.fn(async () => 'CODE1234'),
}))
vi.mock('@/lib/ban-server', () => ({
  clearExpiredBanIfNeeded: vi.fn(async () => {}),
  getBanState: () => ({ banned: false }),
}))
vi.mock('@/lib/display-name', () => ({
  DISPLAY_NAME_MAX_LENGTH: 30,
  getDisplayNameValidationError: () => null,
  isDisplayNameTaken: async () => false,
}))
vi.mock('@/lib/name-moderation/extra-terms-server', () => ({ ensureServerModerationTermsLoaded: async () => {} }))
vi.mock('@/lib/name-moderation-attempts-server', () => ({ linkVisitorNameModerationAttempts: vi.fn() }))
vi.mock('@/lib/ip-history-server', () => ({ recordIpSeen: vi.fn(async () => {}) }))

import { POST } from './route'

/** Compte déjà inscrit (par le site, avant l'app) : ambiance alcool choisie. */
const existingAccount = {
  id: 'compte-existant',
  email: 'kevin@exemple.fr',
  displayName: 'Kevin',
  name: 'Kevin',
  accountCode: 'KEVIN123',
  role: 'user',
  locale: 'fr',
  playMode: 'local',
  ambianceMode: 'alcool',
}

/** Base simulée : un compte par e-mail (ou aucun), relu par id après création. */
function database(existing: Record<string, unknown> | null) {
  let row: Record<string, unknown> | null = existing
  userDb.findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: string } }) => {
    if (!row) return null
    if (where.email !== undefined) return where.email === row.email ? row : null
    return where.id === row.id ? row : null
  })
  // Le défaut du schéma s'applique quand le champ n'est pas fourni.
  userDb.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    row = { id: 'compte-neuf', role: 'user', ambianceMode: 'alcool', ...data }
    return row
  })
  userDb.update.mockResolvedValue({})
  sessionDb.deleteMany.mockResolvedValue({ count: 0 })
  linkDb.count.mockResolvedValue(0)
  linkDb.deleteMany.mockResolvedValue({ count: 0 })
}

let seq = 0
const google = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request('http://test/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${++seq}` },
      body: JSON.stringify({ credential: 'jeton-google', locale: 'fr', ...extra }),
    })
  )

/** Données passées à prisma.user.create (un seul appel attendu). */
const createdData = () => {
  expect(userDb.create).toHaveBeenCalledTimes(1)
  return userDb.create.mock.calls[0][0].data as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ email: 'kevin@exemple.fr', given_name: 'Kevin' })
})

describe('POST /api/auth/google — ambiance', () => {
  it('création avec « Sans alcool » : le compte naît soft', async () => {
    database(null)

    const res = await google({ ambianceMode: 'soft' })

    expect(res.status).toBe(200)
    expect(createdData().ambianceMode).toBe('soft')
    const json = await res.json()
    expect(json.created).toBe(true)
    expect(json.user.ambianceMode).toBe('soft')
  })

  it('création sans le champ (ancien client) : défaut actuel du schéma', async () => {
    database(null)

    const res = await google()

    expect(res.status).toBe(200)
    expect(createdData()).not.toHaveProperty('ambianceMode')
    expect((await res.json()).user.ambianceMode).toBe('alcool')
  })

  it.each([['soft '], ['aucun'], [42], [null]])('création, valeur invalide %j : ignorée', async (value) => {
    database(null)

    const res = await google({ ambianceMode: value })

    expect(res.status).toBe(200)
    expect(createdData()).not.toHaveProperty('ambianceMode')
  })

  it('reconnexion d’un compte existant : son réglage n’est jamais écrasé', async () => {
    database(existingAccount)

    const res = await google({ ambianceMode: 'soft' })

    expect(res.status).toBe(200)
    expect(userDb.create).not.toHaveBeenCalled()
    // La seule écriture est celle de la connexion (dates, réseau, appareil).
    expect(userDb.update).toHaveBeenCalledTimes(1)
    expect(userDb.update.mock.calls[0][0].data).not.toHaveProperty('ambianceMode')
    const json = await res.json()
    expect(json.created).toBe(false)
    expect(json.user.ambianceMode).toBe('alcool')
  })
})

describe('POST /api/auth/google — compte pré-inscrit avec l’adresse', () => {
  /** Inscrit par mot de passe avec l'adresse de la victime, jamais confirmée. */
  const trapped = {
    ...existingAccount,
    id: 'compte-piege',
    displayName: 'Lucas',
    passwordHash: '$2a$10$hash-choisi-par-attaquant',
    emailVerified: null,
  }

  it('adresse jamais confirmée + mot de passe : réclamé (mot de passe effacé, sessions révoquées) avant la session', async () => {
    database(trapped)

    const res = await google()

    expect(res.status).toBe(200)
    expect((await res.json()).user.id).toBe('compte-piege')
    expect(userDb.update).toHaveBeenCalledWith({ where: { id: 'compte-piege' }, data: { passwordHash: '' } })
    expect(sessionDb.deleteMany).toHaveBeenCalledWith({ where: { userId: 'compte-piege' } })
    // Révocation AVANT la nouvelle session : celle de la victime survit.
    expect(sessionDb.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      createSessionMock.mock.invocationCallOrder[0]
    )
    expect(createSessionMock).toHaveBeenCalledWith('compte-piege')
    const login = userDb.update.mock.calls.find(([arg]) => 'lastLoginAt' in arg.data)?.[0]
    expect(login?.data.emailVerified).toBeInstanceOf(Date)
  })

  it('adresse déjà confirmée : ni mot de passe effacé, ni session révoquée', async () => {
    database({ ...trapped, emailVerified: new Date('2026-01-01') })

    const res = await google()

    expect(res.status).toBe(200)
    expect(userDb.update.mock.calls.some(([arg]) => 'passwordHash' in arg.data)).toBe(false)
    expect(sessionDb.deleteMany).not.toHaveBeenCalled()
  })

  it('compte Google ancien (ni mot de passe, ni identité liée, adresse pas encore notée) : sessions intactes', async () => {
    database({ ...existingAccount, passwordHash: '', emailVerified: null })

    const res = await google()

    expect(res.status).toBe(200)
    expect(sessionDb.deleteMany).not.toHaveBeenCalled()
  })
})
