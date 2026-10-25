import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/rooms/[roomId] hors de la table : le 403 dit POURQUOI
 * quand le serveur a retiré le joueur lui-même (online/departures.ts) — une
 * fois, puis il retombe sur le refus nu. Vraie route, base et session
 * simulées, registre des départs réel.
 */

const { userMock, memberMock, roomMock, adapterMock, bus, tickerMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  memberMock: { findUnique: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  roomMock: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  adapterMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
  tickerMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { onlineRoomMember: memberMock, onlineRoom: roomMock },
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({
  buildRoomDto: vi.fn(),
  closeGameSessionBeforeRoomDelete: vi.fn(),
  touchMemberPresence: vi.fn(),
}))
vi.mock('@/lib/online/room-bus', () => bus)
vi.mock('@/lib/online/lobbies-cache', () => ({ invalidateLobbiesCache: vi.fn() }))
vi.mock('@/lib/online/game-adapters', () => ({ getGameAdapter: adapterMock }))
vi.mock('@/lib/online/room-ticker', () => ({ armRoomTicker: tickerMock }))
vi.mock('./briefing-start', () => ({ startBriefedGame: vi.fn() }))

import { DELETE, GET } from './route'
import { buildRoomDto } from '@/lib/online-room'
import { startBriefedGame } from './briefing-start'
import { BRIEFING_TIMEOUT_MS } from '@/lib/online/briefing'
import { recordDeparture } from '@/lib/online/departures'
import { buildPetitBuveurEngineState } from '@/lib/petit-buveur/server-adapter'
import type { GameAdapter } from '@/lib/online/game-adapters'
import type { EngineState } from '@/lib/petit-buveur/engine'

const get = (userId: string, roomId = 'room-1') => {
  userMock.mockResolvedValue({ id: userId })
  return GET(new Request(`http://test/api/online/rooms/${roomId}`), {
    params: Promise.resolve({ roomId }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  memberMock.findUnique.mockResolvedValue(null)
})

describe('GET /rooms/[roomId] — raison du 403', () => {
  it('rend la raison d’un départ forcé, une seule fois', async () => {
    recordDeparture('kicked-bob', 'room-1', 'kicked')

    const first = await get('kicked-bob')
    expect(first.status).toBe(403)
    expect(await first.json()).toMatchObject({ error: 'forbidden', reason: 'kicked' })

    const second = await get('kicked-bob')
    expect(second.status).toBe(403)
    expect(await second.json()).not.toHaveProperty('reason')
  })

  it('pas de raison pour une autre table', async () => {
    recordDeparture('absent-ann', 'room-2', 'absent')

    const res = await get('absent-ann', 'room-1')

    expect(await res.json()).not.toHaveProperty('reason')
  })

  it('refus nu sans départ connu', async () => {
    const res = await get('inconnu')

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden', message: expect.any(String) })
  })
})

describe('GET /rooms/[roomId] — filet serveur du briefing', () => {
  const dtoMock = vi.mocked(buildRoomDto)
  const startMock = vi.mocked(startBriefedGame)
  const dto = (status: string, startedAt: number | null) =>
    ({ id: 'room-1', status, briefing: startedAt === null ? null : { startedAt, acks: [] } }) as never

  beforeEach(() => {
    memberMock.findUnique.mockResolvedValue({ roomId: 'room-1', userId: 'alice' })
  })

  it('échéance passée sans tick reçu : le sondage lance la partie et rend la salle relue', async () => {
    dtoMock
      .mockResolvedValueOnce(dto('briefing', Date.now() - BRIEFING_TIMEOUT_MS - 1))
      .mockResolvedValueOnce(dto('playing', null))

    const res = await get('alice')

    expect(res.status).toBe(200)
    expect(startMock).toHaveBeenCalledTimes(1)
    expect(startMock).toHaveBeenCalledWith('room-1')
    expect((await res.json()).room.status).toBe('playing')
  })

  it('briefing en cours, ou partie déjà lancée : rien', async () => {
    dtoMock.mockResolvedValueOnce(dto('briefing', Date.now() - 1_000))
    await get('alice')
    dtoMock.mockResolvedValueOnce(dto('playing', null))
    await get('alice')

    expect(startMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /rooms/[roomId] — hors de la table', () => {
  it('un non-membre ne déclenche ni écriture ni diffusion', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())
    adapterMock.mockReturnValue(fakeAdapter)

    const res = await leave('stranger')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
    expect(memberMock.count).not.toHaveBeenCalled()
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(roomMock.delete).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).not.toHaveBeenCalled()
  })
})

/** Adaptateur minimal : l'état est `{ moves, left }`, le partant s'y ajoute. */
const fakeAdapter = {
  parse: (json: string | null) => (json ? JSON.parse(json) : null),
  serialize: (state: unknown) => JSON.stringify(state),
  markLeft: (state: unknown, userId: string) => {
    const s = state as { moves: number; left: string[]; phase?: string }
    return s.phase === 'finished' ? null : { ...s, left: [...s.left, userId] }
  },
  isFinished: (state: unknown) => (state as { phase?: string }).phase === 'finished',
  currentActorId: () => 'alice',
}

const playingRoom = (over: Record<string, unknown> = {}) => ({
  id: 'room-1',
  status: 'playing',
  gameId: 'menteur',
  hostUserId: 'host',
  gameStateJson: JSON.stringify({ moves: 0, left: [] }),
  stateVersion: 5,
  ...over,
})

const leave = (userId: string) => {
  userMock.mockResolvedValue({ id: userId })
  return DELETE(new Request('http://test/api/online/rooms/room-1', { method: 'DELETE' }), {
    params: Promise.resolve({ roomId: 'room-1' }),
  })
}

const writtenState = (call: number) =>
  JSON.parse(roomMock.updateMany.mock.calls[call][0].data.gameStateJson as string)

describe('DELETE /rooms/[roomId] — départ pendant une partie', () => {
  beforeEach(() => {
    memberMock.findUnique.mockResolvedValue({ userId: 'carol' })
    memberMock.deleteMany.mockResolvedValue({ count: 1 })
    memberMock.count.mockResolvedValue(2)
    adapterMock.mockReturnValue(fakeAdapter)
  })

  it('écrit le départ par compare-and-swap sur la version lue', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())
    roomMock.updateMany.mockResolvedValue({ count: 1 })

    const res = await leave('carol')

    expect(res.status).toBe(200)
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(roomMock.updateMany).toHaveBeenCalledTimes(1)
    expect(roomMock.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'room-1', stateVersion: 5 },
      data: { stateVersion: 6, currentTurnUserId: 'alice' },
    })
    expect(tickerMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed', stateVersion: 6 })
  })

  it('conflit : un coup passé entre-temps est conservé, le départ est réécrit sur l’état frais', async () => {
    roomMock.findUnique
      .mockResolvedValueOnce(playingRoom())
      .mockResolvedValueOnce(playingRoom({ gameStateJson: JSON.stringify({ moves: 1, left: [] }), stateVersion: 6 }))
    roomMock.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    await leave('carol')

    expect(roomMock.updateMany).toHaveBeenCalledTimes(2)
    expect(roomMock.updateMany.mock.calls[1][0]).toMatchObject({
      where: { id: 'room-1', stateVersion: 6 },
      data: { stateVersion: 7 },
    })
    // Le coup concurrent (moves: 1) n'est pas effacé par l'état lu en v5.
    expect(writtenState(1)).toEqual({ moves: 1, left: ['carol'] })
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed', stateVersion: 7 })
  })

  it('le siège n’est libéré qu’APRÈS le départ écrit dans la partie', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())
    roomMock.updateMany.mockResolvedValue({ count: 1 })

    await leave('carol')

    expect(roomMock.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      memberMock.deleteMany.mock.invocationCallOrder[0]
    )
  })

  it('conflits répétés : le siège est GARDÉ (pas de joueur fantôme), 409 pour réessayer', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    const res = await leave('carol')

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'version_conflict' })
    expect(roomMock.updateMany).toHaveBeenCalledTimes(3)
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
    expect(tickerMock).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).not.toHaveBeenCalled()
  })

  it('salle disparue pendant le conflit : rien de plus', async () => {
    roomMock.findUnique.mockResolvedValueOnce(playingRoom()).mockResolvedValueOnce(null)
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    expect((await leave('carol')).status).toBe(200)
    expect(roomMock.updateMany).toHaveBeenCalledTimes(1)
  })
})

