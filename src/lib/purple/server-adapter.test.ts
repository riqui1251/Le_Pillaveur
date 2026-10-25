import { describe, expect, it } from 'vitest'
import { applyPurpleRoomAction, parsePurpleState, serializePurpleState } from './server-adapter'
import { createPurpleState, type PurpleState } from './engine'
import { getGameAdapter } from '@/lib/online/game-adapters'

const PLAYERS = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'bot-1', name: 'Gépéto', isBot: true },
]

function turnOf(index: number): PurpleState {
  return { ...createPurpleState(PLAYERS, 'seed-purple'), currentPlayer: index }
}

describe('tick bot du Purple', () => {
  it('au tour d’un humain : refusé (NOT_BOT_TURN), rien à écrire', () => {
    const state = turnOf(0)
    expect(applyPurpleRoomAction(state, 'p2', { type: 'bot' })).toEqual({
      ok: false,
      error: 'NOT_BOT_TURN',
    })
    const viaRegistry = getGameAdapter('purple')!.applyAction(state, 'p2', { action: 'bot' })
    expect(viaRegistry.ok).toBe(false)
    expect(!viaRegistry.ok && viaRegistry.status).toBe(403)
  })

  it('au tour d’un bot : il parie', () => {
    const result = applyPurpleRoomAction(turnOf(2), 'p1', { type: 'bot' })
    if (!result.ok) throw new Error(result.error)
    expect(result.state.lastBet).not.toBeNull()
    expect(result.state.betsCount).toBe(1)
  })
})

describe('parsePurpleState', () => {
  it('une partie lancée avant le compteur de paris retombe sur le nombre de cartes tirées', () => {
    const { betsCount: _betsCount, ...legacy } = { ...turnOf(0), totalCardsDrawn: 14 }
    void _betsCount
    expect(parsePurpleState(JSON.stringify(legacy))?.betsCount).toBe(14)
    const current = { ...turnOf(0), betsCount: 3, totalCardsDrawn: 7 }
    expect(parsePurpleState(serializePurpleState(current))?.betsCount).toBe(3)
  })
})
