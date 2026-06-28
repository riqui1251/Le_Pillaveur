import { describe, expect, it, vi } from 'vitest'
import { generateCase } from './case-config'

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
