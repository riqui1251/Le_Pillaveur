import { describe, expect, it } from 'vitest'

import { getClientIpFromRequest, getCountryFromRequest, resolveGeoFromRequest } from '@/lib/geo-server'

function requestWith(headers: Record<string, string>): Request {
  return new Request('https://example.test/api', { headers })
}

describe('getCountryFromRequest', () => {
  it('lit le pays posé par Cloudflare', () => {
    expect(getCountryFromRequest(requestWith({ 'cf-ipcountry': 'FR' }))).toBe('FR')
  })

  it("ignore les en-têtes de pays qu'un client peut écrire lui-même", () => {
    expect(
      getCountryFromRequest(requestWith({ 'x-vercel-ip-country': 'US', 'x-country-code': 'US' }))
    ).toBeNull()
    // Même envoyés avec celui de Cloudflare, ils ne passent plus devant.
    expect(
      getCountryFromRequest(
        requestWith({ 'x-vercel-ip-country': 'US', 'cf-ipcountry': 'BE', 'x-country-code': 'US' })
      )
    ).toBe('BE')
  })

  it('écarte les codes spéciaux de Cloudflare : XX (inconnu) et T1 (Tor)', () => {
    expect(getCountryFromRequest(requestWith({ 'cf-ipcountry': 'XX' }))).toBeNull()
    expect(getCountryFromRequest(requestWith({ 'cf-ipcountry': 'T1' }))).toBeNull()
  })

  it("n'accepte qu'un code de deux lettres majuscules", () => {
    for (const value of ['fr', 'FRA', 'F', 'F1', '<b>', '']) {
      expect(getCountryFromRequest(requestWith({ 'cf-ipcountry': value }))).toBeNull()
    }
    expect(getCountryFromRequest(requestWith({ 'cf-ipcountry': ' IT ' }))).toBe('IT')
  })
})

describe('getClientIpFromRequest', () => {
  it("préfère CF-Connecting-IP (sûr seulement si l'origine n'est joignable que par Cloudflare)", () => {
    expect(
      getClientIpFromRequest(
        requestWith({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })
      )
    ).toBe('203.0.113.7')
  })

  it('se rabat sur la première adresse de X-Forwarded-For, puis sur X-Real-IP', () => {
    expect(getClientIpFromRequest(requestWith({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe(
      '198.51.100.1'
    )
    expect(getClientIpFromRequest(requestWith({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(getClientIpFromRequest(requestWith({}))).toBeNull()
  })

  it('ramène une IPv4 encapsulée en IPv6 à sa forme IPv4', () => {
    expect(getClientIpFromRequest(requestWith({ 'cf-connecting-ip': '::ffff:203.0.113.7' }))).toBe(
      '203.0.113.7'
    )
  })
})

describe('resolveGeoFromRequest', () => {
  it("rend le pays et l'adresse posés par Cloudflare", () => {
    expect(
      resolveGeoFromRequest(requestWith({ 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'FR' }))
    ).toEqual({ ip: '203.0.113.7', country: 'FR' })
  })

  it('ne devine plus le pays quand Cloudflare ne le donne pas : null, jamais un en-tête falsifiable', () => {
    // XX (inconnu de Cloudflare) : plus de base locale pour trancher, et
    // x-vercel-ip-country, que n'importe quel client peut écrire, reste ignoré.
    expect(
      resolveGeoFromRequest(
        requestWith({ 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'XX', 'x-vercel-ip-country': 'US' })
      )
    ).toEqual({ ip: '203.0.113.7', country: null })
    expect(
      resolveGeoFromRequest(requestWith({ 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'T1' }))
    ).toEqual({ ip: '203.0.113.7', country: null })
  })

  it("sans en-tête Cloudflare (accès direct en développement), l'adresse est lue et le pays reste inconnu", () => {
    expect(resolveGeoFromRequest(requestWith({ 'x-forwarded-for': '192.168.1.10' }))).toEqual({
      ip: '192.168.1.10',
      country: null,
    })
  })
})
