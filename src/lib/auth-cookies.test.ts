import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_GRANTED,
  ANALYTICS_CONSENT_REFUSED,
  VISITOR_COOKIE,
  hasAnsweredAnalyticsConsent,
  isAnalyticsConsentGranted,
  readConsentedVisitorId,
} from '@/lib/auth-cookies'

/** Magasin de cookies minimal, comme celui de next/headers. */
function store(values: Record<string, string>) {
  return {
    get: (name: string) => (name in values ? { value: values[name] } : undefined),
  }
}

describe('valeurs versionnées du consentement', () => {
  it("l'accord courant vaut '2', le refus '0'", () => {
    expect(ANALYTICS_CONSENT_GRANTED).toBe('2')
    expect(ANALYTICS_CONSENT_REFUSED).toBe('0')
  })
})

describe('isAnalyticsConsentGranted', () => {
  it("n'accepte que la version courante", () => {
    expect(isAnalyticsConsentGranted('2')).toBe(true)
  })

  it("l'ancien accord '1' (libellé « anonymes ») ne vaut plus accord", () => {
    expect(isAnalyticsConsentGranted('1')).toBe(false)
  })

  it('refus, absence de cookie et valeurs inconnues ne valent pas accord', () => {
    for (const value of ['0', '', ' 2', '2 ', '22', '3', 'true', null, undefined]) {
      expect(isAnalyticsConsentGranted(value)).toBe(false)
    }
  })
})

describe('hasAnsweredAnalyticsConsent', () => {
  it('accord et refus sont des réponses à la question actuelle', () => {
    expect(hasAnsweredAnalyticsConsent('2')).toBe(true)
    expect(hasAnsweredAnalyticsConsent('0')).toBe(true)
  })

  it("l'ancienne valeur '1' repose la question", () => {
    expect(hasAnsweredAnalyticsConsent('1')).toBe(false)
  })

  it('sans cookie ou avec une valeur inconnue, la question est posée', () => {
    for (const value of ['', ' 0', '00', '3', 'false', null, undefined]) {
      expect(hasAnsweredAnalyticsConsent(value)).toBe(false)
    }
  })
})

describe('readConsentedVisitorId', () => {
  it("rend lp_vid sous l'accord courant", () => {
    expect(
      readConsentedVisitorId(store({ [ANALYTICS_CONSENT_COOKIE]: '2', [VISITOR_COOKIE]: 'vid-1' }))
    ).toBe('vid-1')
  })

  it("ne lit jamais lp_vid sous l'ancien '1', un refus ou sans choix", () => {
    for (const consent of ['1', '0', undefined]) {
      const values: Record<string, string> = { [VISITOR_COOKIE]: 'vid-1' }
      if (consent !== undefined) values[ANALYTICS_CONSENT_COOKIE] = consent
      expect(readConsentedVisitorId(store(values))).toBeNull()
    }
  })

  it('accord sans cookie lp_vid (ou vide) : null', () => {
    expect(readConsentedVisitorId(store({ [ANALYTICS_CONSENT_COOKIE]: '2' }))).toBeNull()
    expect(readConsentedVisitorId(store({ [ANALYTICS_CONSENT_COOKIE]: '2', [VISITOR_COOKIE]: '' }))).toBeNull()
  })
})
