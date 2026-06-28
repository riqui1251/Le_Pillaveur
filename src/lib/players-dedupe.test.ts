import { describe, expect, it } from 'vitest'
import { dedupePlayersById, type Player } from './players'

function makePlayer(id: string, name: string, createdAt: number): Player {
  return {
    id,
    name,
    createdAt,
    stats: { gamesPlayed: 0, wins: 0, totalDrinks: 0 },
    preferences: { color: '#fff', icon: '🎮' },
  }
}

describe('dedupePlayersById', () => {
  it('fusionne les joueurs partageant le même id', () => {
    const dupId = 'player-aa517ce9-fea1-4d07-94e6-037d4bc13b1e'
    const merged = dedupePlayersById([
      makePlayer(dupId, 'Alice', 100),
      makePlayer(dupId, 'Alice', 200),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe(dupId)
  })

  it('conserve les ids distincts', () => {
    const merged = dedupePlayersById([
      makePlayer('player-a', 'A', 1),
      makePlayer('player-b', 'B', 2),
    ])
    expect(merged).toHaveLength(2)
  })
})
