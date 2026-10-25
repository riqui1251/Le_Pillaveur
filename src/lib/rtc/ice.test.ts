import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { buildIceServers, TURN_TTL_SECONDS } from './ice'

describe('buildIceServers (vocal WebRTC)', () => {
  it('sans TURN configuré : STUN seul', () => {
    const { iceServers } = buildIceServers({}, 'user-1')
    expect(iceServers).toHaveLength(1)
    expect(String(iceServers[0].urls)).toContain('stun:')
    expect(iceServers[0].username).toBeUndefined()
  })

  it('avec TURN : identifiants éphémères au format coturn (HMAC-SHA1 base64)', () => {
    const now = 1_700_000_000_000
    const { iceServers, ttlSeconds } = buildIceServers(
      { turnHost: 'vps.example.com', turnSecret: 'top-secret' },
      'user-1',
      now
    )
    expect(ttlSeconds).toBe(TURN_TTL_SECONDS)
    const turn = iceServers.find((s) => String(s.urls).includes('turn:'))!
    expect(turn.urls).toContain('turn:vps.example.com:3478?transport=udp')
    // username = expiration unix : maintenant + TTL, puis le compte
    expect(turn.username).toBe(`${Math.floor(now / 1000) + TURN_TTL_SECONDS}:user-1`)
    // credential vérifiable avec le même secret
    const expected = createHmac('sha1', 'top-secret').update(turn.username!).digest('base64')
    expect(turn.credential).toBe(expected)
  })

  it('le secret ne fuit jamais dans la réponse', () => {
    const { iceServers } = buildIceServers({ turnHost: 'h', turnSecret: 'ne-doit-pas-fuiter' }, 'user-1')
    expect(JSON.stringify(iceServers)).not.toContain('ne-doit-pas-fuiter')
  })

  /**
   * coturn (userdb.c, get_real_username) compte son user-quota sur ce qui suit
   * le « : » d'un identifiant horodaté. Portage fidèle ci-dessous : avec
   * l'ancien suffixe fixe « lepillaveur », tous les comptes, à toute heure,
   * tombaient sur la MÊME clé — un seul quota de 32 allocations pour le site.
   */
  const coturnQuotaKey = (username: string) => {
    const col = username.indexOf(':')
    if (col <= 0) return col === 0 ? username.slice(1) : username
    return /^\d+$/.test(username.slice(0, col)) ? username.slice(col + 1) : username.slice(0, col)
  }
  const turnUsername = (userId: string, nowMs: number) =>
    buildIceServers({ turnHost: 'h', turnSecret: 's' }, userId, nowMs).iceServers.find((s) => s.username)!
      .username!

  it('quota coturn : une clé par compte, stable dans le temps', () => {
    const now = 1_700_000_000_000
    const keysOverTime = new Set(
      Array.from({ length: 60 }, (_, i) => coturnQuotaKey(turnUsername('alice', now + i * 1000)))
    )
    expect([...keysOverTime]).toEqual(['alice'])
    expect(coturnQuotaKey(turnUsername('bob', now))).toBe('bob')
    expect(coturnQuotaKey(`${Math.floor(now / 1000)}:lepillaveur`)).toBe('lepillaveur')
  })

  it('TTL court : un ban vocal cesse vite d’ouvrir des allocations', () => {
    expect(TURN_TTL_SECONDS).toBeGreaterThanOrEqual(15 * 60)
    expect(TURN_TTL_SECONDS).toBeLessThanOrEqual(30 * 60)
  })
})
