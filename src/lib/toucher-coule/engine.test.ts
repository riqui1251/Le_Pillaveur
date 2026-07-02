import { describe, expect, it } from 'vitest'
import {
  advanceTCBots,
  botChooseCell,
  createInitialTCState,
  currentTCPlayerId,
  reduceTC,
  toTCClientView,
  TC_MODES,
  type TCInitialPlayer,
  type TCState,
} from './engine'
import { rngFromState } from '@/lib/petit-buveur/rng'

function players1v1(): TCInitialPlayer[] {
  return [
    { id: 'alice', name: 'Alice', team: 'A', isBot: false },
    { id: 'bob', name: 'Bob', team: 'B', isBot: false },
  ]
}

/** Placement fixe valide pour le mode 1v1 (tailles 4,3,2 sur grille 8). */
function place1v1(state: TCState, playerId: string, offset = 0): TCState {
  const g = state.gridSize
  return reduceTC(state, {
    type: 'PLACE',
    playerId,
    ships: [
      [offset, offset + 1, offset + 2, offset + 3],
      [g * 2, g * 2 + 1, g * 2 + 2],
      [g * 4, g * 4 + 1],
    ],
  })
}

describe('toucher-coule — configuration des modes', () => {
  it('respecte les quotas de navires demandés (3/joueur en 1v1, 2/joueur en 2v2 et 3v3)', () => {
    expect(TC_MODES['1v1'].shipSizesPerPlayer).toHaveLength(3)
    expect(TC_MODES['2v2'].shipSizesPerPlayer).toHaveLength(2)
    expect(TC_MODES['3v3'].shipSizesPerPlayer).toHaveLength(2)
  })

  it('agrandit la grille avec le nombre de joueurs', () => {
    expect(TC_MODES['1v1'].gridSize).toBeLessThan(TC_MODES['2v2'].gridSize)
    expect(TC_MODES['2v2'].gridSize).toBeLessThan(TC_MODES['3v3'].gridSize)
  })
})

describe('toucher-coule — placement', () => {
  it('refuse des équipes déséquilibrées', () => {
    expect(() =>
      createInitialTCState(
        [
          { id: 'a', name: 'A', team: 'A', isBot: false },
          { id: 'b', name: 'B', team: 'A', isBot: false },
        ],
        '1v1',
        1
      )
    ).toThrow('INVALID_TEAMS')
  })

  it('refuse un navire en diagonale ou de mauvaise taille', () => {
    const state = createInitialTCState(players1v1(), '1v1', 42)
    expect(() =>
      reduceTC(state, {
        type: 'PLACE',
        playerId: 'alice',
        ships: [
          [0, 9, 18, 27],
          [16, 17, 18],
          [32, 33],
        ],
      })
    ).toThrow('INVALID_SHIP_SHAPE')
    expect(() =>
      reduceTC(state, { type: 'PLACE', playerId: 'alice', ships: [[0, 1], [16, 17], [32, 33]] })
    ).toThrow('INVALID_SHIP_SIZES')
  })

  it('refuse le chevauchement au sein de la même équipe', () => {
    const state = createInitialTCState(players1v1(), '1v1', 42)
    expect(() =>
      reduceTC(state, {
        type: 'PLACE',
        playerId: 'alice',
        ships: [
          [0, 1, 2, 3],
          [2, 10, 18],
          [32, 33],
        ],
      })
    ).toThrow('SHIPS_OVERLAP')
  })

  it('passe en phase bataille quand tous ont placé', () => {
    let state = createInitialTCState(players1v1(), '1v1', 42)
    state = place1v1(state, 'alice')
    expect(state.phase).toBe('placement')
    state = place1v1(state, 'bob')
    expect(state.phase).toBe('battle')
    expect(currentTCPlayerId(state)).toBe('alice')
  })
})

