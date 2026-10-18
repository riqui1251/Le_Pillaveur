import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/online/rooms/join — l'ami en retard.
 *
 * Une partie finie laissait la salle 'playing' : le retardataire muni du
 * code butait sur game_already_started alors qu'il n'y avait plus rien à
 * interrompre. Il s'assoit désormais (« pas prêt ») et voit l'écran de fin ;
 * une partie EN COURS reste fermée comme avant. Vraie route, base et session
 * simulées, adaptateur minimal.
 */

const { userMock, roomMock, memberMock, inviteMock, dtoMock, leaveMock, purgeMock, canJoinMock, adapterMock, bus, cache } =
  vi.hoisted(() => ({
    userMock: vi.fn(),
    roomMock: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    memberMock: { upsert: vi.fn() },
    inviteMock: { updateMany: vi.fn() },
    dtoMock: vi.fn(),
    leaveMock: vi.fn(),
    purgeMock: vi.fn(),
    canJoinMock: vi.fn(),
    adapterMock: vi.fn(),
    bus: { publishRoomChanged: vi.fn() },
    cache: { invalidateLobbiesCache: vi.fn() },
  }))

vi.mock('@/lib/prisma', () => ({
  prisma: { onlineRoom: roomMock, onlineRoomMember: memberMock, onlineRoomInvite: inviteMock },
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({
  buildRoomDto: dtoMock,
  leaveOtherRooms: leaveMock,
  purgeAbsentLobbyMembers: purgeMock,
}))
vi.mock('@/lib/online/room-invites', () => ({ canJoinInviteRoom: canJoinMock }))
vi.mock('@/lib/online/game-adapters', () => ({ getGameAdapter: adapterMock }))
vi.mock('@/lib/online/room-bus', () => bus)
vi.mock('@/lib/online/lobbies-cache', () => cache)
vi.mock('@/lib/online/room-ticker', () => ({ armRoomTicker: vi.fn() }))

import { POST } from './route'
import { recordDeparture, takeDeparture } from '@/lib/online/departures'

/** Adaptateur minimal : phase dans l'état ; personne n'est « parti » (pas de reprise de siège). */
const fakeAdapter = {
  maxPlayers: 4,
  parse: (json: string | null) => (json ? JSON.parse(json) : null),
  serialize: (state: unknown) => JSON.stringify(state),
  rejoin: (() => null) as (state: unknown, userId: string) => unknown,
  isFinished: (state: unknown) => (state as { phase: string }).phase === 'finished',
  currentActorId: () => 'host',
}

/** Reprise de siège : l'état porte `left`, le joueur qui revient en sort. */
const rejoinAdapter = {
  ...fakeAdapter,
  rejoin: (state: unknown, userId: string) => {
    const s = state as { phase: string; moves: number; left: string[] }
    return s.left.includes(userId) ? { ...s, left: s.left.filter((id) => id !== userId) } : null
  },
}

const leftRoom = (over: Record<string, unknown> = {}) =>
  playingRoom({ gameStateJson: JSON.stringify({ phase: 'bidding', moves: 0, left: ['bob'] }), ...over })

/** Salle de Menteur lancée, deux joueurs. */
const playingRoom = (over: Record<string, unknown> = {}) => ({
  id: 'room-1',
  code: 'ABC234',
  status: 'playing',
  visibility: 'private',
  gameId: 'menteur',
  hostUserId: 'host',
  settingsJson: null,
  gameStateJson: JSON.stringify({ phase: 'finished' }),
  stateVersion: 9,
  members: [
    { userId: 'host', lastSeenAt: new Date() },
    { userId: 'alice', lastSeenAt: new Date() },
  ],
  ...over,
})

/**
 * Un compte NEUF par requête : la route est limitée en cadence par compte
 * (état gardé dans le module) — voir create-room.test.ts.
 */
let seq = 0
const join = (userId = `late-${++seq}`, body: Record<string, unknown> = { code: 'ABC234' }) => {
  userMock.mockResolvedValue({ id: userId })
  return POST(
    new Request('http://test/api/online/rooms/join', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  adapterMock.mockReturnValue(fakeAdapter)
  purgeMock.mockResolvedValue({ absent: [], hostUserId: 'host' })
  memberMock.upsert.mockResolvedValue({})
  dtoMock.mockResolvedValue({ id: 'room-1' })
})

describe('POST /join — retardataire', () => {
  it('partie FINIE : il s’assoit « pas prêt » et la table est prévenue', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())

    const res = await join('late-bob')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ room: { id: 'room-1' } })
    expect(leaveMock).toHaveBeenCalledWith('late-bob', 'room-1')
    expect(memberMock.upsert).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: 'room-1', userId: 'late-bob' } },
      create: { roomId: 'room-1', userId: 'late-bob', isReady: false },
      update: { lastSeenAt: expect.any(Date), isReady: false },
    })
    // L'état de la partie finie n'est pas touché : il voit l'écran de fin.
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
    expect(cache.invalidateLobbiesCache).toHaveBeenCalled()
  })

  it('partie EN COURS : toujours refusée', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom({ gameStateJson: JSON.stringify({ phase: 'bidding' }) }))

    const res = await join()

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('game_already_started')
    expect(memberMock.upsert).not.toHaveBeenCalled()
  })

  it('relance en train de se distribuer (version sentinelle) : refusée', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom({ stateVersion: -1 }))

    expect((await join()).status).toBe(409)
    expect(memberMock.upsert).not.toHaveBeenCalled()
  })

  it('briefing : refusé', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom({ status: 'briefing' }))

    expect((await join()).status).toBe(409)
  })

  it('plafond de sièges humains inchangé : table finie mais pleine → room_full', async () => {
    roomMock.findUnique.mockResolvedValue(
      playingRoom({
        members: ['host', 'alice', 'carol', 'dan'].map((userId) => ({ userId, lastSeenAt: new Date() })),
      })
    )

    const res = await join()

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('room_full')
    expect(memberMock.upsert).not.toHaveBeenCalled()
  })

  it('table sur invitation : il faut une invitation, partie finie ou non', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom({ visibility: 'invite' }))
    canJoinMock.mockResolvedValue(false)

    const res = await join()

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('invite_only')
  })

  it('efface la raison d’un départ forcé précédent de CETTE table', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())
    recordDeparture('late-eve', 'room-1', 'kicked')

    await join('late-eve')

    expect(takeDeparture('late-eve', 'room-1')).toBeNull()
  })
})

