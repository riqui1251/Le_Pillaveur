import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_USER_AGENT_MARKER, isCapacitorApp } from './native-app'

/**
 * La coquille se reconnaît au pont natif OU à la marque de son user-agent :
 * une page servie depuis le cache du service worker peut arriver sans pont
 * (APK qui ne relaie pas les requêtes du worker), l'app ne doit pas pour
 * autant se prendre pour le site.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isCapacitorApp', () => {
  it('vrai avec le pont natif, même sans marque', () => {
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true } })
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' })
    expect(isCapacitorApp()).toBe(true)
  })

  it('vrai avec la marque du user-agent, même sans pont (page du cache)', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 (Linux; Android 14) Chrome/130 ${APP_USER_AGENT_MARKER}/1` })
    expect(isCapacitorApp()).toBe(true)
  })

  it('faux sur le site : ni pont, ni marque ; faux aussi hors navigateur', () => {
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => false } })
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' })
    expect(isCapacitorApp()).toBe(false)
    vi.stubGlobal('window', undefined)
    expect(isCapacitorApp()).toBe(false)
  })
})