describe('toucher-coule — tirs et règles apéro', () => {
  function battleState(): TCState {
    let state = createInitialTCState(players1v1(), '1v1', 42)
    state = place1v1(state, 'alice')
    state = place1v1(state, 'bob')
    return state
  }

  it('raté : le tireur boit et la main passe', () => {
    let state = battleState()
    // Bob a ses navires sur les lignes 0/2/4 → la ligne 7 est vide.
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 7 * 8 })
    expect(state.lastShot?.result).toBe('miss')
    expect(state.players.find((p) => p.id === 'alice')?.drinks).toBe(1)
    expect(currentTCPlayerId(state)).toBe('bob')
  })

  it('touché : le propriétaire boit et le tireur rejoue', () => {
    let state = battleState()
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 0 })
    expect(state.lastShot?.result).toBe('hit')
    expect(state.players.find((p) => p.id === 'bob')?.drinks).toBe(1)
    expect(currentTCPlayerId(state)).toBe('alice')
  })

  it('refuse de tirer deux fois sur la même case ou hors tour', () => {
    let state = battleState()
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 0 })
    expect(() => reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 0 })).toThrow(
      'CELL_ALREADY_SHOT'
    )
    expect(() => reduceTC(state, { type: 'FIRE', playerId: 'bob', cell: 5 })).toThrow('NOT_YOUR_TURN')
  })

  it('coulé puis victoire quand toute la flotte ennemie est détruite', () => {
    let state = battleState()
    const bobCells = state.ships.filter((s) => s.team === 'B').flatMap((s) => s.cells)
    for (const cell of bobCells) {
      state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell })
    }
    expect(state.phase).toBe('finished')
    expect(state.winner).toBe('A')
    expect(state.lastShot?.winningShot).toBe(true)
    // Coulé = +2 pour le propriétaire, défaite = +3 ; 9 touches + 3×2 + 3 = 18.
    expect(state.players.find((p) => p.id === 'bob')?.drinks).toBe(18)
  })
})

describe('toucher-coule — bots', () => {
  it('advanceTCBots place les bots et joue leurs tours jusqu\'au joueur humain', () => {
    const players: TCInitialPlayer[] = [
      { id: 'alice', name: 'Alice', team: 'A', isBot: false },
      { id: 'bot-1', name: 'Amiral Bot', team: 'B', isBot: true },
    ]
    let state = createInitialTCState(players, '1v1', 7)
    state = advanceTCBots(state)
    expect(state.players.find((p) => p.id === 'bot-1')?.placed).toBe(true)
    state = place1v1(state, 'alice')
    expect(state.phase).toBe('battle')
    // Alice rate → le bot enchaîne ses tirs jusqu'à rater à son tour.
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 63 })
    state = advanceTCBots(state)
    expect(currentTCPlayerId(state)).toBe('alice')
    expect(state.players.find((p) => p.id === 'bot-1')!.shotsFired).toBeGreaterThan(0)
  })

  it('une partie 100% bots se termine toujours', () => {
    const players: TCInitialPlayer[] = [
      { id: 'bot-1', name: 'B1', team: 'A', isBot: true },
      { id: 'bot-2', name: 'B2', team: 'B', isBot: true },
    ]
    const state = advanceTCBots(createInitialTCState(players, '1v1', 99))
    expect(state.phase).toBe('finished')
    expect(state.winner).not.toBeNull()
  })

  it('le bot cible les voisins d\'une touche non coulée', () => {
    let state = createInitialTCState(players1v1(), '1v1', 42)
    state = place1v1(state, 'alice')
    state = place1v1(state, 'bob')
    // Simule une touche de Bob sur le navire d'Alice en (2,2)=18 (navire ligne 2 : 16,17,18).
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 63 })
    state = reduceTC(state, { type: 'FIRE', playerId: 'bob', cell: 17 })
    const rng = rngFromState(state.rngState)
    const cell = botChooseCell(state, 'bob', rng)
    expect([16, 18, 9, 25]).toContain(cell)
  })
})

describe('toucher-coule — anti-triche (vue client)', () => {
  it('masque les cellules des navires ennemis non coulés et le rngState', () => {
    let state = createInitialTCState(players1v1(), '1v1', 42)
    state = place1v1(state, 'alice')
    state = place1v1(state, 'bob')
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 0 })

    const view = toTCClientView(state, 'alice')
    expect((view as { rngState?: number }).rngState).toBeUndefined()
    const bobBig = view.ships.find((s) => s.ownerId === 'bob' && s.id.endsWith('ship-0'))!
    expect(bobBig.revealed).toBe(false)
    expect(bobBig.cells).toEqual([0])
    const aliceShips = view.ships.filter((s) => s.ownerId === 'alice')
    expect(aliceShips.every((s) => s.revealed && s.cells.length >= 2)).toBe(true)
  })

  it('révèle intégralement un navire coulé', () => {
    let state = createInitialTCState(players1v1(), '1v1', 42)
    state = place1v1(state, 'alice')
    state = place1v1(state, 'bob')
    const smallShip = state.ships.find((s) => s.ownerId === 'bob' && s.cells.length === 2)!
    for (const cell of smallShip.cells) {
      state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell })
    }
    const view = toTCClientView(state, 'alice')
    const sunk = view.ships.find((s) => s.id === smallShip.id)!
    expect(sunk.sunk).toBe(true)
    expect(sunk.cells).toHaveLength(2)
  })
})
