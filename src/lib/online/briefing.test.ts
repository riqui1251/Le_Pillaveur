import { describe, expect, it } from 'vitest'
import { BRIEFING_TIMEOUT_MS, briefingTickDelay, isBriefingExpired } from './briefing'

describe('isBriefingExpired', () => {
  it('vrai à partir de startedAt + 90 s, pas avant', () => {
    const briefing = { startedAt: 1_000_000, acks: [] }
    expect(isBriefingExpired(briefing, 1_000_000 + BRIEFING_TIMEOUT_MS - 1)).toBe(false)
    expect(isBriefingExpired(briefing, 1_000_000 + BRIEFING_TIMEOUT_MS)).toBe(true)
  })
})

describe('briefingTickDelay', () => {
  it('premier tick : 300 ms à 1 s après l’échéance, jamais moins de 250 ms', () => {
    expect(briefingTickDelay(10_000, 0, 0, false)).toBe(10_300)
    expect(briefingTickDelay(10_000, 0, 1, false)).toBe(11_000)
    expect(briefingTickDelay(10_000, 20_000, 0.5, false)).toBe(250)
  })

  it('relances : toutes les 2 à 3 s, quelle que soit l’échéance', () => {
    expect(briefingTickDelay(10_000, 0, 0, true)).toBe(2_000)
    expect(briefingTickDelay(10_000, 0, 1, true)).toBe(3_000)
  })

  it('téléphone 2 s en avance sur le serveur : un tick finit par passer', () => {
    // Le serveur refuse un tick reçu avant SON échéance. Avec un envoi
    // unique, le seul tick (refusé) n'était jamais renvoyé.
    const serverStartedAt = 0
    const skewMs = 2_000
    const deadline = serverStartedAt + BRIEFING_TIMEOUT_MS
    let clientNow = skewMs
    let retry = false
    let sent = 0
    let accepted = false
    while (!accepted && sent < 10) {
      clientNow += briefingTickDelay(deadline, clientNow, 0, retry)
      retry = true
      sent += 1
      accepted = clientNow - skewMs >= deadline
    }
    expect(accepted).toBe(true)
    expect(sent).toBeLessThanOrEqual(2)
  })
})
