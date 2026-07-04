import { describe, expect, it } from 'vitest'
import { checkAdvance, enterPhase, phaseKey, phaseTimeLeftMs } from './phase-clock'

describe('phase-clock', () => {
  const T0 = 1_000_000

  it('enterPhase pose une échéance et incrémente la séquence', () => {
    const p = enterPhase(4, 'vote', 60_000, T0)
    expect(p).toEqual({ phase: 'vote', phaseSeq: 5, phaseEndsAt: T0 + 60_000 })
  })

  it('enterPhase sans durée = pas de limite de temps', () => {
    const p = enterPhase(0, 'debate', null, T0)
    expect(p.phaseEndsAt).toBeNull()
  })

  it('deux visites de la même phase donnent deux clés différentes', () => {
    const a = enterPhase(0, 'vote', 1000, T0)
    const b = enterPhase(a.phaseSeq, 'vote', 1000, T0)
    expect(phaseKey(a)).not.toBe(phaseKey(b))
  })

  it('checkAdvance refuse avant l’échéance (horloge serveur seule autorité)', () => {
    const s = enterPhase(0, 'vote', 60_000, T0)
    const r = checkAdvance(s, phaseKey(s), T0 + 59_999)
    expect(r).toEqual({ ok: false, error: 'NOT_EXPIRED' })
  })

  it('checkAdvance accepte à l’échéance exacte et après', () => {
    const s = enterPhase(0, 'vote', 60_000, T0)
    expect(checkAdvance(s, phaseKey(s), T0 + 60_000)).toEqual({ ok: true })
    expect(checkAdvance(s, phaseKey(s), T0 + 90_000)).toEqual({ ok: true })
  })

  it('checkAdvance est idempotent : le second tick concurrent est un no-op', () => {
    const before = enterPhase(0, 'vote', 1000, T0)
    const clientKey = phaseKey(before)
    // Premier tick : la phase avance (nouvelle phase, nouvelle séquence).
    const after = enterPhase(before.phaseSeq, 'reveal', 5000, T0 + 1000)
    // Second tick basé sur l'ANCIENNE clé → rejeté.
    expect(checkAdvance(after, clientKey, T0 + 2000)).toEqual({
      ok: false,
      error: 'PHASE_CHANGED',
    })
  })

  it('checkAdvance refuse d’avancer une phase sans échéance', () => {
    const s = enterPhase(0, 'debate', null, T0)
    expect(checkAdvance(s, phaseKey(s), T0 + 1)).toEqual({ ok: false, error: 'NO_DEADLINE' })
  })

  it('phaseTimeLeftMs ne descend jamais sous zéro et gère l’absence de limite', () => {
    const s = enterPhase(0, 'vote', 1000, T0)
    expect(phaseTimeLeftMs(s, T0)).toBe(1000)
    expect(phaseTimeLeftMs(s, T0 + 5000)).toBe(0)
    const open = enterPhase(0, 'debate', null, T0)
    expect(phaseTimeLeftMs(open, T0)).toBe(Number.POSITIVE_INFINITY)
  })
})
