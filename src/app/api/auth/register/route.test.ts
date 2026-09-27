import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/register — ambiance du compte à l'inscription.
 *
 * Le client envoie l'ambiance de l'appareil (« Sans alcool » d'office dans
 * l'app, ou le choix fait avant de s'inscrire). La route ne s'en sert qu'à la
 * CRÉATION, ignore toute valeur inconnue (défaut du schéma, 'alcool') et ne
 * touche jamais un compte existant. Vraie route, base, session et cookies
 * simulés.
 */

const { userDb } = vi.hoisted(() => ({
  userDb: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ has: () => false, get: () => undefined }),
}))
vi.mock('@/lib/auth-server', () => ({
  createSession: vi.fn(async () => 'jeton-session'),
  clearLocalPlayCookieOptions: () => ({ name: 'lp_local_play', value: '', path: '/', maxAge: 0 }),
  deleteIncomingSession: vi.fn(async () => {}),
  hashPassword: vi.fn(async () => 'hash'),
  isValidEmail: (email: string) => email.includes('@'),
  isValidPassword: () => true,
  sessionCookieOptions: (token: string) => ({ name: 'lp_session', value: token, path: '/' }),
}))
vi.mock('@/lib/account-code', () => ({ createUniqueAccountCode: vi.fn(async () => 'CODE1234') }))
vi.mock('@/lib/display-name', () => ({
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

/** Adresse neuve à chaque requête : le quota (par adresse ET e-mail) reste hors jeu. */
let seq = 0
const register = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request('http://test/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${++seq}` },
      body: JSON.stringify({
        email: `joueur${seq}@exemple.fr`,
        password: 'motdepasse-solide',
        displayName: 'Kevin',
        locale: 'fr',
        ...extra,
      }),
    })
  )

/** Données passées à prisma.user.create (un seul appel attendu). */
const createdData = () => {
  expect(userDb.create).toHaveBeenCalledTimes(1)
  return userDb.create.mock.calls[0][0].data as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  userDb.findUnique.mockResolvedValue(null)
  // La base applique le défaut du schéma quand le champ n'est pas fourni.
  userDb.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'compte-1',
    ambianceMode: 'alcool',
    ...data,
  }))
  userDb.update.mockResolvedValue({})
})

describe('POST /api/auth/register — ambiance à la création', () => {
  it('« Sans alcool » demandé : le compte naît soft', async () => {
    const res = await register({ ambianceMode: 'soft' })

    expect(res.status).toBe(200)
    expect(createdData().ambianceMode).toBe('soft')
    expect((await res.json()).user.ambianceMode).toBe('soft')
  })

  it('sans le champ (ancien client) : défaut actuel du schéma, rien d’imposé', async () => {
    const res = await register()

    expect(res.status).toBe(200)
    expect(createdData()).not.toHaveProperty('ambianceMode')
    expect((await res.json()).user.ambianceMode).toBe('alcool')
  })

  it.each([['Soft'], ['biere'], [0], [false], [['soft']]])('valeur invalide %j : ignorée', async (value) => {
    const res = await register({ ambianceMode: value })

    expect(res.status).toBe(200)
    expect(createdData()).not.toHaveProperty('ambianceMode')
  })

  it('e-mail déjà connu : refus neutre, le compte existant n’est pas touché', async () => {
    userDb.findUnique.mockResolvedValue({ id: 'existant' })

    const res = await register({ ambianceMode: 'soft' })

    expect(res.status).toBe(409)
    expect(userDb.create).not.toHaveBeenCalled()
    expect(userDb.update).not.toHaveBeenCalled()
  })
})
