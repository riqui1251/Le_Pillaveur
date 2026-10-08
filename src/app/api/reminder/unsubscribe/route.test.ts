import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/reminder/unsubscribe — désinscription SANS connexion.
 * Ce qu'on tient : seul un POST coupe le rappel (bouton de la page, ou
 * « Se désabonner » de la messagerie, RFC 8058) — un GET, que font les
 * passerelles de messagerie sur chaque lien, ne touche à rien ; et la
 * réponse est IDENTIQUE pour un jeton connu, inconnu ou mal formé.
 */

const { db, rateLimitMock } = vi.hoisted(() => ({
  db: { user: { updateMany: vi.fn() } },
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

const url = (query: string) => `http://interne:3000/api/reminder/unsubscribe${query}`

/** Ce qu'un visiteur peut observer d'une réponse. */
async function observable(res: Response) {
  return {
    status: res.status,
    location: res.headers.get('location'),
    cache: res.headers.get('cache-control'),
    body: await res.text(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  rateLimitMock.mockReturnValue({ ok: true })
  db.user.updateMany.mockImplementation(async ({ where }) => ({ count: where.reminderToken === KNOWN ? 1 : 0 }))
})

const form = (fields: Record<string, string>, query = '') =>
  new Request(url(query), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })

describe('GET (passerelle de messagerie, ou URL d’en-tête suivie)', () => {
  it('ne coupe RIEN et renvoie vers la page qui demande de confirmer, dans la langue du lien', async () => {
    const res = await GET(new Request(url(`?token=${KNOWN}&lang=es`)))
    expect(res.status).toBe(303)
    // Relative : jamais l'hôte interne du conteneur.
    expect(res.headers.get('location')).toBe(`/es/compte/rappel?token=${KNOWN}`)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })

  it('même forme de réponse pour un jeton connu ou inconnu ; un jeton mal formé n’est pas recopié', async () => {
    const known = await GET(new Request(url(`?token=${KNOWN}&lang=fr`)))
    const unknown = await GET(new Request(url(`?token=${UNKNOWN}&lang=fr`)))
    expect(known.status).toBe(unknown.status)
    expect(known.headers.get('location')).toBe(`/fr/compte/rappel?token=${KNOWN}`)
    expect(unknown.headers.get('location')).toBe(`/fr/compte/rappel?token=${UNKNOWN}`)
    const bad = await GET(new Request(url('?token=<x>&lang=//evil.example')))
    expect(bad.headers.get('location')).toBe('/fr/compte/rappel')
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })

  it('quota par réseau atteint : 429', async () => {
    rateLimitMock.mockReturnValue({ ok: false, retryAfterSec: 20 })
    const res = await GET(new Request(url(`?token=${KNOWN}`)))
    expect(res.status).toBe(429)
  })
})

describe('POST du formulaire de la page', () => {
  it('coupe le rappel du jeton (champ caché) puis renvoie vers « c’est noté », dans la langue du formulaire', async () => {
    const res = await POST(form({ token: KNOWN, lang: 'it' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/it/compte/rappel')
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { reminderToken: KNOWN, reminderOptInAt: { not: null } },
      data: { reminderOptInAt: null },
    })
  })

  it('même réponse pour un jeton connu, inconnu ou mal formé', async () => {
    const responses = await Promise.all(
      [KNOWN, UNKNOWN, '<x>'].map(async (token) => observable(await POST(form({ token, lang: 'fr' }))))
    )
    for (const response of responses) expect(response).toEqual(responses[0])
  })

  it('jeton mal formé : aucune lecture en base', async () => {
    await POST(form({ token: 'court', lang: 'fr' }))
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})

describe('POST « One-Click » de la messagerie (RFC 8058)', () => {
  it('coupe le rappel du jeton de l’URL, répond 200 sans page', async () => {
    const res = await POST(
      new Request(url(`?token=${KNOWN}&lang=fr`), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { reminderToken: KNOWN, reminderOptInAt: { not: null } },
      data: { reminderOptInAt: null },
    })
  })

  it('même corps pour un jeton connu ou inconnu', async () => {
    const oneClick = (token: string) =>
      POST(new Request(url(`?token=${token}`), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(await observable(await oneClick(KNOWN))).toEqual(await observable(await oneClick(UNKNOWN)))
  })

  it('corps trop gros : traité comme vide, rien de coupé sans jeton', async () => {
    const res = await POST(
      new Request(url(''), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'x'.repeat(5000),
      })
    )
    expect(res.status).toBe(303)
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})
