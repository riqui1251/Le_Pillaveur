import { describe, expect, it } from 'vitest'
import {
  advanceTCBots,
  botChooseCell,
  botShouldUseBomb,
  createInitialTCState,
  currentTCPlayerId,
  placeTCBots,
  reduceTC,
  toTCClientView,
  toTCSpectatorView,
  TC_MODES,
  TC_REJOIN_GRACE_MS,
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
  it('respecte les quotas de navires demandés (3/joueur en 1v1, 2/joueur en 2v2, 3v3 et 4v4)', () => {
    expect(TC_MODES['1v1'].shipSizesPerPlayer).toHaveLength(3)
    expect(TC_MODES['2v2'].shipSizesPerPlayer).toHaveLength(2)
    expect(TC_MODES['3v3'].shipSizesPerPlayer).toHaveLength(2)
    expect(TC_MODES['4v4'].shipSizesPerPlayer).toHaveLength(2)
  })

  it('agrandit la grille avec le nombre de joueurs', () => {
    expect(TC_MODES['1v1'].gridSize).toBeLessThan(TC_MODES['2v2'].gridSize)
    expect(TC_MODES['2v2'].gridSize).toBeLessThan(TC_MODES['3v3'].gridSize)
    expect(TC_MODES['3v3'].gridSize).toBeLessThan(TC_MODES['4v4'].gridSize)
  })

  it('4v4 : 4 joueurs par équipe, ordre de tir interleaved', () => {
    const players: TCInitialPlayer[] = [
      { id: 'a1', name: 'A1', team: 'A', isBot: false },
      { id: 'a2', name: 'A2', team: 'A', isBot: false },
      { id: 'a3', name: 'A3', team: 'A', isBot: false },
      { id: 'a4', name: 'A4', team: 'A', isBot: false },
      { id: 'b1', name: 'B1', team: 'B', isBot: false },
      { id: 'b2', name: 'B2', team: 'B', isBot: false },
      { id: 'b3', name: 'B3', team: 'B', isBot: false },
      { id: 'b4', name: 'B4', team: 'B', isBot: false },
    ]
    const state = createInitialTCState(players, '4v4', 1)
    expect(state.turnOrder).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a4', 'b4'])
    expect(state.gridSize).toBe(14)
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

describe('toucher-coule — power-up Bombe', () => {
  function battleStateWithBomb(): TCState {
    let state = createInitialTCState(players1v1(), '1v1', 42, { powerups: true })
    state = place1v1(state, 'alice')
    state = place1v1(state, 'bob')
    return state
  }

  it('createInitialTCState : hasBomb suit rulePowerups', () => {
    const on = createInitialTCState(players1v1(), '1v1', 1, { powerups: true })
    expect(on.rulePowerups).toBe(true)
    expect(on.players.every((p) => p.hasBomb)).toBe(true)

    const off = createInitialTCState(players1v1(), '1v1', 1)
    expect(off.rulePowerups).toBe(false)
    expect(off.players.every((p) => !p.hasBomb)).toBe(true)
  })

  it('refuse la bombe si la règle est désactivée', () => {
    let state = createInitialTCState(players1v1(), '1v1', 42)
    state = place1v1(state, 'alice')
    state = place1v1(state, 'bob')
    expect(() => reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 0, bomb: true })).toThrow(
      'POWERUPS_DISABLED'
    )
  })

  it('refuse un ancrage qui déborderait de la grille', () => {
    const state = battleStateWithBomb()
    // Coin bas-droit (row=7, col=7 sur une grille 8×8) : le carré 2×2 sortirait.
    expect(() => reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 63, bomb: true })).toThrow(
      'BOMB_OUT_OF_BOUNDS'
    )
  })

  it('refuse si une des 4 cases est déjà tirée', () => {
    let state = battleStateWithBomb()
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 9 })
    state = reduceTC(state, { type: 'FIRE', playerId: 'bob', cell: 63 }) // main repasse à alice
    expect(() => reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 0, bomb: true })).toThrow(
      'CELL_ALREADY_SHOT'
    )
  })

  it('bombe mixte (touché + raté) : résout les 4 cases, consomme la charge, le tireur rejoue', () => {
    let state = battleStateWithBomb()
    // Ancrage 0 → cases [0,1,8,9]. Bob a un navire sur [0,1,2,3] : 0 et 1 touchent, 8 et 9 ratent.
    const before = state.players.find((p) => p.id === 'bob')!.drinks
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 0, bomb: true })
    expect(state.players.find((p) => p.id === 'alice')?.hasBomb).toBe(false)
    expect(state.lastShot?.bombResults).toHaveLength(4)
    const results = state.lastShot!.bombResults!
    expect(results.filter((r) => r.result === 'hit')).toHaveLength(2)
    expect(results.filter((r) => r.result === 'miss')).toHaveLength(2)
    // Le propriétaire boit 1 gorgée par case touchée, le tireur ne boit rien (au moins un hit).
    expect(state.players.find((p) => p.id === 'bob')?.drinks).toBe(before + 2)
    expect(state.players.find((p) => p.id === 'alice')?.drinks).toBe(0)
    // Touché → le tireur rejoue.
    expect(currentTCPlayerId(state)).toBe('alice')
  })

  it('bombe entièrement dans l\'eau : le tireur boit 1 et la main passe', () => {
    let state = battleStateWithBomb()
    // Ancrage 54 (row 6, col 6) → cases [54,55,62,63], loin des navires de Bob (lignes 0/2/4).
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 54, bomb: true })
    expect(state.lastShot?.bombResults?.every((r) => r.result === 'miss')).toBe(true)
    expect(state.players.find((p) => p.id === 'alice')?.drinks).toBe(1)
    expect(currentTCPlayerId(state)).toBe('bob')
  })

  it('une seule bombe par joueur : la 2e tentative échoue', () => {
    let state = battleStateWithBomb()
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 54, bomb: true }) // rate tout → main passe
    state = reduceTC(state, { type: 'FIRE', playerId: 'bob', cell: 63 })
    expect(() => reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 40, bomb: true })).toThrow(
      'NO_BOMB_CHARGE'
    )
  })

  it('botShouldUseBomb : jamais sans charge, jamais hors grille', () => {
    const state = battleStateWithBomb()
    const bob = state.players.find((p) => p.id === 'bob')!
    const rng = rngFromState(state.rngState)
    expect(botShouldUseBomb(state, { ...bob, hasBomb: false }, 0, rng)).toBe(false)
    expect(botShouldUseBomb(state, bob, 63, rng)).toBe(false) // coin bas-droit, hors bornes pour une bombe
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

describe('toucher-coule — départ / retour / remplacement par bot', () => {
  function battleState(): TCState {
    let state = createInitialTCState(players1v1(), '1v1', 42)
    state = place1v1(state, 'alice')
    state = place1v1(state, 'bob')
    return state
  }

  it('LEAVE marque le départ, REJOIN l\'annule', () => {
    let state = battleState()
    state = reduceTC(state, { type: 'LEAVE', playerId: 'bob', at: 1000 })
    expect(state.players.find((p) => p.id === 'bob')?.leftAt).toBe(1000)
    state = reduceTC(state, { type: 'REJOIN', playerId: 'bob' })
    expect(state.players.find((p) => p.id === 'bob')?.leftAt).toBeNull()
  })

  it('REPLACE_LEFT ne convertit qu\'après le délai de grâce', () => {
    let state = battleState()
    state = reduceTC(state, { type: 'LEAVE', playerId: 'bob', at: 1000 })
    const tooSoon = reduceTC(state, { type: 'REPLACE_LEFT', now: 1000 + TC_REJOIN_GRACE_MS - 1 })
    expect(tooSoon.players.find((p) => p.id === 'bob')?.isBot).toBe(false)
    const after = reduceTC(state, { type: 'REPLACE_LEFT', now: 1000 + TC_REJOIN_GRACE_MS })
    const bob = after.players.find((p) => p.id === 'bob')!
    expect(bob.isBot).toBe(true)
    expect(bob.leftAt).toBeNull()
    // Devenu bot, il n'est plus rejoignable.
    expect(() => reduceTC(after, { type: 'REJOIN', playerId: 'bob' })).toThrow('CANNOT_REJOIN')
  })

  it('un remplacé en phase placement pose ses navires via placeTCBots', () => {
    let state = createInitialTCState(players1v1(), '1v1', 7)
    state = place1v1(state, 'alice')
    state = reduceTC(state, { type: 'LEAVE', playerId: 'bob', at: 1000 })
    state = reduceTC(state, { type: 'REPLACE_LEFT', now: 1000 + TC_REJOIN_GRACE_MS })
    state = placeTCBots(state)
    expect(state.players.find((p) => p.id === 'bob')?.placed).toBe(true)
    expect(state.phase).toBe('battle')
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

describe('toucher-coule — vue spectateur neutre (écran TV)', () => {
  function battleState(): TCState {
    let state = createInitialTCState(players1v1(), '1v1', 7)
    state = place1v1(state, 'alice', 0)
    state = place1v1(state, 'bob', 0)
    return state
  }

  it("cache les cases intactes des DEUX équipes (navire non coulé = seules ses cases touchées)", () => {
    const state = battleState()
    // Un navire touché mais pas coulé (une seule case atteinte).
    const withHit: TCState = {
      ...state,
      ships: state.ships.map((s, i) => (i === 0 ? { ...s, hits: [s.cells[0]] } : s)),
    }
    const view = toTCSpectatorView(withHit)

    expect(view.viewerTeam).toBeNull()
    expect('rngState' in view).toBe(false)

    const hitShip = view.ships[0]
    expect(hitShip.revealed).toBe(false)
    expect(hitShip.cells).toEqual([state.ships[0].cells[0]]) // uniquement la case touchée

    // Aucun navire non coulé n'expose plus de cases que celles réellement touchées.
    for (const s of view.ships) {
      if (!s.sunk) expect(s.cells.length).toBe(s.hits.length)
    }
  })

  it('révèle entièrement un navire coulé', () => {
    const state = battleState()
    const sunkState: TCState = {
      ...state,
      ships: state.ships.map((s, i) => (i === 0 ? { ...s, hits: [...s.cells], sunk: true } : s)),
    }
    const view = toTCSpectatorView(sunkState)
    expect(view.ships[0].revealed).toBe(true)
    expect(view.ships[0].cells).toEqual(state.ships[0].cells)
  })
})
