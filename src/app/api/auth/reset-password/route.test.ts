import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/reset-password — le lien reçu par e-mail prouve l'adresse.
 *
 * Vraie route, base simulée. Une réinitialisation réussie remplace le mot de
 * passe, coupe toutes les sessions et date la preuve de l'adresse si elle
 * manquait (la connexion Discord / Facebook / Apple refuse de se lier à un
 * compte à mot de passe dont l'adresse n'a jamais été prouvée).
 */

const { userDb, tokenDb, revokeMock } = vi.hoisted(() => ({
  userDb: { update: vi.fn() },
  tokenDb: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  revokeMock: vi.fn(async () => {}),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: userDb,
    passwordResetToken: tokenDb,
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('@/lib/auth-server', () => ({
  hashPassword: vi.fn(async () => 'nouveau-hash'),
  hashToken: (token: string) => `empreinte:${token}`,
  isValidPassword: () => true,
  revokeAllUserSessions: revokeMock,
}))

import { POST } from './route'

const reset = () =>
  POST(
    new Request('http://test/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'jeton-brut', password: 'motdepasse-solide1' }),
    })
  )

function storedToken(user: { emailVerified: Date | null }, usedAt: Date | null = null) {
  tokenDb.findUnique.mockResolvedValue({
    id: 'jeton-1',
    userId: 'compte-1',
    usedAt,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'compte-1', ...user },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  userDb.update.mockResolvedValue({})
  tokenDb.update.mockResolvedValue({})
  tokenDb.deleteMany.mockResolvedValue({ count: 0 })
})

describe('POST /api/auth/reset-password', () => {
  it('adresse jamais prouvée : le lien la prouve, mot de passe remplacé, sessions coupées', async () => {
    storedToken({ emailVerified: null })
    const res = await reset()
    expect(res.status).toBe(200)
    expect(tokenDb.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: 'empreinte:jeton-brut' })
    const data = userDb.update.mock.calls[0][0].data
    expect(data.passwordHash).toBe('nouveau-hash')
    expect(data.emailVerified).toBeInstanceOf(Date)
    expect(revokeMock).toHaveBeenCalledWith('compte-1')
  })

  it('adresse déjà prouvée : sa date d’origine est gardée', async () => {
    storedToken({ emailVerified: new Date('2026-01-01') })
    await reset()
    expect(userDb.update.mock.calls[0][0].data).toEqual({ passwordHash: 'nouveau-hash' })
  })

  it('jeton déjà consommé : refus, rien n’est écrit', async () => {
    storedToken({ emailVerified: null }, new Date())
    const res = await reset()
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_reset_token' })
    expect(userDb.update).not.toHaveBeenCalled()
    expect(revokeMock).not.toHaveBeenCalled()
  })
})
