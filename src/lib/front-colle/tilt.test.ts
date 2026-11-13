import { describe, expect, it } from 'vitest'
import {
  TAP_MAX_MS,
  TILT_DEBOUNCE_MS,
  TILT_TRACKER_START,
  acceptGesture,
  classifyTilt,
  isTap,
  restSide,
  stepTilt,
  type TiltGesture,
  type TiltTracker,
} from './tilt'

/** Téléphone en paysage sur le front : |gamma| ≈ 90 au repos, beta ≈ 0 (vers le plafond) ou ≈ ±180 (vers le sol). */
describe('classifyTilt — règle de la fiche (téléphone droit, beta ≈ 0 ou ±180)', () => {
  it('au repos, armé : rien ne se passe', () => {
    expect(classifyTilt(0, -88, true)).toEqual({ gesture: null, armed: true })
    expect(classifyTilt(180, 88, true)).toEqual({ gesture: null, armed: true })
  })

  it('écran vers le sol (|beta| > 90) au-delà de 35° : trouvé, puis désarmé', () => {
    expect(classifyTilt(-178, 50, true)).toEqual({ gesture: 'found', armed: false })
    expect(classifyTilt(175, -40, true)).toEqual({ gesture: 'found', armed: false })
  })

  it('écran vers le plafond (|beta| < 90) au-delà de 35° : passé, puis désarmé', () => {
    expect(classifyTilt(2, -50, true)).toEqual({ gesture: 'passed', armed: false })
    expect(classifyTilt(-3, 30, true)).toEqual({ gesture: 'passed', armed: false })
  })

  it('le seuil de lecture est |gamma| < 55', () => {
    expect(classifyTilt(0, -56, true).gesture).toBeNull()
    expect(classifyTilt(0, -54, true).gesture).toBe('passed')
    expect(classifyTilt(180, 56, true).gesture).toBeNull()
    expect(classifyTilt(180, 54, true).gesture).toBe('found')
  })

  it('désarmé : il faut revenir au-delà de |gamma| = 75 pour réarmer', () => {
    expect(classifyTilt(0, -60, false)).toEqual({ gesture: null, armed: false })
    expect(classifyTilt(0, -74, false)).toEqual({ gesture: null, armed: false })
    expect(classifyTilt(0, -76, false)).toEqual({ gesture: null, armed: true })
    expect(classifyTilt(180, 80, false)).toEqual({ gesture: null, armed: true })
  })

  it('désarmé, même franchement penché : aucun geste', () => {
    expect(classifyTilt(180, 10, false).gesture).toBeNull()
    expect(classifyTilt(0, 10, false).gesture).toBeNull()
  })

  it('lecture absente ou invalide : rien ne change', () => {
    expect(classifyTilt(Number.NaN, -50, true)).toEqual({ gesture: null, armed: true })
    expect(classifyTilt(0, Number.POSITIVE_INFINITY, false)).toEqual({ gesture: null, armed: false })
  })
})

describe('classifyTilt — robustesse', () => {
  it('tête penchée sur le côté (beta ≈ ±30 au repos) : toujours armé, gestes justes', () => {
    // Paysage, roulis de 30° : beta = 30, gamma = −90 au repos.
    expect(classifyTilt(30, -89, false).armed).toBe(true)
    // Penché vers le plafond de 40° : beta reste proche de 0-30, |gamma| baisse.
    expect(classifyTilt(25, -45, true).gesture).toBe('passed')
    expect(classifyTilt(150, 45, true).gesture).toBe('found')
  })

  it('téléphone tenu en portrait, debout (beta ≈ 90, gamma instable) : armé, rien de lu', () => {
    expect(classifyTilt(89, 80, true)).toEqual({ gesture: null, armed: true })
    expect(classifyTilt(91, -10, false).armed).toBe(true)
  })

  it('téléphone posé à plat sur la table : jamais armé', () => {
    expect(classifyTilt(0, 0, false).armed).toBe(false)
    expect(classifyTilt(180, 0, false).armed).toBe(false)
  })
})

describe('restSide — quel bord est en haut', () => {
  it('paysage debout : signe du bord droit', () => {
    expect(restSide(0, -89)).toBe(1)
    expect(restSide(180, 89)).toBe(1)
    expect(restSide(0, 89)).toBe(-1)
    expect(restSide(-180, -89)).toBe(-1)
  })

  it('penché, à plat ou en portrait : pas de lecture', () => {
    expect(restSide(0, -40)).toBeNull()
    expect(restSide(0, 0)).toBeNull()
    expect(restSide(90, 0)).toBeNull()
    expect(restSide(Number.NaN, 0)).toBeNull()
  })
})

describe('anti-rebond et suivi', () => {
  it('deux gestes à moins de 600 ms : le second est ignoré', () => {
    expect(acceptGesture(null, 0)).toBe(true)
    expect(acceptGesture(1_000, 1_000 + TILT_DEBOUNCE_MS - 1)).toBe(false)
    expect(acceptGesture(1_000, 1_000 + TILT_DEBOUNCE_MS)).toBe(true)
  })

  /** Joue une suite de lectures (beta, gamma, instant) et rend les gestes lus. */
  function run(readings: [number, number, number][], start: TiltTracker = TILT_TRACKER_START): TiltGesture[] {
    let tracker = start
    const gestures: TiltGesture[] = []
    for (const [beta, gamma, at] of readings) {
      const step = stepTilt(tracker, { beta, gamma, at })
      tracker = step.tracker
      if (step.gesture) gestures.push(step.gesture)
    }
    return gestures
  }

  it('départ désarmé : un téléphone déjà penché ne compte rien tant qu’il n’est pas passé par la verticale', () => {
    expect(run([[180, 30, 0], [180, 20, 100]])).toEqual([])
    expect(run([[0, -88, 0], [180, 30, 100]])).toEqual(['found'])
  })

  it('bas, retour vertical, haut : trouvé puis passé', () => {
    expect(run([[0, -88, 0], [180, 40, 200], [0, -85, 900], [0, -40, 1_600]])).toEqual(['found', 'passed'])
  })

  it('un front qui tremble au seuil ne compte qu’une fois', () => {
    expect(run([[0, -88, 0], [0, -54, 100], [0, -58, 200], [0, -53, 300], [0, -60, 400], [0, -50, 500]])).toEqual(['passed'])
  })

  it('geste trop rapide après le précédent : ignoré, mais il désarme quand même', () => {
    const gestures = run([[0, -88, 0], [180, 40, 100], [0, -88, 200], [0, -40, 300], [0, -45, 1_000]])
    expect(gestures).toEqual(['found'])
  })

  it('lecture sans angles : rien ne change', () => {
    const tracker: TiltTracker = { armed: true, lastGestureAt: 5 }
    expect(stepTilt(tracker, { beta: null, gamma: 10, at: 9 })).toEqual({ tracker, gesture: null })
  })
})

describe('toucher de secours', () => {
  it('bref et sans glissé : compte', () => {
    expect(isTap({ at: 0, x: 10, y: 10 }, { at: 120, x: 18, y: 14 })).toBe(true)
  })

  it('doigt qui tient le téléphone ou qui glisse : ne compte pas', () => {
    expect(isTap({ at: 0, x: 10, y: 10 }, { at: TAP_MAX_MS + 1, x: 10, y: 10 })).toBe(false)
    expect(isTap({ at: 0, x: 10, y: 10 }, { at: 100, x: 60, y: 10 })).toBe(false)
  })
})
