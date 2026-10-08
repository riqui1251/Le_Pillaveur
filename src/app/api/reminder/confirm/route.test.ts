import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/reminder/confirm — confirmation de l'accord au rappel du vendredi
 * (double opt-in), SANS connexion. Ce qu'on tient : seul le POST du bouton
 * confirme (un antivirus de messagerie qui ouvre le lien ne donne pas
 * l'accord), il pose l'accord ET la preuve d'adresse pour le bon jeton, et
 * la réponse ne mène qu'à deux pages : « activé » ou « lien expiré ».
 */

const { db, rateLimitMock } = vi.hoisted(() => ({
  db: { user: { updateMany: vi.fn(), findUnique: vi.fn() } },
  rateLimitMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, checkRateLimit: rateLimitMock }
})

import { GET, POST } from './route'

const KNOWN = 'K'.repeat(43)
const UNKNOWN = 'U'.repeat(43)

const url = (query = '') => `http://interne:3000/api/reminder/confirm${query}`

const submit = (fields: Record<string, string>) =>
  POST(
    new Request(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  rateLimitMock.mockReturnValue({ ok: true })
  db.user.updateMany.mockImplementation(async ({ where }) => ({ count: where.reminderToken === KNOWN ? 1 : 0 }))
  db.user.findUnique.mockResolvedValue(null)
})

describe('POST (bouton « Activer le rappel » de la page)', () => {
  it('pose l’accord et la preuve d’adresse, puis renvoie vers « activé », dans la langue du formulaire', async () => {
    const res = await submit({ token: KNOWN, lang: 'en' })
    expect(res.status).toBe(303)
    // Relative : jamais l'hôte interne du conteneur.
    expect(res.headers.get('location')).toBe('/en/compte/rappel/confirmer?etat=actif')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    const { where, data } = db.user.updateMany.mock.calls[0][0]
    expect(where).toMatchObject({ reminderToken: KNOWN, reminderOptInAt: null, emailVerified: null })
    expect(Object.keys(data).sort()).toEqual(['emailVerified', 'reminderOptInAt'])
  })

  it('jeton inconnu, expiré ou mal formé : « lien expiré » ; mal formé, sans lecture en base', async () => {
    expect((await submit({ token: UNKNOWN, lang: 'fr' })).headers.get('location')).toBe(
      '/fr/compte/rappel/confirmer?etat=invalide'
    )
    vi.clearAllMocks()
    rateLimitMock.mockReturnValue({ ok: true })
    expect((await submit({ token: '<x>', lang: '//evil.example' })).headers.get('location')).toBe(
      '/fr/compte/rappel/confirmer?etat=invalide'
    )
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })

  it('quota par réseau atteint : 429, rien d’écrit', async () => {
    rateLimitMock.mockReturnValue({ ok: false, retryAfterSec: 20 })
    const res = await submit({ token: KNOWN, lang: 'fr' })
    expect(res.status).toBe(429)
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})

describe('GET (lien ouvert par une passerelle de messagerie)', () => {
  it('ne confirme RIEN et renvoie vers la page au bouton', async () => {
    const res = await GET(new Request(url(`?token=${KNOWN}&lang=it`)))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`/it/compte/rappel/confirmer?token=${KNOWN}`)
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})
