import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/forgot-password — réponse neutre et quotas.
 *
 * Vraie route, base et envoi d'e-mail simulés. La réponse ne dit jamais si
 * l'adresse a un compte ; le plafond par réseau empêche une seule IP de faire
 * partir un e-mail vers chaque adresse d'une liste (le quota par couple
 * IP + e-mail repartait de zéro à chaque adresse).
 */

const { userDb, tokenDb, sendMock } = vi.hoisted(() => ({
  userDb: { findUnique: vi.fn() },
  tokenDb: { deleteMany: vi.fn(), create: vi.fn() },
  sendMock: vi.fn(async () => {}),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb, passwordResetToken: tokenDb } }))
vi.mock('@/lib/auth-server', () => ({
  createSessionToken: () => 'jeton-brut',
  hashToken: (token: string) => `empreinte:${token}`,
  isValidEmail: (email: string) => email.includes('@'),
}))
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail: sendMock }))

import { POST } from './route'

const forgot = (ip: string, email: string) =>
  POST(
    new Request('http://test/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email }),
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  userDb.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
    where.email.startsWith('inscrit') ? { id: `compte-${where.email}` } : null
  )
  tokenDb.deleteMany.mockResolvedValue({ count: 0 })
  tokenDb.create.mockResolvedValue({})
})

describe('POST /api/auth/forgot-password', () => {
  it('même réponse que l’adresse ait un compte ou non ; seul le compte reçoit le lien', async () => {
    const known = await forgot('192.0.2.30', 'inscrit@exemple.fr')
    const unknown = await forgot('192.0.2.30', 'inconnu@exemple.fr')
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('inscrit@exemple.fr', 'jeton-brut')
  })

  it('une liste d’adresses depuis une seule IP : coupée au 11e envoi', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await forgot('192.0.2.40', `inscrit${i}@exemple.fr`)).status).toBe(200)
    }
    const blocked = await forgot('192.0.2.40', 'inscrit10@exemple.fr')
    expect(blocked.status).toBe(429)
    expect(sendMock).toHaveBeenCalledTimes(10)
  })
})
