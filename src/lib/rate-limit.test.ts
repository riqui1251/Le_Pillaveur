import { describe, expect, it } from 'vitest'
import {
  checkRateLimit,
  networkRateLimitKey,
  rateLimitKey,
  rateLimitResponse,
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

/** Requête telle que Cloudflare la présente : l'adresse du visiteur dans CF-Connecting-IP. */
function cloudflareRequest(ip: string): Request {
  return new Request('https://example.test/api', { headers: { 'cf-connecting-ip': ip } })
}

const fromNetwork = (ip: string) => networkRateLimitKey(cloudflareRequest(ip), 'guest')

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

  it('networkRateLimitKey ramène deux IPv6 du même /64 à une seule clé', () => {
    // Deux téléphones d'une même box : adresses différentes, même /64.
    expect(fromNetwork('2a01:cb05:545:a200:1c2d:3e4f:5a6b:7c8d')).toBe('guest:2a01:cb05:0545:a200::/64')
    expect(fromNetwork('2a01:cb05:545:a200::9')).toBe('guest:2a01:cb05:0545:a200::/64')
    // Un /64 voisin est un autre foyer.
    expect(fromNetwork('2a01:cb05:545:a201::9')).not.toBe(fromNetwork('2a01:cb05:545:a200::9'))
  })

  it('networkRateLimitKey garde deux IPv4 différentes séparées (pas de /24 : CGNAT)', () => {
    expect(fromNetwork('203.0.113.7')).toBe('guest:203.0.113.7')
    expect(fromNetwork('203.0.113.8')).toBe('guest:203.0.113.8')
    expect(fromNetwork('203.0.113.7')).not.toBe(fromNetwork('203.0.113.8'))
  })

  it('le compteur est partagé dans un /64 IPv6, pas entre deux IPv4', () => {
    const scope = freshKey()
    const key = (ip: string) => networkRateLimitKey(cloudflareRequest(ip), scope)
    expect(checkRateLimit(key('2a01:cb05:545:a200::1'), 1, 10_000).ok).toBe(true)
    // Autre adresse, même /64 : c'est le même compteur, déjà plein.
    expect(checkRateLimit(key('2a01:cb05:545:a200::2'), 1, 10_000).ok).toBe(false)
    expect(checkRateLimit(key('203.0.113.7'), 1, 10_000).ok).toBe(true)
    expect(checkRateLimit(key('203.0.113.8'), 1, 10_000).ok).toBe(true)
  })

  it('sans adresse lisible, la clé réseau retombe sur « unknown » comme rateLimitKey', () => {
    const request = new Request('https://example.test/api')
    expect(networkRateLimitKey(request, 'guest')).toBe('guest:unknown')
    expect(rateLimitKey(request, 'guest')).toBe('guest:unknown')
  })
})

describe('rateLimitResponse', () => {
  it('porte un code stable et le délai en secondes, en plus du texte et de Retry-After', async () => {
    const response = rateLimitResponse(42)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    const body = await response.json()
    expect(body).toMatchObject({ code: 'rate_limited', retryAfterSec: 42 })
    expect(typeof body.error).toBe('string')
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
