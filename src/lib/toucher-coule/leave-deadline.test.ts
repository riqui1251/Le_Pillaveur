import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createInitialTCState,
  currentTCPlayerId,
  reduceTC,
  tcActorPlaysAuto,
  type TCInitialPlayer,
  type TCState,
} from './engine'
import { applyTCRoomAction, buildTCState, parseTCState, serializeTCState } from './server-adapter'
import { getGameAdapter } from '@/lib/online/game-adapters'

const NOW = 1_700_000_000_000
const PLACEMENT_MS = 90_000

const adapter = getGameAdapter('toucher-coule')!

function players1v1(): TCInitialPlayer[] {
  return [
    { id: 'alice', name: 'Alice', team: 'A', isBot: false },
    { id: 'bob', name: 'Bob', team: 'B', isBot: false },
  ]
}

/** Placement fixe (1v1, grille 8) : la case 63 reste vide, un tir dessus est raté. */
function place1v1(state: TCState, playerId: string): TCState {
  const g = state.gridSize
  return reduceTC(state, {
    type: 'PLACE',
    playerId,
    ships: [
      [0, 1, 2, 3],
      [g * 2, g * 2 + 1, g * 2 + 2],
      [g * 4, g * 4 + 1],
    ],
  })
}

function battleState(): TCState {
  let state = createInitialTCState(players1v1(), '1v1', 42)
  state = place1v1(state, 'alice')
  return place1v1(state, 'bob')
}

const player = (state: TCState, id: string) => state.players.find((p) => p.id === id)!

function botTick(state: TCState): TCState {
  const result = applyTCRoomAction(state, 'alice', { type: 'bot' })
  if (!result.ok) throw new Error(result.error)
  return result.state
}

afterEach(() => {
  vi.useRealTimers()
})

describe('toucher-coule — tour d’un joueur parti joué par l’IA', () => {
  it('parti pendant son tour : le tick bot tire pour lui, puis la main passe', () => {
    let state = battleState()
    expect(currentTCPlayerId(state)).toBe('alice')
    state = adapter.markLeft(state, 'alice', NOW) as TCState

    expect(adapter.serviceTick!(state, NOW)).toMatchObject({ body: { action: 'bot' } })

    state = botTick(state)
    expect(player(state, 'alice').shotsFired).toBe(1)
    for (let guard = 0; guard < 30 && currentTCPlayerId(state) === 'alice'; guard += 1) {
      state = botTick(state)
    }
    expect(currentTCPlayerId(state)).toBe('bob')
    // Toujours « parti » : il peut revenir, il n'est pas encore remplacé.
    expect(player(state, 'alice').isBot).toBe(false)
    expect(player(state, 'alice').leftAt).toBe(NOW)
  })

  it('parti hors de son tour : refus tant que le présent a la main, puis son tour est joué', () => {
    let state = battleState()
    state = adapter.markLeft(state, 'bob', NOW) as TCState
    expect(applyTCRoomAction(state, 'alice', { type: 'bot' })).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
    expect(adapter.serviceTick!(state, NOW)).toBeNull()

    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 63 })
    expect(currentTCPlayerId(state)).toBe('bob')
    expect(adapter.serviceTick!(state, NOW)).toMatchObject({ body: { action: 'bot' } })

    state = botTick(state)
    expect(player(state, 'bob').shotsFired).toBe(1)
  })

  it('REJOIN : le joueur revenu rejoue lui-même', () => {
    let state = battleState()
    state = adapter.markLeft(state, 'bob', NOW) as TCState
    state = adapter.rejoin(state, 'bob') as TCState
    state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: 63 })
    expect(currentTCPlayerId(state)).toBe('bob')

    expect(applyTCRoomAction(state, 'alice', { type: 'bot' })).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
    expect(adapter.serviceTick!(state, NOW)).toBeNull()
    const fired = applyTCRoomAction(state, 'bob', { type: 'fire', cell: 63 })
    expect(fired.ok).toBe(true)
  })

  it('1 contre 1 de deux humains dont un part : la partie va au bout sans tir sans fin', () => {
    let state = battleState()
    state = adapter.markLeft(state, 'bob', NOW) as TCState
    let nextCell = 0
    let aliceStreakAfterMiss = 0
    for (let guard = 0; guard < 400 && state.phase === 'battle'; guard += 1) {
      if (currentTCPlayerId(state) === 'alice') {
        while (state.shotsAt.B[nextCell] !== undefined) nextCell += 1
        const before = state.turnCount
        state = reduceTC(state, { type: 'FIRE', playerId: 'alice', cell: nextCell })
        // Après un raté, la main DOIT passer à Bob (pas de tour sauté).
        if (state.lastShot?.result === 'miss' && state.phase === 'battle') {
          expect(currentTCPlayerId(state)).toBe('bob')
          expect(state.turnCount).toBe(before + 1)
          aliceStreakAfterMiss += 1
        }
      } else {
        state = botTick(state)
      }
    }
    expect(state.phase).toBe('finished')
    expect(aliceStreakAfterMiss).toBeGreaterThan(0)
    expect(player(state, 'bob').shotsFired).toBeGreaterThan(0)
  })

  it('tcActorPlaysAuto (règle partagée avec le client) : bot ou humain parti au tour', () => {
    const state = battleState()
    expect(tcActorPlaysAuto(state)).toBe(false)
    expect(tcActorPlaysAuto(reduceTC(state, { type: 'LEAVE', playerId: 'alice', at: NOW }))).toBe(true)
    expect(tcActorPlaysAuto(reduceTC(state, { type: 'LEAVE', playerId: 'bob', at: NOW }))).toBe(false)
    const asBot: TCState = {
      ...state,
      players: state.players.map((p) => (p.id === 'alice' ? { ...p, isBot: true } : p)),
    }
    expect(tcActorPlaysAuto(asBot)).toBe(true)
    expect(tcActorPlaysAuto(createInitialTCState(players1v1(), '1v1', 1))).toBe(false)
  })
})