describe('POST /join — par identifiant, sans le code', () => {
  it('table PRIVÉE finie : l’inconnu muni du seul identifiant ne s’assoit pas (introuvable)', async () => {
    // L'identifiant a pu se lire ailleurs que dans le code partagé ; il ne
    // vaut pas le code d'une table « accessible avec le code uniquement ».
    roomMock.findUnique.mockResolvedValue(playingRoom())
    canJoinMock.mockResolvedValue(false)

    const res = await join(undefined, { roomId: 'room-1' })

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('room_not_found')
    expect(canJoinMock).toHaveBeenCalledWith('room-1', expect.any(String))
    expect(memberMock.upsert).not.toHaveBeenCalled()
    expect(dtoMock).not.toHaveBeenCalled()
  })

  it('table PRIVÉE en attente : même refus sans le code', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom({ status: 'waiting', gameStateJson: null, stateVersion: 0 }))
    canJoinMock.mockResolvedValue(false)

    expect((await join(undefined, { roomId: 'room-1' })).status).toBe(404)
    expect(memberMock.upsert).not.toHaveBeenCalled()
  })

  it('la même table privée avec son CODE : acceptée', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())
    canJoinMock.mockResolvedValue(false)

    const res = await join(undefined, { code: 'ABC234' })

    expect(res.status).toBe(200)
    expect(canJoinMock).not.toHaveBeenCalled()
    expect(memberMock.upsert).toHaveBeenCalled()
  })

  it('membre ou invité : l’identifiant suffit (bandeaux Rejoindre, invitation d’ami)', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom())
    canJoinMock.mockResolvedValue(true)

    expect((await join(undefined, { roomId: 'room-1' })).status).toBe(200)
    expect(memberMock.upsert).toHaveBeenCalled()
  })

  it('table PUBLIQUE : l’identifiant suffit, comme au guichet', async () => {
    roomMock.findUnique.mockResolvedValue(playingRoom({ visibility: 'public' }))

    expect((await join(undefined, { roomId: 'room-1' })).status).toBe(200)
    expect(canJoinMock).not.toHaveBeenCalled()
  })
})

describe('POST /join — reprise de siège (compare-and-swap)', () => {
  beforeEach(() => {
    adapterMock.mockReturnValue(rejoinAdapter)
  })

  it('écrit la reprise sur la version lue, puis rend le siège', async () => {
    roomMock.findUnique.mockResolvedValue(leftRoom())
    roomMock.updateMany.mockResolvedValue({ count: 1 })

    const res = await join('bob')

    expect(res.status).toBe(200)
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'room-1', stateVersion: 9 },
      data: {
        gameStateJson: JSON.stringify({ phase: 'bidding', moves: 0, left: [] }),
        stateVersion: 10,
        currentTurnUserId: 'host',
      },
    })
    expect(memberMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { roomId: 'room-1', userId: 'bob', isReady: true } })
    )
    expect(leaveMock).toHaveBeenCalledWith('bob', 'room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed', stateVersion: 10 })
  })

  it('conflit : le coup joué entre-temps est conservé, la reprise est recalculée sur l’état frais', async () => {
    roomMock.findUnique
      .mockResolvedValueOnce(leftRoom())
      .mockResolvedValueOnce(
        leftRoom({ gameStateJson: JSON.stringify({ phase: 'bidding', moves: 1, left: ['bob'] }), stateVersion: 10 })
      )
    roomMock.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    const res = await join('bob')

    expect(res.status).toBe(200)
    expect(roomMock.updateMany).toHaveBeenCalledTimes(2)
    expect(roomMock.updateMany.mock.calls[1][0]).toMatchObject({
      where: { id: 'room-1', stateVersion: 10 },
      data: { gameStateJson: JSON.stringify({ phase: 'bidding', moves: 1, left: [] }), stateVersion: 11 },
    })
    expect(memberMock.upsert).toHaveBeenCalledTimes(1)
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed', stateVersion: 11 })
  })

  it('conflit : remplacé par un bot entre-temps, la partie en cours reste fermée et aucun siège n’est rendu', async () => {
    roomMock.findUnique
      .mockResolvedValueOnce(leftRoom())
      .mockResolvedValueOnce(leftRoom({ gameStateJson: JSON.stringify({ phase: 'bidding', moves: 1, left: [] }), stateVersion: 10 }))
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    const res = await join('bob')

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('game_already_started')
    expect(memberMock.upsert).not.toHaveBeenCalled()
    expect(leaveMock).not.toHaveBeenCalled()
  })

  it('conflits répétés : refus borné version_conflict, rien d’écrit sans condition', async () => {
    roomMock.findUnique.mockResolvedValue(leftRoom())
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    const res = await join('bob')

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('version_conflict')
    expect(roomMock.updateMany).toHaveBeenCalledTimes(3)
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(memberMock.upsert).not.toHaveBeenCalled()
  })
})
