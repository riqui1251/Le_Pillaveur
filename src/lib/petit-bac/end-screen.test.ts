import { describe, expect, it } from 'vitest'
import { matchOutcomesFor } from '@/lib/online/match-results'
import { pbcEndStanding } from './end-screen'

const player = (id: string, total: number, leftAt: number | null = null) => ({ id, name: id, isBot: false, total, leftAt })

describe('pbcEndStanding', () => {
  it('un déserteur en tête : hors podium, celui qui a fini gagne', () => {
    const players = [player('parti', 40, 1_000), player('reste', 25), player('autre', 10)]

    const standing = pbcEndStanding(players, 'reste')

    expect(standing.podium.map((p) => p.id)).toEqual(['reste', 'autre'])
    expect(standing.best).toBe(25)
    expect(standing.won).toBe(true)
    expect(pbcEndStanding(players, 'parti').won).toBe(false)
  })

  it('même verdict que le classement serveur', () => {
    const players = [player('parti', 40, 1_000), player('reste', 25), player('autre', 25)]
    const server = matchOutcomesFor('petit-bac', { players })!

    for (const p of players) {
      expect({ id: p.id, won: pbcEndStanding(players, p.id).won }).toEqual({
        id: p.id,
        won: server.find((o) => o.playerId === p.id)!.won,
      })
    }
  })

  it('zéro point partout : personne ne gagne', () => {
    expect(pbcEndStanding([player('a', 0), player('b', 0)], 'a').won).toBe(false)
  })
})
