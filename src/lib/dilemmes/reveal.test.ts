import { describe, expect, it } from 'vitest'
import { dilMinorityChoice, dilWhoTally } from './reveal'

const players = [
  { id: 'me', leftAt: null },
  { id: 'lea', leftAt: null },
  { id: 'marc', leftAt: null },
  { id: 'zoe', leftAt: null },
]

describe('dilWhoTally', () => {
  it('compte le lecteur aussi et le met en tête quand il est le plus désigné', () => {
    const tally = dilWhoTally(players, [
      { voterId: 'lea', choice: 'me' },
      { voterId: 'marc', choice: 'me' },
      { voterId: 'zoe', choice: 'lea' },
      { voterId: 'me', choice: 'lea' },
    ])
    expect(tally.top).toBe(2)
    expect(tally.topIds).toEqual(['me', 'lea'])
    expect(tally.rows.map((r) => [r.id, r.votes])).toEqual([
      ['me', 2],
      ['lea', 2],
      ['marc', 0],
      ['zoe', 0],
    ])
    expect(tally.rows[0].voterIds).toEqual(['lea', 'marc'])
  })

  it('trie par voix décroissantes et garde l’ordre de la table à égalité', () => {
    const tally = dilWhoTally(players, [
      { voterId: 'me', choice: 'zoe' },
      { voterId: 'lea', choice: 'zoe' },
      { voterId: 'zoe', choice: 'marc' },
    ])
    expect(tally.rows.map((r) => r.id)).toEqual(['zoe', 'marc', 'me', 'lea'])
    expect(tally.topIds).toEqual(['zoe'])
  })

  it('personne en tête quand personne n’a voté', () => {
    const tally = dilWhoTally(players, [])
    expect(tally.top).toBe(0)
    expect(tally.topIds).toEqual([])
    expect(tally.rows).toHaveLength(4)
  })

  it('écarte un absent sans voix mais garde celui qui en a reçu', () => {
    const tally = dilWhoTally(
      [...players.slice(0, 2), { id: 'marc', leftAt: 123 }, { id: 'zoe', leftAt: 456 }],
      [{ voterId: 'me', choice: 'zoe' }]
    )
    expect(tally.rows.map((r) => r.id)).toEqual(['zoe', 'me', 'lea'])
  })
})

describe('dilMinorityChoice', () => {
  it('rend le camp le moins choisi', () => {
    expect(
      dilMinorityChoice([
        { voterId: 'a', choice: 'A' },
        { voterId: 'b', choice: 'B' },
        { voterId: 'c', choice: 'B' },
      ])
    ).toBe('A')
  })

  it('aucun camp en cas d’égalité, d’unanimité ou sans vote', () => {
    expect(dilMinorityChoice([{ voterId: 'a', choice: 'A' }, { voterId: 'b', choice: 'B' }])).toBeNull()
    expect(dilMinorityChoice([{ voterId: 'a', choice: 'B' }, { voterId: 'b', choice: 'B' }])).toBeNull()
    expect(dilMinorityChoice([])).toBeNull()
  })
})
