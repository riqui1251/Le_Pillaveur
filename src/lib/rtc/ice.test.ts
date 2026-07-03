import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { buildIceServers, TURN_TTL_SECONDS } from './ice'

describe('buildIceServers (vocal WebRTC)', () => {
  it('sans TURN configuré : STUN seul', () => {
    const { iceServers } = buildIceServers({})
    expect(iceServers).toHaveLength(1)
    expect(String(iceServers[0].urls)).toContain('stun:')
    expect(iceServers[0].username).toBeUndefined()
  })

  it('avec TURN : identifiants éphémères au format coturn (HMAC-SHA1 base64)', () => {
    const now = 1_700_000_000_000
    const { iceServers, ttlSeconds } = buildIceServers(
      { turnHost: 'vps.example.com', turnSecret: 'top-secret' },
      now
    )
    expect(ttlSeconds).toBe(TURN_TTL_SECONDS)
    const turn = iceServers.find((s) => String(s.urls).includes('turn:'))!
    expect(turn.urls).toContain('turn:vps.example.com:3478?transport=udp')
    // username = expiration unix : maintenant + TTL
    expect(turn.username).toBe(`${Math.floor(now / 1000) + TURN_TTL_SECONDS}:lepillaveur`)
    // credential vérifiable avec le même secret
    const expected = createHmac('sha1', 'top-secret').update(turn.username!).digest('base64')
    expect(turn.credential).toBe(expected)
  })

  it('le secret ne fuit jamais dans la réponse', () => {
    const { iceServers } = buildIceServers({ turnHost: 'h', turnSecret: 'ne-doit-pas-fuiter' })
    expect(JSON.stringify(iceServers)).not.toContain('ne-doit-pas-fuiter')
  })
})
