import { describe, expect, it } from 'vitest'
import { COUPE_END_READ_MS, COUPE_TAP_LOCK_MS, coupeGestureAt, coupeTapAllowed } from './tap-guard'

/**
 * La barre telle que la mène l'écran : chaque action acceptée pose le verrou,
 * quelle qu'elle soit (tirage, binôme, règle, « Passer »), et la création de
 * la partie le pose aussi.
 */
function bar(createdAt: number) {
  let lastAt = createdAt
  return (timeStamp: number, now = timeStamp): boolean => {
    const at = coupeGestureAt(timeStamp, now)
    if (!coupeTapAllowed(at, lastAt)) return false
    lastAt = at
    return true
  }
}

describe('verrou de la barre du bas', () => {
  it('le second toucher d’un double toucher ne déclenche rien, un toucher posé passe', () => {
    expect(coupeTapAllowed(10_150, 10_000)).toBe(false)
    expect(coupeTapAllowed(10_000 + COUPE_TAP_LOCK_MS - 1, 10_000)).toBe(false)
    expect(coupeTapAllowed(10_000 + COUPE_TAP_LOCK_MS, 10_000)).toBe(true)
    expect(coupeTapAllowed(5, Number.NEGATIVE_INFINITY)).toBe(true)
  })

  it('« Binôme : Chloé » puis « Tirer une carte » sous le même doigt : la carte du joueur suivant reste au paquet', () => {
    const tap = bar(0)
    expect(tap(4_000)).toBe(true) // Alice tire un 8
    expect(tap(9_000)).toBe(true) // … choisit Chloé et valide
    expect(tap(9_150)).toBe(false) // le second toucher tombe sur « Tirer une carte »
    expect(tap(9_000 + COUPE_TAP_LOCK_MS)).toBe(true) // Bob tire, posément
  })

  it('un tirage qui sort un Valet ne laisse pas le second toucher jeter sa règle (« Passer »)', () => {
    const tap = bar(0)
    expect(tap(3_000)).toBe(true)
    expect(tap(3_140)).toBe(false)
  })

  it('« Commencer la partie » ne tire pas la première carte : la création pose le verrou', () => {
    const tap = bar(20_000)
    expect(tap(20_120)).toBe(false)
    expect(tap(20_000 + COUPE_TAP_LOCK_MS)).toBe(true)
  })

  it('un toucher refusé ne prolonge pas le verrou', () => {
    const tap = bar(0)
    expect(tap(1_000)).toBe(true)
    expect(tap(1_600)).toBe(false)
    expect(tap(1_000 + COUPE_TAP_LOCK_MS)).toBe(true)
  })

  it('l’écran de fin se lit plus longtemps qu’un simple double toucher', () => {
    expect(COUPE_END_READ_MS).toBeGreaterThan(COUPE_TAP_LOCK_MS)
  })
})

describe('horloge des gestes', () => {
  it('garde l’instant du toucher quand il est sur l’horloge de la page', () => {
    expect(coupeGestureAt(1_234.5, 1_300)).toBe(1_234.5)
    expect(coupeGestureAt(1_300, 1_300)).toBe(1_300)
  })

  it('heure murale (vieux moteurs), zéro ou rien : l’horloge de la page fait foi', () => {
    expect(coupeGestureAt(1_700_000_000_000, 5_000)).toBe(5_000)
    expect(coupeGestureAt(0, 5_000)).toBe(5_000)
    expect(coupeGestureAt(Number.NaN, 5_000)).toBe(5_000)
    expect(coupeGestureAt(undefined, 5_000)).toBe(5_000)
  })

  it('un geste en heure murale après un geste sur l’horloge de la page n’enjambe pas le verrou', () => {
    const tap = bar(0)
    expect(tap(8_000)).toBe(true)
    expect(tap(1_700_000_000_000, 8_100)).toBe(false)
  })
})
