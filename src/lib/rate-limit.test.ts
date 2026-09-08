import { describe, expect, it } from 'vitest'
import {
  checkRateLimit,
  rateLimitKey,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

/** Clé unique par test : le compteur est un Map de module partagé. */
let seq = 0
function freshKey(): string {
  seq += 1
  return `test-scope-${seq}`
}

function jsonRequest(payload: string, withContentLength = true): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (withContentLength) {
    headers['content-length'] = String(new TextEncoder().encode(payload).length)
  }
  return new Request('https://example.test/api', { method: 'POST', headers, body: payload })
}

describe('checkRateLimit', () => {
  it('laisse passer jusqu’à la limite puis refuse avec un délai', () => {
    const key = freshKey()
    expect(checkRateLimit(key, 3, 10_000)).toEqual({ ok: true })
    expect(checkRateLimit(key, 3, 10_000)).toEqual({ ok: true })
    expect(checkRateLimit(key, 3, 10_000)).toEqual({ ok: true })

    const refused = checkRateLimit(key, 3, 10_000)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.retryAfterSec).toBeGreaterThan(0)
  })

  it('compte séparément deux clés différentes', () => {
    const a = freshKey()
    const b = freshKey()
    expect(checkRateLimit(a, 1, 10_000).ok).toBe(true)
    expect(checkRateLimit(a, 1, 10_000).ok).toBe(false)
    expect(checkRateLimit(b, 1, 10_000).ok).toBe(true)
  })
})

describe('clés de quota', () => {
  it('userRateLimitKey ne dépend pas de l’IP (quota par compte)', () => {
    expect(userRateLimitKey('chat', 'u1')).toBe('chat:user:u1')
    expect(userRateLimitKey('chat', 'u1')).not.toBe(userRateLimitKey('chat', 'u2'))
  })

  it('rateLimitKey isole les IP entre elles', () => {
    const withIp = (ip: string) =>
      rateLimitKey(new Request('https://example.test/api', { headers: { 'x-forwarded-for': ip } }), 'feedback')
    expect(withIp('1.2.3.4')).not.toBe(withIp('5.6.7.8'))
    expect(withIp('1.2.3.4')).toBe('feedback:1.2.3.4')
  })
})

describe('readJsonBodyLimited', () => {
  it('accepte un corps sous la limite', async () => {
    const result = await readJsonBodyLimited<{ a: number }>(jsonRequest('{"a":1}'), 1024)
    expect(result).toEqual({ ok: true, body: { a: 1 } })
  })

  it('refuse sur le Content-Length annoncé sans lire le corps', async () => {
    const request = new Request('https://example.test/api', {
      method: 'POST',
      headers: { 'content-length': '999999' },
      body: '{}',
    })
    expect(await readJsonBodyLimited(request, 64)).toEqual({ ok: false, reason: 'too_large' })
    // Corps jamais consommé : le refus a bien eu lieu avant la lecture.
    expect(request.bodyUsed).toBe(false)
  })

  it('refuse un corps trop gros même sans Content-Length fiable', async () => {
    const payload = JSON.stringify({ big: 'x'.repeat(200) })
    expect(await readJsonBodyLimited(jsonRequest(payload, false), 64)).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })

  it('mesure des octets et non des caractères (accents, émojis)', async () => {
    // 40 émojis = 160 octets UTF-8 pour 80 unités de code UTF-16.
    const payload = JSON.stringify({ m: '🍺'.repeat(40) })
    expect(await readJsonBodyLimited(jsonRequest(payload, false), 120)).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })

  it('coupe le flux dès le dépassement, sans tout charger en mémoire', async () => {
    // Corps chunké sans Content-Length : seuls les premiers morceaux doivent
    // être tirés du flux, la suite n'est jamais lue.
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        if (pulled > 50) return controller.close()
        controller.enqueue(new TextEncoder().encode('x'.repeat(64)))
      },
    })
    const request = new Request('https://example.test/api', {
      method: 'POST',
      body: stream,
      // @ts-expect-error duplex est requis par undici pour un corps en flux
      duplex: 'half',
    })

    expect(await readJsonBodyLimited(request, 128)).toEqual({ ok: false, reason: 'too_large' })
    expect(pulled).toBeLessThan(10)
  })

  it('signale un JSON invalide plutôt que de lever', async () => {
    expect(await readJsonBodyLimited(jsonRequest('pas du json'), 1024)).toEqual({
      ok: false,
      reason: 'invalid_json',
    })
  })
})
