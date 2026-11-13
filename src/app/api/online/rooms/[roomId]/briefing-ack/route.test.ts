import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/online/rooms/[roomId]/briefing-ack — la garde Patate Chaude. Le
 * jeu se joue sans bots : un départ pendant le briefing qui laisse un seul
 * joueur renvoie la table au lobby, au lieu de lancer une partie à un joueur.
 * La vraie route (base, session, lancement et bus simulés).
 */

const { userMock, roomMock, dtoMock, launchMock, resetMock, bus } = vi.hoisted(() => ({
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  dtoMock: vi.fn(),
  launchMock: vi.fn(),
  resetMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomMock } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({ buildRoomDto: dtoMock }))
vi.mock('@/lib/online-room-launch', () => ({
  launchOnlineRoom: launchMock,
  resetRoomToWaitingLobby: resetMock,
}))
vi.mock('@/lib/online/room-bus', () => bus)

import { POST } from './route'

/** Salle en briefing ; `acks` : qui a déjà validé le tuto. */
const briefingRoom = (gameId: string, userIds: string[], acks: string[] = []) => ({
  id: 'room-1',
  status: 'briefing',
  gameId,
  hostUserId: userIds[0],
  settingsJson: null,
  briefingJson: JSON.stringify({ startedAt: Date.now(), acks }),
  members: userIds.map((userId) => ({ userId, user: { displayName: userId } })),
})

const ack = (userId: string) => {
  userMock.mockResolvedValue({ id: userId })
  return POST(
    new Request('http://test/api/online/rooms/room-1/briefing-ack', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ roomId: 'room-1' }) }
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  roomMock.update.mockResolvedValue({})
  roomMock.updateMany.mockResolvedValue({ count: 1 })
  dtoMock.mockResolvedValue({ id: 'room-1' })
})

describe('POST /briefing-ack — Patate Chaude, sans bots', () => {
  it('seul à la table : retour au lobby, aucune partie lancée', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('patate-chaude', ['u1']))

    const res = await ack('u1')

    expect(res.status).toBe(200)
    expect(roomMock.updateMany).toHaveBeenCalledTimes(1)
    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'room-1', status: 'briefing' },
      data: { status: 'waiting', briefingJson: null },
    })
    expect(resetMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('un ack concurrent qui perd la réclamation ne remet rien à zéro', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('patate-chaude', ['u1']))
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    const res = await ack('u1')

    expect(res.status).toBe(200)
    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'room-1', status: 'briefing' },
      data: { status: 'waiting', briefingJson: null },
    })
    expect(resetMock).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).not.toHaveBeenCalledWith('room-1', { type: 'lobby' })
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('à deux, le dernier ack lance la partie', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('patate-chaude', ['u1', 'u2'], ['u2']))

    await ack('u1')

    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'room-1', status: 'briefing' },
      data: { status: 'playing', briefingJson: null },
    })
    expect(launchMock).toHaveBeenCalledWith('room-1', expect.objectContaining({ gameId: 'patate-chaude' }))
    expect(resetMock).not.toHaveBeenCalled()
  })

  it('ne touche pas aux jeux complétés par des bots : seul, on lance quand même', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('chiffre-piege', ['u1']))

    await ack('u1')

    expect(launchMock).toHaveBeenCalledWith('room-1', expect.objectContaining({ gameId: 'chiffre-piege' }))
    expect(resetMock).not.toHaveBeenCalled()
  })
})
