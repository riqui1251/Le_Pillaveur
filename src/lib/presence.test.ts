import { describe, expect, it } from 'vitest'
import { isOnline, ONLINE_WINDOW_MS, onlineSince } from '@/lib/presence'

const NOW = Date.parse('2026-09-13T12:00:00.000Z')

describe('ONLINE_WINDOW_MS — une seule fenêtre pour tout le site', () => {
  it('vaut 3 minutes : un ping perdu (60 s) ne coupe pas le statut', () => {
    expect(ONLINE_WINDOW_MS).toBe(3 * 60 * 1000)
  })
})

describe('onlineSince', () => {
  it('renvoie maintenant moins la fenêtre', () => {
    expect(onlineSince(NOW).toISOString()).toBe('2026-09-13T11:57:00.000Z')
  })

  it('part de l’horloge courante sans argument', () => {
    const before = Date.now()
    const since = onlineSince().getTime()
    expect(since).toBeGreaterThanOrEqual(before - ONLINE_WINDOW_MS)
    expect(since).toBeLessThanOrEqual(Date.now() - ONLINE_WINDOW_MS)
  })
})

describe('isOnline', () => {
  it('en ligne juste après un ping', () => {
    expect(isOnline(new Date(NOW - 60 * 1000), NOW)).toBe(true)
  })

  it('en ligne pile à la borne (même règle que le filtre `gte`)', () => {
    expect(isOnline(onlineSince(NOW), NOW)).toBe(true)
  })

  it('hors ligne une milliseconde après la fenêtre', () => {
    expect(isOnline(new Date(NOW - ONLINE_WINDOW_MS - 1), NOW)).toBe(false)
  })

  it('accepte une chaîne ISO (dates reçues en JSON côté client)', () => {
    expect(isOnline('2026-09-13T11:58:30.000Z', NOW)).toBe(true)
    expect(isOnline('2026-09-10T16:08:00.000Z', NOW)).toBe(false)
  })

  it('hors ligne sans date ou avec une date illisible', () => {
    expect(isOnline(null, NOW)).toBe(false)
    expect(isOnline(undefined, NOW)).toBe(false)
    expect(isOnline('', NOW)).toBe(false)
    expect(isOnline('pas une date', NOW)).toBe(false)
    expect(isOnline(new Date(Number.NaN), NOW)).toBe(false)
  })
})
