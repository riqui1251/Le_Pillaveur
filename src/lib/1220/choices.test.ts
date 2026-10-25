import { describe, expect, it } from 'vitest'
import {
  defaultChoices1220,
  parseChoices1220,
  parseChoicesPatch1220,
  playableChoices1220,
  sanitizeChoices1220,
} from './choices'

const VALID = { parity: 'impair', band: '21-30', drinkNumber: 2, giveNumber: 32 } as const

describe('parseChoicesPatch1220 (pari reçu d’un client)', () => {
  it('accepte chaque champ valide, seul ou ensemble, et n’en copie pas d’autre', () => {
    expect(parseChoicesPatch1220({ drinkNumber: 4 })).toEqual({ drinkNumber: 4 })
    expect(parseChoicesPatch1220({})).toEqual({})
    const patch = parseChoicesPatch1220(VALID)
    expect(patch).toEqual(VALID)
    expect(patch).not.toBe(VALID)
  })

  it('refuse un objet, une chaîne, un nombre hors bornes ou à virgule', () => {
    for (const drinkNumber of [{ boom: 1 }, '7', 99, 1, 33, 7.5, Number.NaN, null]) {
      expect(parseChoicesPatch1220({ drinkNumber }), String(drinkNumber)).toBeNull()
      expect(parseChoicesPatch1220({ giveNumber: drinkNumber }), String(drinkNumber)).toBeNull()
    }
  })

  it('refuse une parité ou une plage inconnue', () => {
    expect(parseChoicesPatch1220({ parity: 'les deux' })).toBeNull()
    expect(parseChoicesPatch1220({ band: '31-32' })).toBeNull()
    expect(parseChoicesPatch1220({ band: ['2-10'] })).toBeNull()
  })

  it('refuse toute clé inconnue (l’état ne gonfle plus)', () => {
    expect(parseChoicesPatch1220({ k1: 'x'.repeat(7000) })).toBeNull()
    expect(parseChoicesPatch1220({ drinkNumber: 4, __proto__x: 1 })).toBeNull()
  })

  it('refuse ce qui n’est pas un objet', () => {
    for (const raw of [null, undefined, 'pair', 7, [7, 13]]) expect(parseChoicesPatch1220(raw)).toBeNull()
  })
})

describe('parseChoices1220 (paris complets)', () => {
  it('exige les quatre champs', () => {
    expect(parseChoices1220(VALID)).toEqual(VALID)
    expect(parseChoices1220({ parity: 'pair', band: '2-10', drinkNumber: 5 })).toBeNull()
  })
})

describe('sanitizeChoices1220 (état stocké, vue reçue)', () => {
  it('garde un pari valide tel quel', () => {
    expect(sanitizeChoices1220(VALID)).toEqual(VALID)
  })

  it('remplace chaque champ invalide par sa valeur par défaut et écarte le reste', () => {
    const out = sanitizeChoices1220({ ...VALID, drinkNumber: { boom: 1 }, giveNumber: '13', extra: 'x' })
    expect(out).toEqual({ ...VALID, drinkNumber: defaultChoices1220().drinkNumber, giveNumber: defaultChoices1220().giveNumber })
    expect(Object.keys(out).sort()).toEqual(['band', 'drinkNumber', 'giveNumber', 'parity'])
    expect(sanitizeChoices1220(undefined)).toEqual(defaultChoices1220())
    expect(sanitizeChoices1220('pas un objet')).toEqual(defaultChoices1220())
  })
})

describe('playableChoices1220 (verrouillage)', () => {
  it('retombe entièrement sur les choix par défaut en cas de conflit boire/donner', () => {
    expect(playableChoices1220({ ...VALID, drinkNumber: 9, giveNumber: 9 })).toEqual(defaultChoices1220())
    expect(playableChoices1220({ ...VALID, giveNumber: { boom: 1 }, drinkNumber: 13 })).toEqual(defaultChoices1220())
    expect(playableChoices1220(VALID)).toEqual(VALID)
  })
})
