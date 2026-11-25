import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGuestSession, rejectGuestName } from './guest-session-client'

/**
 * Création d'un compte invité côté navigateur : ce qui part vers
 * /api/auth/guest et la lecture de chaque réponse de la route (porte d'âge,
 * quota, refus, panne réseau). `fetch` est remplacé par un espion.
 */

const fetchMock = vi.fn()

function reply(status: number, body: unknown) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createGuestSession', () => {
  it('envoie le pseudo nettoyé, la langue et l’ambiance de l’appareil, avec le cookie', async () => {
    fetchMock.mockResolvedValue(reply(200, { user: { id: 'u1' } }))
    await expect(createGuestSession('  Camille  ', 'fr')).resolves.toEqual({ kind: 'created' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/guest')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    // Hors navigateur, l'ambiance de l'appareil vaut son défaut (« alcool »).
    expect(JSON.parse(String(init.body))).toEqual({ displayName: 'Camille', locale: 'fr', ambianceMode: 'alcool' })
  })

  it('reconnaît la porte d’âge', async () => {
    fetchMock.mockResolvedValue(reply(403, { error: 'age_gate_required', code: 'age_gate_required' }))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'age-gate' })
  })

  it('un autre 403 reste un refus ordinaire', async () => {
    fetchMock.mockResolvedValue(reply(403, { error: 'forbidden', code: 'forbidden' }))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'refused', error: 'forbidden' })
  })

  it('rend le délai du quota, 60 s s’il manque', async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { error: 'Trop de tentatives', code: 'rate_limited', retryAfterSec: 42 }))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'rate-limited', retryAfterSec: 42 })

    fetchMock.mockResolvedValueOnce(reply(429, { code: 'rate_limited' }))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'rate-limited', retryAfterSec: 60 })
  })

  it('garde `error` d’un refus (code ou phrase déjà traduite), null sans corps lisible', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Ce pseudo n’est pas autorisé.', code: 'profanity' }))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'refused', error: 'Ce pseudo n’est pas autorisé.' })

    fetchMock.mockResolvedValueOnce(reply(503, { error: 'service_unavailable' }))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'refused', error: 'service_unavailable' })

    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'refused', error: null })
  })

  it('une panne réseau ne lève pas : elle se dit', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createGuestSession('Camille', 'fr')).resolves.toEqual({ kind: 'network' })
  })
})

describe('rejectGuestName', () => {
  it('laisse passer un pseudo valable, sans rien envoyer', () => {
    expect(rejectGuestName('  Camille ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse un pseudo vide ou trop long avec la clé de common.nameValidation', () => {
    expect(rejectGuestName('   ')).toBe('empty')
    expect(rejectGuestName('x'.repeat(31))).toBe('tooLong')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
