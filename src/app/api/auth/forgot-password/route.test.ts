import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/auth/forgot-password — quotas et réponse neutre.
 *
 * Le seul quota (adresse IP + e-mail) se contournait en tournant les adresses
 * IPv6 d'un /64 : une boîte de réception pouvait être inondée, et le quota
 * d'envoi épuisé. S'y ajoutent un compteur par réseau, un par adresse quelle
 * que soit l'IP, et un plafond global d'e-mails envoyés. La réponse n'attend
 * plus l'envoi (son délai disait quelles adresses ont un compte). Vraie
 * route ; base et envoi simulés. Modules rechargés à chaque test : chacun
 * part d'un limiteur vide.
 */

const { userDb, resetTokenDb, sendMock } = vi.hoisted(() => ({
  userDb: { findUnique: vi.fn() },
  resetTokenDb: { deleteMany: vi.fn(), create: vi.fn() },
  sendMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb, passwordResetToken: resetTokenDb } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ has: () => false, get: () => undefined }),
}))
vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendPasswordResetEmail: sendMock,
}))

async function forgot(email: string, ip: string) {
  const { POST } = await import('./route')
  return POST(
    new Request('http://test/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ email }),
    })
  )
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  // Toute adresse en @exemple.fr a un compte.
  userDb.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
    where.email.endsWith('@exemple.fr') ? { id: `compte-${where.email}`, email: where.email } : null
  )
  resetTokenDb.deleteMany.mockResolvedValue({ count: 0 })
  resetTokenDb.create.mockResolvedValue({})
  sendMock.mockResolvedValue(undefined)
})

describe('POST /api/auth/forgot-password — réponse', () => {
  it('compte existant : jeton créé, e-mail parti, réponse neutre', async () => {
    const res = await forgot('kevin@exemple.fr', '198.51.100.1')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(resetTokenDb.create).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('kevin@exemple.fr', expect.any(String))
  })

  it('la réponse n’attend pas l’envoi de l’e-mail', async () => {
    sendMock.mockReturnValue(new Promise(() => {}))
    // Route chargée avant de lancer le chronomètre.
    await import('./route')

    const outcome = await Promise.race([
      forgot('kevin@exemple.fr', '198.51.100.2').then((res) => res.status),
      new Promise((resolve) => setTimeout(() => resolve('en attente de l’envoi'), 500)),
    ])

    expect(outcome).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('un envoi qui échoue ne change pas la réponse', async () => {
    sendMock.mockRejectedValue(new Error('RESEND_API_KEY manquant'))

    const res = await forgot('kevin@exemple.fr', '198.51.100.3')

    expect(res.status).toBe(200)
  })
})

describe('POST /api/auth/forgot-password — quotas', () => {
  it('une même adresse depuis des réseaux différents : 3 demandes par heure, puis 429', async () => {
    const statuses: number[] = []
    for (let i = 1; i <= 4; i += 1) statuses.push((await forgot('victime@exemple.fr', `203.0.113.${i}`)).status)

    expect(statuses).toEqual([200, 200, 200, 429])
    expect(sendMock).toHaveBeenCalledTimes(3)
  })

  it('même plafond pour une adresse sans compte : le refus ne dit rien de plus', async () => {
    const statuses: number[] = []
    for (let i = 1; i <= 4; i += 1) statuses.push((await forgot('personne@ailleurs.fr', `203.0.113.${i}`)).status)

    expect(statuses).toEqual([200, 200, 200, 429])
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('un même /64 IPv6 sur des adresses différentes : 20 demandes, puis 429', async () => {
    const statuses: number[] = []
    for (let i = 1; i <= 21; i += 1) {
      statuses.push((await forgot(`joueur${i}@exemple.fr`, `2001:db8:abcd:12::${i.toString(16)}`)).status)
    }

    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true)
    expect(statuses[20]).toBe(429)
  })

  it('plafond global de 60 e-mails par heure : au-delà, même réponse, sans jeton ni envoi', async () => {
    for (let i = 1; i <= 61; i += 1) {
      const res = await forgot(`compte${i}@exemple.fr`, `192.0.2.${i}`)
      expect(res.status).toBe(200)
    }

    expect(sendMock).toHaveBeenCalledTimes(60)
    expect(resetTokenDb.create).toHaveBeenCalledTimes(60)
  })

  it('« e-mail » de 8 000 caractères : refusé avant le limiteur, jamais mémorisé', async () => {
    const giant = `${'a'.repeat(8000)}@exemple.fr`
    const statuses: number[] = []
    for (let i = 0; i < 8; i += 1) statuses.push((await forgot(giant, '198.51.100.9')).status)

    expect(statuses.every((status) => status === 400)).toBe(true)
    expect(userDb.findUnique).not.toHaveBeenCalled()
  })
})
