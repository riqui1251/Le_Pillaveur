import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/me/reminder — accord au rappel du vendredi (GET état, POST accord,
 * DELETE retrait). Vraie route et vraie logique (reminder-server) ; base,
 * session, quota et envoi d'e-mail simulés. La configuration de l'envoi
 * (RESEND_API_KEY) est lue pour de vrai : sans elle, rien n'est proposé.
 */

const { db, currentUserMock, rateLimitMock, sendConfirmMock } = vi.hoisted(() => ({
  db: { user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
  currentUserMock: vi.fn(),
  rateLimitMock: vi.fn(),
  sendConfirmMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, checkRateLimit: rateLimitMock }
})
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendReminderConfirmEmail: sendConfirmMock }
})

import { DELETE, GET, POST } from './route'

const MEMBER = { id: 'compte-1', email: 'joueur@exemple.fr', isGuest: false }
const GUEST = { id: 'invite-1', email: '', isGuest: true }

/** Compte Google (sans mot de passe) : adresse prouvée par Google. */
const row = (over: Record<string, unknown> = {}) => ({
  email: 'joueur@exemple.fr',
  isGuest: false,
  passwordHash: '',
  emailVerified: null,
  reminderOptInAt: null,
  reminderLastSentAt: null,
  reminderToken: null,
  locale: 'fr',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 're_test_123')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  currentUserMock.mockResolvedValue(MEMBER)
  rateLimitMock.mockReturnValue({ ok: true })
  sendConfirmMock.mockResolvedValue(undefined)
  db.user.findUnique.mockResolvedValue(row())
  db.user.update.mockResolvedValue({})
  db.user.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('authentification', () => {
  it('les trois verbes exigent un compte (401), sans toucher à la base', async () => {
    currentUserMock.mockResolvedValue(null)
    for (const handler of [GET, POST, DELETE]) {
      const res = await handler()
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('auth_required')
    }
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.user.update).not.toHaveBeenCalled()
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/me/reminder', () => {
  it('off, puis on une fois l’accord donné', async () => {
    expect(await (await GET()).json()).toEqual({ status: 'off' })
    db.user.findUnique.mockResolvedValue(row({ reminderOptInAt: new Date('2026-10-08T20:00:00Z') }))
    expect(await (await GET()).json()).toEqual({ status: 'on' })
  })

  it('invité : unavailable', async () => {
    currentUserMock.mockResolvedValue(GUEST)
    db.user.findUnique.mockResolvedValue(row({ email: null, isGuest: true }))
    expect(await (await GET()).json()).toEqual({ status: 'unavailable' })
  })

  it('envoi d’e-mails non configuré : unavailable, même inscrit — rien n’est promis', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    db.user.findUnique.mockResolvedValue(row({ reminderOptInAt: new Date('2026-10-08T20:00:00Z') }))
    expect(await (await GET()).json()).toEqual({ status: 'unavailable' })
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })

  it('confirmation envoyée il y a peu : pending', async () => {
    db.user.findUnique.mockResolvedValue(
      row({ passwordHash: 'hash', reminderToken: 'A'.repeat(43), reminderLastSentAt: new Date() })
    )
    expect(await (await GET()).json()).toEqual({ status: 'pending' })
  })
})

describe('POST /api/me/reminder', () => {
  it('adresse prouvée (Google) : pose l’accord et le jeton', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'on' })
    expect(db.user.update).toHaveBeenCalledTimes(1)
    const { where, data } = db.user.update.mock.calls[0][0]
    expect(where).toEqual({ id: 'compte-1' })
    expect(data.reminderOptInAt).toBeInstanceOf(Date)
    expect(typeof data.reminderToken).toBe('string')
    expect(sendConfirmMock).not.toHaveBeenCalled()
  })

  it('adresse non prouvée (e-mail + mot de passe) : e-mail de confirmation, aucun accord', async () => {
    db.user.findUnique.mockResolvedValue(row({ passwordHash: 'hash' }))
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'pending' })
    expect(db.user.update).not.toHaveBeenCalled()
    expect(sendConfirmMock).toHaveBeenCalledTimes(1)
    expect(sendConfirmMock.mock.calls[0][0].confirmUrl).toMatch(/\/fr\/compte\/rappel\/confirmer\?token=/)
  })

  it('envoi de la confirmation en échec : 503, rien d’accordé', async () => {
    db.user.findUnique.mockResolvedValue(row({ passwordHash: 'hash' }))
    sendConfirmMock.mockRejectedValue(new Error('resend'))
    const res = await POST()
    expect(res.status).toBe(503)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('envoi d’e-mails non configuré : 200 unavailable, rien de lu ni d’écrit', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'unavailable' })
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('idempotent : déjà inscrit, aucune écriture', async () => {
    db.user.findUnique.mockResolvedValue(
      row({ reminderOptInAt: new Date('2026-10-01T20:00:00Z'), reminderToken: 'A'.repeat(43) })
    )
    const res = await POST()
    expect(await res.json()).toEqual({ status: 'on' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('invité refusé (403), sans lecture ni écriture', async () => {
    currentUserMock.mockResolvedValue(GUEST)
    const res = await POST()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'forbidden', reason: 'email_required' })
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('quota atteint : 429, rien d’écrit', async () => {
    rateLimitMock.mockReturnValue({ ok: false, retryAfterSec: 12 })
    const res = await POST()
    expect(res.status).toBe(429)
    expect(db.user.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/me/reminder', () => {
  it('retire l’accord (date à null), idempotent', async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await DELETE()
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'off' })
    }
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'compte-1', reminderOptInAt: { not: null } },
      data: { reminderOptInAt: null },
    })
  })

  it('jamais refusé, même à un invité', async () => {
    currentUserMock.mockResolvedValue(GUEST)
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'unavailable' })
  })
})
