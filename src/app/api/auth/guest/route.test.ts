import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/guest — ambiance du compte invité à sa naissance.
 *
 * Dans l'app Android, un appareil sans choix explicite demande « Sans alcool »
 * (politique alcool de Google Play) : l'invité doit naître 'soft'. La valeur
 * n'est lue qu'à la CRÉATION ; toute valeur inconnue est ignorée (défaut du
 * schéma, 'alcool') ; une session déjà en place n'est jamais modifiée. Vraie
 * route, base, session et cookies simulés.
 */

const { userDb, currentUserMock, cookieJar } = vi.hoisted(() => ({
  userDb: { create: vi.fn(), update: vi.fn() },
  currentUserMock: vi.fn(),
  cookieJar: { ageVerified: true },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    has: (name: string) => name === 'lp_age_verified' && cookieJar.ageVerified,
    get: () => undefined,
  }),
}))
vi.mock('@/lib/auth-server', () => ({
  GUEST_SESSION_DAYS: 91,
  createSession: vi.fn(async () => 'jeton-session'),
  clearLocalPlayCookieOptions: () => ({ name: 'lp_local_play', value: '', path: '/', maxAge: 0 }),
  deleteIncomingSession: vi.fn(async () => {}),
  getCurrentUser: currentUserMock,
  sessionCookieOptions: (token: string) => ({ name: 'lp_session', value: token, path: '/' }),
}))
vi.mock('@/lib/account-code', () => ({ createUniqueAccountCode: vi.fn(async () => 'CODE1234') }))
vi.mock('@/lib/display-name', () => ({
  DISPLAY_NAME_MAX_LENGTH: 30,
  getDisplayNameValidationError: () => null,
  isDisplayNameTaken: async () => false,
  displayNameTakenMessage: () => 'Pseudo déjà pris',
  displayNameValidationMessage: () => 'Pseudo invalide',
}))
vi.mock('@/lib/name-moderation/request-locale', () => ({ resolveRequestLocale: async () => 'fr' }))
vi.mock('@/lib/name-moderation/extra-terms-server', () => ({ ensureServerModerationTermsLoaded: async () => {} }))
vi.mock('@/lib/name-moderation-attempt-log', () => ({ logRejectedNameOnServer: vi.fn() }))
vi.mock('@/lib/name-moderation-attempts-server', () => ({ linkVisitorNameModerationAttempts: vi.fn() }))
vi.mock('@/lib/ip-history-server', () => ({ recordIpSeen: vi.fn(async () => {}) }))

import { POST } from './route'

/** Chaque requête vient d'un réseau différent : le quota par réseau reste hors jeu. */
let seq = 0
const guest = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request('http://test/api/auth/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${++seq}` },
      body: JSON.stringify({ displayName: 'Kevin', locale: 'fr', ...extra }),
    })
  )

/** Données passées à prisma.user.create (un seul appel attendu). */
const createdData = () => {
  expect(userDb.create).toHaveBeenCalledTimes(1)
  return userDb.create.mock.calls[0][0].data as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieJar.ageVerified = true
  currentUserMock.mockResolvedValue(null)
  // La base applique le défaut du schéma quand le champ n'est pas fourni.
  userDb.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'invite-1',
    ambianceMode: 'alcool',
    ...data,
  }))
  userDb.update.mockResolvedValue({})
})

describe('POST /api/auth/guest — ambiance à la création', () => {
  it('« Sans alcool » demandé (app sans choix) : l’invité naît soft', async () => {
    const res = await guest({ ambianceMode: 'soft' })

    expect(res.status).toBe(200)
    expect(createdData()).toMatchObject({ isGuest: true, ambianceMode: 'soft' })
    expect((await res.json()).user.ambianceMode).toBe('soft')
  })

  it('« Avec alcool » explicite : transmis tel quel', async () => {
    const res = await guest({ ambianceMode: 'alcool' })

    expect(res.status).toBe(200)
    expect(createdData().ambianceMode).toBe('alcool')
    expect((await res.json()).user.ambianceMode).toBe('alcool')
  })

  it('sans le champ (ancien client) : défaut actuel du schéma, rien d’imposé', async () => {
    const res = await guest()

    expect(res.status).toBe(200)
    expect(createdData()).not.toHaveProperty('ambianceMode')
    expect((await res.json()).user.ambianceMode).toBe('alcool')
  })

  it.each([['SOFT'], ['sans-alcool'], [''], [1], [null], [{ mode: 'soft' }]])(
    'valeur invalide %j : ignorée, défaut du schéma',
    async (value) => {
      const res = await guest({ ambianceMode: value })

      expect(res.status).toBe(200)
      expect(createdData()).not.toHaveProperty('ambianceMode')
    }
  )

  it('session déjà en place : compte renvoyé tel quel, jamais réécrit', async () => {
    const existing = { id: 'deja-la', displayName: 'Kevin', ambianceMode: 'alcool', isGuest: true }
    currentUserMock.mockResolvedValue(existing)

    const res = await guest({ ambianceMode: 'soft' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: existing, alreadySignedIn: true })
    expect(userDb.create).not.toHaveBeenCalled()
    expect(userDb.update).not.toHaveBeenCalled()
  })

  it('porte d’âge non franchie : rien n’est créé, quelle que soit l’ambiance', async () => {
    cookieJar.ageVerified = false

    const res = await guest({ ambianceMode: 'soft' })

    expect(res.status).toBe(403)
    expect(userDb.create).not.toHaveBeenCalled()
  })
})
