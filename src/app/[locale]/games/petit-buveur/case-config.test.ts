import { describe, expect, it, vi } from 'vitest'
import { generateCase, pickCaseType, type CaseType, type Difficulty } from './case-config'

const DRINK_TYPES = new Set<CaseType>([
  'gorgée', 'tous', 'solo', 'double-peine', 'bombe', 'roulette-russe', 'malediction', 'vote', 'inversion',
])
const CHALLENGE_TYPES = new Set<CaseType>(['defi', 'question', 'defi-chaine', 'roue-defis'])

function shares(difficulty: Difficulty, draws = 20_000) {
  let drink = 0
  let challenge = 0
  let defi = 0
  let normal = 0
  for (let i = 0; i < draws; i += 1) {
    const type = pickCaseType(difficulty)
    if (DRINK_TYPES.has(type)) drink += 1
    if (CHALLENGE_TYPES.has(type)) challenge += 1
    if (type === 'defi') defi += 1
    if (type === 'normal') normal += 1
  }
  return { drink: drink / draws, challenge: challenge / draws, defi: defi / draws, normal: normal / draws }
}

const t = ((key: string) => key) as unknown as {
  (key: string, values?: Record<string, string | number>): string
  raw: (key: string) => unknown
}
t.raw = (key: string) => {
  if (key === 'defis') {
    return [
      { text: 'Defi A', drinks: 2 },
      { text: 'Defi B', drinks: 3 },
    ]
  }
  if (key === 'defiWheelChallenges') return ['Challenge 1']
  return []
}

describe('generateCase', () => {
  it('genere des gorgées conformes en normal', () => {
    const rnd = vi.spyOn(Math, 'random')
    rnd.mockReturnValueOnce(0.0) // pick gorgée (first weighted)
    rnd.mockReturnValueOnce(0.0) // base 1
    const result = generateCase('normal', t)
    expect(result.type).toBe('gorgée')
    expect(result.effect).toBeGreaterThanOrEqual(1)
    expect(result.effect).toBeLessThanOrEqual(6)
    rnd.mockRestore()
  })

  it('borne correctement reculs/avances', () => {
    const rnd = vi.spyOn(Math, 'random')
    rnd.mockReturnValueOnce(0.99) // pas boost
    rnd.mockReturnValueOnce(0.47) // tombe dans un type pondéré valide
    const result = generateCase('facile', t)
    expect(typeof result.effect).toBe('number')
    rnd.mockRestore()
  })
})

describe('difficulté et fréquence des cases', () => {
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

  it('la roue des défis reste tirable en local', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => pickCaseType('normal')))
    expect(seen.has('roue-defis')).toBe(true)
  })

  it('les types exclus ne sont jamais tirés', () => {
    const exclude = ['gorgée', 'defi', 'normal'] as const
    for (let i = 0; i < 3000; i += 1) {
      expect(exclude).not.toContain(generateCase('extreme', t, exclude).type)
    }
  })
})
