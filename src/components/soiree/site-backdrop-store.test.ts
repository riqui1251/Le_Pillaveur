import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_BACKDROP, claimBackdrop, readBackdrop, subscribeBackdrop } from './site-backdrop-store'

/**
 * Le fond animé du site prend la teinte de la page affichée ; une page qui se
 * démonte ne doit pas effacer celle de la page qui l'a remplacée.
 */
describe('fond animé du site', () => {
  it('teinte de la page affichée, puis couleurs par défaut quand elle part', () => {
    expect(readBackdrop()).toBe(DEFAULT_BACKDROP)
    const release = claimBackdrop({ accent: 'hi-lo', strong: true })
    expect(readBackdrop()).toEqual({ accent: 'hi-lo', strong: true })
    release()
    expect(readBackdrop()).toBe(DEFAULT_BACKDROP)
  })

  it('l’ancienne page démontée après la nouvelle ne lui reprend pas le fond', () => {
    const releaseGame = claimBackdrop({ accent: 'hi-lo', strong: true })
    const releaseSoiree = claimBackdrop({ accent: 'purple' })
    releaseGame()
    expect(readBackdrop()).toEqual({ accent: 'purple' })
    releaseSoiree()
    expect(readBackdrop()).toBe(DEFAULT_BACKDROP)
  })

  it('prévient les abonnés à chaque changement, plus après désabonnement', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBackdrop(listener)
    const release = claimBackdrop({ accent: 'plinko' })
    release()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    claimBackdrop({ accent: 'pmu' })()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
