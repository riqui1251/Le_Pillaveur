import { describe, it, expect } from 'vitest'
import { createRng } from './rng'
import {
  CASE_TYPE_BASE_WEIGHTS,
  generateCase,
  getCaseTypePool,
  pickCaseType,
  type CaseGenContext,
} from './case-generator'
import type { CaseType, Difficulty } from './types'

const DEFI_DRINKS = [1, 2, 1, 3, 2, 1, 2] // jeu de données de test (drinks par défi)

const ctx = (over: Partial<CaseGenContext> = {}): CaseGenContext => ({
  difficulty: 'normal',
  defiDrinks: DEFI_DRINKS,
  ...over,
})

describe('case-generator déterministe', () => {
  it('même graine ⇒ même suite de cases', () => {
    const a = createRng('seed-cases')
    const b = createRng('seed-cases')
    const seqA = Array.from({ length: 30 }, () => generateCase(a, ctx()))
    const seqB = Array.from({ length: 30 }, () => generateCase(b, ctx()))
    expect(seqA).toEqual(seqB)
  })

  it('produit toujours un type de case valide', () => {
    const rng = createRng('valid')
    const valid = new Set<CaseType>([
      'normal', 'defi', 'gorgée', 'recul', 'avance', 'tous', 'roue', 'echange',
      'bombe', 'protection', 'malediction', 'chance', 'repetition', 'miroir',
      'defi-chaine', 'piege', 'melange', 'passe-tour', 'double-peine', 'solo',
      'copie', 'roulette-russe', 'teleport', 'grappin', 'ancre', 'case-bonus',
      'recul-groupe', 'pont', 'question', 'vote', 'miroir-inverse', 'rewind',
      'loterie', 'inversion', 'double-case', 'roue-defis', 'de-honte', 'pile-face',
    ])
    for (let i = 0; i < 500; i += 1) {
      expect(valid.has(generateCase(rng, ctx()).type)).toBe(true)
    }
  })

  it('defi : defiIndex dans les bornes et effet plafonné à 4', () => {
    const rng = createRng('defi')
    let seen = 0
    for (let i = 0; i < 2000 && seen < 20; i += 1) {
      const c = generateCase(rng, ctx({ difficulty: 'extreme' }))
      if (c.type === 'defi') {
        seen += 1
        expect(c.defiIndex).toBeGreaterThanOrEqual(0)
        expect(c.defiIndex!).toBeLessThan(DEFI_DRINKS.length)
        expect(c.effect).toBeLessThanOrEqual(4)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it("la roue des défis n'est jamais tirée en ligne (sans défis réalisables à distance)", () => {
    const rng = createRng('no-roue-defis')
    for (let i = 0; i < 3000; i += 1) {
      expect(generateCase(rng, ctx()).type).not.toBe('roue-defis')
    }
  })

  it('defi : defiAllowed restreint le tirage aux indices autorisés', () => {
    const allowed = [1, 3, 5] // ex. en ligne : défis vérifiables uniquement
    const rng = createRng('defi-allowed')
    let seen = 0
    for (let i = 0; i < 2000 && seen < 30; i += 1) {
      const c = generateCase(rng, ctx({ defiAllowed: allowed }))
      if (c.type === 'defi') {
        seen += 1
        expect(allowed).toContain(c.defiIndex)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('defi : defiAllowed vide ou absent ⇒ tous les défis restent tirables', () => {
    const a = createRng('defi-fallback')
    const b = createRng('defi-fallback')
    const seqA = Array.from({ length: 50 }, () => generateCase(a, ctx({ defiAllowed: [] })))
    const seqB = Array.from({ length: 50 }, () => generateCase(b, ctx()))
    expect(seqA).toEqual(seqB)
  })

  it('gorgée culSec uniquement en difficulté extrême', () => {
    const rngNormal = createRng('g1')
    for (let i = 0; i < 2000; i += 1) {
      const c = generateCase(rngNormal, ctx({ difficulty: 'normal' }))
      if (c.type === 'gorgée') expect(c.gorgeeCulSec).toBeFalsy()
    }
  })

  it('boost 100% ⇒ première case = avance (1..3)', () => {
    const rng = createRng('boost')
    const c = generateCase(rng, ctx({ boostPercent: 100 }))
    expect(c.type).toBe('avance')
    expect(c.effect).toBeGreaterThanOrEqual(1)
    expect(c.effect).toBeLessThanOrEqual(3)
  })

  it('boost 0% ne consomme pas de tirage (séquence identique sans boost)', () => {
    const withZero = createRng('x')
    const without = createRng('x')
    const a = generateCase(withZero, ctx({ boostPercent: 0 }))
    const b = generateCase(without, ctx())
    expect(a).toEqual(b)
  })

  it('pickCaseType renvoie un type du pool', () => {
    const rng = createRng('pick')
    const c = pickCaseType(rng)
    expect(typeof c).toBe('string')
  })
})

describe('difficulté et fréquence des cases (en ligne)', () => {
  const DRINK = new Set<CaseType>([
    'gorgée', 'tous', 'solo', 'double-peine', 'bombe', 'roulette-russe', 'malediction', 'vote', 'inversion',
  ])
  const CHALLENGE = new Set<CaseType>(['defi', 'question', 'defi-chaine'])

  const shares = (difficulty: Difficulty) => {
    const rng = createRng(`freq-${difficulty}`)
    const draws = 20_000
    let drink = 0
    let challenge = 0
    let defi = 0
    let normal = 0
    for (let i = 0; i < draws; i += 1) {
      const { type } = generateCase(rng, ctx({ difficulty }))
      if (DRINK.has(type)) drink += 1
      if (CHALLENGE.has(type)) challenge += 1
      if (type === 'defi') defi += 1
      if (type === 'normal') normal += 1
    }
    return { drink: drink / draws, challenge: challenge / draws, defi: defi / draws, normal: normal / draws }
  }

  const facile = shares('facile')
  const normal = shares('normal')
  const difficile = shares('difficile')
  const extreme = shares('extreme')

  it('facile : moins de cases à gorgées, plus de cases normales', () => {
    expect(facile.drink).toBeLessThan(normal.drink * 0.75)
    expect(facile.normal).toBeGreaterThan(normal.normal * 1.3)
  })

  it('difficile : plus de défis et de gorgées qu’en normal', () => {
    expect(difficile.defi).toBeGreaterThan(normal.defi * 1.3)
    expect(difficile.challenge).toBeGreaterThan(normal.challenge * 1.3)
    expect(difficile.drink).toBeGreaterThan(normal.drink * 1.1)
  })

  it('extrême : encore plus punitif que difficile', () => {
    expect(extreme.drink).toBeGreaterThan(difficile.drink)
    expect(extreme.normal).toBeLessThan(difficile.normal)
  })

  it('normal garde les poids historiques (tirage inchangé graine pour graine)', () => {
    expect(getCaseTypePool('normal')).toEqual(CASE_TYPE_BASE_WEIGHTS)
    const pool = getCaseTypePool('difficile')
    expect(pool.map((e) => e.type)).toEqual(CASE_TYPE_BASE_WEIGHTS.map((e) => e.type))
  })

  it('excludeTypes : types jamais tirés, ordre RNG inchangé sans exclusion', () => {
    const rng = createRng('exclude')
    const excludeTypes: CaseType[] = ['gorgée', 'defi', 'normal', 'avance']
    for (let i = 0; i < 3000; i += 1) {
      const c = generateCase(rng, ctx({ difficulty: 'extreme', excludeTypes, boostPercent: 100 }))
      expect(excludeTypes).not.toContain(c.type)
    }
    const a = createRng('same')
    const b = createRng('same')
    expect(generateCase(a, ctx({ excludeTypes: [] }))).toEqual(generateCase(b, ctx()))
  })
})