describe('toucher-coule — départ avant d’avoir placé', () => {
  it('le partant reçoit un placement automatique, la bataille démarre si tous sont placés', () => {
    let state = createInitialTCState(players1v1(), '1v1', 7)
    state = place1v1(state, 'alice')
    state = adapter.markLeft(state, 'bob', NOW) as TCState
    expect(player(state, 'bob').placed).toBe(true)
    expect(player(state, 'bob').leftAt).toBe(NOW)
    expect(state.ships.filter((s) => s.ownerId === 'bob')).toHaveLength(3)
    expect(state.phase).toBe('battle')
  })

  it('les autres non placés gardent la main sur leur placement', () => {
    let state = createInitialTCState(players1v1(), '1v1', 7)
    state = reduceTC(state, { type: 'LEAVE', playerId: 'bob', at: NOW })
    expect(player(state, 'bob').placed).toBe(true)
    expect(player(state, 'alice').placed).toBe(false)
    expect(state.phase).toBe('placement')
  })
})

describe('toucher-coule — échéance de placement (90 s)', () => {
  const members = [
    { userId: 'alice', displayName: 'Alice' },
    { userId: 'bob', displayName: 'Bob' },
  ]

  it('posée à la création et exposée par serviceTick', () => {
    const state = buildTCState(members, '1v1', {}, 'graine', {}, NOW)
    expect(state.placementEndsAt).toBe(NOW + PLACEMENT_MS)
    expect(adapter.serviceTick!(state, NOW)).toEqual({ body: { action: 'advance' }, dueAt: NOW + PLACEMENT_MS })
  })

  it('refusée avant l’échéance, place les retardataires et lance la bataille après', () => {
    let state = buildTCState(members, '1v1', {}, 'graine', {}, NOW)
    state = place1v1(state, 'alice')
    const aliceShips = state.ships.filter((s) => s.ownerId === 'alice')

    expect(applyTCRoomAction(state, 'alice', { type: 'advance' }, NOW + PLACEMENT_MS - 1)).toEqual({
      ok: false,
      error: 'NOT_DUE',
    })
    const result = applyTCRoomAction(state, 'alice', { type: 'advance' }, NOW + PLACEMENT_MS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.phase).toBe('battle')
    expect(result.state.players.every((p) => p.placed)).toBe(true)
    expect(result.state.ships.filter((s) => s.ownerId === 'alice')).toEqual(aliceShips)
    expect(result.state.ships.filter((s) => s.ownerId === 'bob')).toHaveLength(3)
    expect(adapter.serviceTick!(result.state, NOW + PLACEMENT_MS)).toBeNull()
  })

  it('adaptateur : advance validé par l’horloge serveur, 409 avant l’échéance', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const state = buildTCState(members, '1v1', {}, 'graine', {}, NOW)
    vi.setSystemTime(NOW + 1_000)
    expect(adapter.applyAction(state, '__service__', { action: 'advance' })).toMatchObject({
      ok: false,
      status: 409,
    })
    vi.setSystemTime(NOW + PLACEMENT_MS)
    const done = adapter.applyAction(state, '__service__', { action: 'advance' })
    expect(done.ok).toBe(true)
    if (done.ok) expect((done.state as TCState).phase).toBe('battle')
  })

  it('état ancien sans échéance : lisible, pas de tick, advance refusé', () => {
    const fresh = buildTCState(members, '1v1', {}, 'graine', {}, NOW)
    const legacy = JSON.parse(serializeTCState(fresh)) as Record<string, unknown>
    delete legacy.placementEndsAt
    const state = parseTCState(JSON.stringify(legacy))
    expect(state).not.toBeNull()
    expect(state!.phase).toBe('placement')
    expect(adapter.serviceTick!(state, NOW + 10 * PLACEMENT_MS)).toBeNull()
    expect(applyTCRoomAction(state!, 'alice', { type: 'advance' }, NOW + 10 * PLACEMENT_MS)).toEqual({
      ok: false,
      error: 'NOT_DUE',
    })
    // Le placement à la main fonctionne comme avant.
    const placed = place1v1(place1v1(state!, 'alice'), 'bob')
    expect(placed.phase).toBe('battle')
  })
})
