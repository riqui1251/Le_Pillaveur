import { describe, expect, it } from 'vitest'
import { compactStroke, roundCoord, roundPoint, simplifyStroke, SIMPLIFY_TOLERANCE } from './simplify'

/** Tableau plat [x0, y0, …] depuis une fonction i → (x, y). */
function flat(n: number, f: (i: number) => [number, number]): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i += 1) out.push(...f(i))
  return out
}

/** Sinusoïde à 3 périodes, amplitude 0,2 — un trait « vague » réaliste. */
function sinusoid(n: number): number[] {
  return flat(n, (i) => {
    const t = i / (n - 1)
    return [0.1 + 0.8 * t, 0.5 + 0.2 * Math.sin(2 * Math.PI * 3 * t)]
  })
}

/** Distance d'un point au segment [A, B] (même calcul que le module, en clair). */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.min(1, Math.max(0, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Écart maximal entre chaque point brut et la polyligne simplifiée. */
function maxDeviation(raw: number[], simplified: number[]): number {
  let worst = 0
  for (let i = 0; i < raw.length; i += 2) {
    let best = Infinity
    for (let j = 0; j + 3 < simplified.length; j += 2) {
      best = Math.min(
        best,
        distToSegment(raw[i], raw[i + 1], simplified[j], simplified[j + 1], simplified[j + 2], simplified[j + 3])
      )
    }
    worst = Math.max(worst, best)
  }
  return worst
}

describe('roundCoord / roundPoint', () => {
  it('arrondit à 3 décimales, dans les bornes, sans -0', () => {
    expect(roundCoord(0.123456)).toBe(0.123)
    expect(roundCoord(0.9995)).toBe(1)
    expect(roundCoord(0)).toBe(0)
    expect(roundCoord(1)).toBe(1)
    expect(Object.is(roundCoord(-0.0004), 0)).toBe(true)
    expect(roundPoint(0.33333, 0.66666)).toEqual([0.333, 0.667])
  })
})

describe('simplifyStroke', () => {
  it('trait droit de 500 points → 2 points', () => {
    const line = flat(500, (i) => [0.1 + (0.8 * i) / 499, 0.1 + (0.8 * i) / 499])
    expect(simplifyStroke(line)).toEqual([0.1, 0.1, 0.9, 0.9])
    // Tremblement du doigt sous la tolérance : toujours une droite.
    const shaky = flat(500, (i) => [0.1 + (0.8 * i) / 499, 0.5 + (i % 2 === 0 ? 0.001 : -0.001)])
    expect(simplifyStroke(shaky)).toHaveLength(4)
  })

  it('courbe de 300 points : forte réduction, écart borné, extrémités gardées', () => {
    const raw = sinusoid(300)
    const out = simplifyStroke(raw)
    const kept = out.length / 2
    expect(kept).toBeGreaterThanOrEqual(3)
    expect(kept).toBeLessThanOrEqual(300 * 0.25)
    expect(out.slice(0, 2)).toEqual(raw.slice(0, 2))
    expect(out.slice(-2)).toEqual(raw.slice(-2))
    expect(maxDeviation(raw, out)).toBeLessThanOrEqual(SIMPLIFY_TOLERANCE)
  })

  it('boucle fermée (premier = dernier) : découpée, pas écrasée en un point', () => {
    const circle = flat(201, (i) => {
      const a = (2 * Math.PI * i) / 200
      return [0.5 + 0.3 * Math.cos(a), 0.5 + 0.3 * Math.sin(a)]
    })
    const out = simplifyStroke(circle)
    expect(out.length / 2).toBeGreaterThanOrEqual(8)
    expect(maxDeviation(circle, out)).toBeLessThanOrEqual(SIMPLIFY_TOLERANCE)
  })

  it('aller-retour sur une même ligne : le point le plus loin est gardé', () => {
    const out = simplifyStroke([0.1, 0.5, 0.9, 0.5, 0.5, 0.5])
    expect(out).toEqual([0.1, 0.5, 0.9, 0.5, 0.5, 0.5])
  })

  it('≤ 2 points ou tolérance nulle : inchangé ; coordonnée orpheline ignorée', () => {
    expect(simplifyStroke([0, 0, 1, 1])).toEqual([0, 0, 1, 1])
    expect(simplifyStroke([0, 0, 0.5, 0.1, 1, 0], 0)).toEqual([0, 0, 0.5, 0.1, 1, 0])
    expect(simplifyStroke([0, 0, 0.5, 0.1, 1, 0, 7])).toEqual([0, 0, 0.5, 0.1, 1, 0])
  })

  it('une tolérance plus large garde moins de points', () => {
    const raw = sinusoid(300)
    expect(simplifyStroke(raw, 0.02).length).toBeLessThan(simplifyStroke(raw, 0.004).length)
  })
})

describe('compactStroke', () => {
  it('simplifie puis arrondit, garde au moins les deux extrémités', () => {
    const out = compactStroke(sinusoid(300))
    expect(out.length).toBeGreaterThanOrEqual(4)
    for (const v of out) {
      expect(v).toBe(roundCoord(v))
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(compactStroke([0.123456, 0.5, 0.123457, 0.5])).toEqual([0.123, 0.5, 0.123, 0.5])
  })

  it('un trait réaliste de 300 points pèse au moins 10 fois moins en JSON', () => {
    // Mesuré : 11 503 octets bruts (flottants à 17 caractères) → 402 octets
    // compactés (32 points gardés sur 300), soit 28 fois moins — la borne
    // à 10 garde de la marge si la tolérance ou la sinusoïde bougent.
    const raw = { points: sinusoid(300), color: '#020617', width: 6 }
    const compact = { ...raw, points: compactStroke(raw.points) }
    const before = JSON.stringify(raw).length
    const after = JSON.stringify(compact).length
    expect(before).toBeGreaterThan(9_000)
    expect(after).toBeLessThan(before / 10)
  })
})
