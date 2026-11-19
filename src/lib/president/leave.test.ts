import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { createPreState, reducePre, PRE_INTERLUDE_MS, type PrePlayer, type PreState } from './engine'

const NOW = 1_000_000
const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}`, name: `Joueur ${i + 1}` }))

// Cartes : rang r, couleur s → r*4+s.
const c = (rank: number, suit = 0) => rank * 4 + suit
const roleOf = (s: PreState, id: string): PrePlayer['role'] | undefined => s.players.find((p) => p.id === id)?.role
const handOf = (s: PreState, id: string) => s.players.find((p) => p.id === id)?.hand ?? []

/** p5 part pendant le compte à rebours : la manche est donnée aux quatre autres. */
function dealtWithoutP5(manches: number): PreState {
  let s = createPreState(PLAYERS, 'seed-leave', NOW, manches)
  s = reducePre(s, { type: 'LEAVE', playerId: 'p5', at: NOW + 1_000 })
  s = reducePre(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: NOW + 5_000 })
  expect(s.phase).toBe('playing')
  expect(handOf(s, 'p5')).toEqual([])
  return s
}

/** Mains choisies pour finir la manche en trois poses : p1, p2, p3 sortent, p4 reste. */
function shortManche(s: PreState): PreState {
  const hands: Record<string, number[]> = { p1: [c(9)], p2: [c(3)], p3: [c(5)], p4: [c(7), c(8)] }
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: hands[p.id] ?? p.hand })),
    currentTurnId: 'p1',
    lastPlay: null,
    trickRun: null,
    passedIds: [],
    outOrder: [],
  }
}

function playOut(s: PreState): PreState {
  let next = reducePre(s, { type: 'PLAY', playerId: 'p1', cards: [c(9)], now: NOW + 10_000 })
  next = reducePre(next, { type: 'PLAY', playerId: 'p2', cards: [c(3)], now: NOW + 11_000 })
  return reducePre(next, { type: 'PLAY', playerId: 'p3', cards: [c(5)], now: NOW + 12_000 })
}

describe('Président — absent à la donne, de retour pendant la manche', () => {
  it('revenu sans cartes : il n’est pas classé, le vrai dernier est Trou', () => {
    let s = shortManche(dealtWithoutP5(2))
    s = reducePre(s, { type: 'REJOIN', playerId: 'p5' })

    s = playOut(s)

    // Sans cela : classé dernier sans avoir joué une carte, donc Trou.
    expect(s.phase).toBe('interlude')
    expect(s.lastRanking).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(roleOf(s, 'p4')).toBe('trou')
    expect(roleOf(s, 'p5')).toBeNull()
  })

  it('remplacé par un bot pendant la manche : même règle', () => {
    let s = shortManche(dealtWithoutP5(2))
    s = reducePre(s, { type: 'REPLACE_LEFT', now: NOW + 200_000, graceMs: 180_000 })
    expect(s.players.find((p) => p.id === 'p5')?.isBot).toBe(true)

    s = playOut(s)

    expect(s.lastRanking).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(roleOf(s, 'p4')).toBe('trou')
    expect(roleOf(s, 'p5')).toBeNull()
  })

  it('toujours absent à la fin de la manche : pas classé non plus', () => {
    const s = playOut(shortManche(dealtWithoutP5(2)))

    expect(s.lastRanking).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(roleOf(s, 'p5')).toBeNull()
  })

  it('servi à la donne suivante, sans rôle : l’échange reste entre le Président et le vrai Trou', () => {
    let s = shortManche(dealtWithoutP5(2))
    s = reducePre(s, { type: 'REJOIN', playerId: 'p5' })
    s = playOut(s)

    s = reducePre(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: NOW + 12_000 + PRE_INTERLUDE_MS })

    expect(s.phase).toBe('playing')
    expect(handOf(s, 'p5').length).toBeGreaterThan(0)
    expect(s.lastExchange).toMatchObject({ presidentId: 'p1', trouId: 'p4' })
    // Le Trou de la manche close mène la suivante.
    expect(s.currentTurnId).toBe('p4')
  })

  it('dernière manche : le classement final ne compte que ceux qui ont joué', () => {
    let s = shortManche(dealtWithoutP5(1))
    s = reducePre(s, { type: 'REJOIN', playerId: 'p5' })

    s = playOut(s)

    expect(s.phase).toBe('finished')
    expect(s.lastRanking).toEqual(['p1', 'p2', 'p3', 'p4'])
  })
})

describe('Président — déserteur en cours de manche', () => {
  it('parti avec des cartes en main : il ferme toujours le classement', () => {
    let s = createPreState(PLAYERS.slice(0, 4), 'seed-leave', NOW, 2)
    s = reducePre(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: NOW + 5_000 })
    const hands: Record<string, number[]> = { p1: [c(9)], p2: [c(3)], p3: [c(5), c(6)], p4: [c(7)] }
    s = {
      ...s,
      players: s.players.map((p) => ({ ...p, hand: hands[p.id] })),
      currentTurnId: 'p1',
      lastPlay: null,
      trickRun: null,
      passedIds: [],
      outOrder: [],
    }
    s = reducePre(s, { type: 'LEAVE', playerId: 'p4', at: NOW + 6_000 })

    s = reducePre(s, { type: 'PLAY', playerId: 'p1', cards: [c(9)], now: NOW + 10_000 })
    s = reducePre(s, { type: 'PLAY', playerId: 'p2', cards: [c(3)], now: NOW + 11_000 })

    expect(s.phase).toBe('interlude')
    expect(s.lastRanking).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(roleOf(s, 'p4')).toBe('trou')
  })
})
