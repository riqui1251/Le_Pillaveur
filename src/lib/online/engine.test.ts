import { describe, expect, it } from 'vitest'
import {
  applyRoll,
  createInitialGameState,
  replaceDisconnectedByBot,
  resolveChallenge,
} from '@/lib/online/engine'

function seedState() {
  return createInitialGameState([
    { id: 'p1', name: 'A', isBot: false, connected: true, position: 0, drinks: 0 },
    { id: 'p2', name: 'B', isBot: false, connected: true, position: 0, drinks: 0 },
  ])
}

describe('online engine', () => {
  it('enforce le tour de jeu', () => {
    const state = seedState()
    expect(() => applyRoll(state, 'p2', 10_000, 4)).toThrowError('NOT_YOUR_TURN')
  })

  it('bloque le spam de des', () => {
    const state = seedState()
    const first = applyRoll(state, 'p1', 10_000, 4)
    expect(() => applyRoll(first, 'p2', 10_500, 3)).toThrowError('SPAM_ROLL')
  })

  it('impose la resolution du defi avant prochain tour', () => {
    const state = seedState()
    const withChallenge = applyRoll(state, 'p1', 10_000, 2, 'Defi test')
    expect(() => applyRoll(withChallenge, 'p1', 12_000, 3)).toThrowError('CHALLENGE_PENDING')
    const resolved = resolveChallenge(withChallenge, 'p1', false)
    expect(resolved.pendingChallenge).toBeNull()
    expect(resolved.currentPlayerId).toBe('p2')
  })

  it('remplace correctement un joueur deconnecte par bot', () => {
    const state = seedState()
    const next = replaceDisconnectedByBot(state, 'p2')
    expect(next.players[1].isBot).toBe(true)
    expect(next.players[1].connected).toBe(true)
    expect(next.players[1].name).toContain('(BOT)')
  })
})
