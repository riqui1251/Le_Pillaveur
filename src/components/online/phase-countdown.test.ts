import { describe, expect, it } from 'vitest'
import { COUNTDOWN_MIN_TICK_MS, countdownSnapshot, nextSecondTickMs } from './phase-countdown'

/**
 * Les secondes affichées doivent être EXACTEMENT celles que les composants
 * calculaient avec leur horloge locale (`Math.ceil(max(0, endsAt - clock) / 1000)`),
 * et le tick suivant doit tomber au moment précis où le chiffre change.
 */

describe('countdownSnapshot', () => {
  it('arrondit à la seconde supérieure, comme les comptes à rebours d’origine', () => {
    expect(countdownSnapshot(10_000, 0).seconds).toBe(10)
    expect(countdownSnapshot(10_000, 1).seconds).toBe(10)
    expect(countdownSnapshot(10_000, 9_000).seconds).toBe(1)
    expect(countdownSnapshot(10_000, 9_999).seconds).toBe(1)
    expect(countdownSnapshot(10_000, 10_000).seconds).toBe(0)
  })

  it('ne descend jamais sous zéro une fois l’échéance passée', () => {
    const snap = countdownSnapshot(10_000, 12_345)
    expect(snap.leftMs).toBe(0)
    expect(snap.seconds).toBe(0)
    expect(snap.ratio).toBe(0)
    expect(snap.expired).toBe(true)
  })

  it('donne la fraction de barre plafonnée à 1', () => {
    expect(countdownSnapshot(60_000, 15_000, 60_000).ratio).toBe(0.75)
    expect(countdownSnapshot(60_000, 0, 30_000).ratio).toBe(1)
    // Sans durée totale, pas de barre.
    expect(countdownSnapshot(60_000, 0).ratio).toBe(0)
    expect(countdownSnapshot(60_000, 0, 0).ratio).toBe(0)
  })

  it('traite une échéance absente comme déjà passée', () => {
    expect(countdownSnapshot(null, 5_000)).toEqual({ leftMs: 0, seconds: 0, ratio: 0, expired: true })
    expect(countdownSnapshot(undefined, 5_000).expired).toBe(true)
  })
})

describe('nextSecondTickMs', () => {
  it('vise l’instant exact où la seconde affichée change', () => {
    // Il reste 4 678 ms : « 5 » devient « 4 » dans 678 ms.
    expect(nextSecondTickMs(10_000, 5_322)).toBe(678)
    expect(countdownSnapshot(10_000, 5_322).seconds).toBe(5)
    expect(countdownSnapshot(10_000, 5_322 + 678).seconds).toBe(4)
  })

  it('attend une seconde pleine quand on est pile sur la frontière', () => {
    expect(nextSecondTickMs(10_000, 7_000)).toBe(1000)
    expect(nextSecondTickMs(10_000, 10_000)).toBe(1000)
  })

  it('ne dépend pas de la frontière de l’horloge murale', () => {
    // Même reste, décalage différent par rapport aux secondes « rondes ».
    expect(nextSecondTickMs(10_500, 5_822)).toBe(678)
    expect(nextSecondTickMs(10_123, 9_000)).toBe(123)
  })

  it('garde un plancher pour ne pas tourner en boucle serrée', () => {
    expect(nextSecondTickMs(10_000, 9_999)).toBe(COUNTDOWN_MIN_TICK_MS)
    expect(nextSecondTickMs(10_000, 12_995)).toBe(COUNTDOWN_MIN_TICK_MS)
  })
})