describe('DELETE /rooms/[roomId] — Petit Buveur', () => {
  let pbAdapter: GameAdapter
  const members = ['A', 'B', 'C'].map((id) => ({ userId: id, displayName: id }))
  const pbRoom = (state: EngineState) =>
    playingRoom({ gameId: 'petit-buveur', gameStateJson: pbAdapter.serialize(state) })

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/online/game-adapters')>(
      '@/lib/online/game-adapters'
    )
    pbAdapter = actual.getGameAdapter('petit-buveur')!
    adapterMock.mockReturnValue(pbAdapter)
    memberMock.findUnique.mockResolvedValue({ userId: 'A' })
    memberMock.deleteMany.mockResolvedValue({ count: 1 })
    memberMock.count.mockResolvedValue(2)
    roomMock.updateMany.mockResolvedValue({ count: 1 })
  })

  it('le joueur au tour quitte : la main passe aussitôt au suivant', async () => {
    const state = buildPetitBuveurEngineState(members, 'normal', 7)
    expect(pbAdapter.currentActorId(state)).toBe('A')
    roomMock.findUnique.mockResolvedValue(pbRoom(state))

    await leave('A')

    expect(roomMock.updateMany).toHaveBeenCalledTimes(1)
    const { data } = roomMock.updateMany.mock.calls[0][0]
    expect(data.currentTurnUserId).toBe('B')
    expect(pbAdapter.currentActorId(pbAdapter.parse(data.gameStateJson)!)).toBe('B')
    expect(tickerMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed', stateVersion: 6 })
  })

  it('partie TERMINÉE : la table reste sur l’écran de fin, votes « Rejouer » compris', async () => {
    const base = buildPetitBuveurEngineState(members, 'normal', 7)
    const finished = { ...base, phase: 'finished', winner: 'A', rematchVotes: ['A', 'B'] } as EngineState
    roomMock.findUnique.mockResolvedValue(pbRoom(finished))

    const res = await leave('C')

    expect(res.status).toBe(200)
    // Ni état effacé, ni statut 'waiting' : aucune écriture sur la salle.
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(roomMock.delete).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })
})
