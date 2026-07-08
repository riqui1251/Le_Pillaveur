import { describe, expect, it } from 'vitest'
import { DEFAULT_ONLINE_ICON } from '@/lib/online/cosmetics'
import { DEFAULT_ONLINE_PREFERENCES, parseOnlinePreferences, sanitizeOnlinePreferences } from './online-preferences'

describe('sanitizeOnlinePreferences', () => {
  it('icône connue du catalogue online → conservée', () => {
    const out = sanitizeOnlinePreferences({ icon: '🦊' })
    expect(out.icon).toBe('🦊')
  })

  it('icône inconnue ou absente → défaut 🍺 (jamais undefined)', () => {
    expect(sanitizeOnlinePreferences({ icon: '🍕' }).icon).toBe(DEFAULT_ONLINE_ICON)
    expect(sanitizeOnlinePreferences({}).icon).toBe(DEFAULT_ONLINE_ICON)
  })

  it('icône du catalogue LOCAL (hors séries online) est rejetée', () => {
    // 🍕 existe dans PLAYER_ICONS (local) mais dans aucune série online.
    expect(sanitizeOnlinePreferences({ icon: '🍕' }).icon).toBe(DEFAULT_ONLINE_ICON)
  })

  it('effet online-exclusif (toast) accepté', () => {
    expect(sanitizeOnlinePreferences({ specialEffect: 'toast' }).specialEffect).toBe('toast')
  })

  it('effet inconnu → null', () => {
    expect(sanitizeOnlinePreferences({ specialEffect: 'inexistant' as never }).specialEffect).toBeNull()
  })

  it('cadre de rôle (sentinel) accepté structurellement', () => {
    expect(sanitizeOnlinePreferences({ iconFrame: 'sentinel' }).iconFrame).toBe('sentinel')
  })

  it('cadre staff accepté structurellement', () => {
    expect(sanitizeOnlinePreferences({ iconFrame: 'staff' }).iconFrame).toBe('staff')
  })

  it('cadre inconnu → null', () => {
    expect(sanitizeOnlinePreferences({ iconFrame: 'inexistant' as never }).iconFrame).toBeNull()
  })

  it('la couleur est toujours forcée au défaut', () => {
    expect(sanitizeOnlinePreferences({ color: 'bg-red-500' }).color).toBe(DEFAULT_ONLINE_PREFERENCES.color)
  })
})

describe('parseOnlinePreferences', () => {
  it('json absent → défauts', () => {
    expect(parseOnlinePreferences(null)).toEqual(DEFAULT_ONLINE_PREFERENCES)
    expect(parseOnlinePreferences(undefined)).toEqual(DEFAULT_ONLINE_PREFERENCES)
  })

  it('json invalide → défauts (pas d’exception)', () => {
    expect(parseOnlinePreferences('{not json')).toEqual(DEFAULT_ONLINE_PREFERENCES)
  })

  it('json valide → préférences sanitizées', () => {
    const json = JSON.stringify({ icon: '🦊', specialEffect: 'fire', iconFrame: 'gold' })
    expect(parseOnlinePreferences(json)).toEqual({
      color: DEFAULT_ONLINE_PREFERENCES.color,
      icon: '🦊',
      specialEffect: 'fire',
      iconFrame: 'gold',
    })
  })

  it('icône V1 (catalogue local pré-migration) retombe silencieusement sur le défaut', () => {
    // Simule une préférence stockée avant la V2 avec une icône hors séries online.
    const json = JSON.stringify({ icon: '🚀', specialEffect: null, iconFrame: null })
    expect(parseOnlinePreferences(json).icon).toBe(DEFAULT_ONLINE_ICON)
  })
})
