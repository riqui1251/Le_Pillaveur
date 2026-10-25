import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * startBriefedGame — fin du briefing. Un départ pendant le tuto ne lance plus
 * une partie trop petite (le moteur levait et la salle restait « playing »
 * sans état) : la table revient au lobby. Base, lanceur et bus simulés ;
 * registre et règles d'équipes réels.
 */

const { roomMock, launchMock, resetMock, bus } = vi.hoisted(() => ({
  roomMock: { updateMany: vi.fn(), findUnique: vi.fn() },
  launchMock: vi.fn(),
  resetMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomMock } }))
vi.mock('@/lib/online-room-launch', () => ({
  launchOnlineRoom: launchMock,
  resetRoomToWaitingLobby: resetMock,
}))
vi.mock('@/lib/online/room-bus', () => bus)

import { startBriefedGame } from './briefing-start'

/** Salle relue après la réclamation : `n` membres restants. */
const claimedRoom = (gameId: string, n: number, settings: Record<string, unknown> = {}) => ({
  id: 'room-1',
  gameId,
  hostUserId: 'p1',
  settingsJson: JSON.stringify({ difficulty: 'normal', lang: 'fr', ...settings }),
  members: Array.from({ length: n }, (_, i) => ({ userId: `p${i + 1}`, user: { displayName: `P${i + 1}` } })),
})

beforeEach(() => {
  vi.resetAllMocks()
  roomMock.updateMany.mockResolvedValue({ count: 1 })
})

describe('startBriefedGame', () => {
  it('réclame la salle briefing → playing, puis lance avec les membres RELUS', async () => {
    const room = claimedRoom('petit-bac', 2)
    roomMock.findUnique.mockResolvedValue(room)

    expect(await startBriefedGame('room-1')).toBe('launched')

    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'room-1', status: 'briefing' },
      data: { status: 'playing', briefingJson: null },
    })
    expect(roomMock.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      roomMock.findUnique.mock.invocationCallOrder[0]
    )
    expect(launchMock).toHaveBeenCalledWith('room-1', room)
    expect(resetMock).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed' })
  })

  it('réclamation perdue (autre ack, tick ou sondage) : rien de plus', async () => {
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    expect(await startBriefedGame('room-1')).toBe('skipped')

    expect(roomMock.findUnique).not.toHaveBeenCalled()
    expect(launchMock).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).not.toHaveBeenCalled()
  })

  it.each([
    ['petit-bac', 1, {}],
    ['telephone-dessine', 2, {}],
    ['mots-codes', 3, {}],
    ['tabou', 3, { tabouTeams: { p1: 'A', p2: 'A', p3: 'B' } }],
  ])('%s réduit à %i pendant le tuto : retour au lobby, aucun lancement', async (gameId, n, settings) => {
    roomMock.findUnique.mockResolvedValue(claimedRoom(gameId, n, settings))

    expect(await startBriefedGame('room-1')).toBe('back_to_lobby')

    expect(launchMock).not.toHaveBeenCalled()
    expect(resetMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('lancement en échec : la salle revient en attente au lieu de rester « playing » sans état', async () => {
    roomMock.findUnique.mockResolvedValue(claimedRoom('petit-bac', 2))
    launchMock.mockRejectedValue(new Error('NOT_ENOUGH_PLAYERS'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await startBriefedGame('room-1')).toBe('back_to_lobby')

    expect(resetMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
    expect(bus.publishRoomChanged).not.toHaveBeenCalledWith('room-1', { type: 'changed' })
  })

  it('salle disparue après la réclamation (dernier membre parti) : rien de plus', async () => {
    roomMock.findUnique.mockResolvedValue(null)

    expect(await startBriefedGame('room-1')).toBe('skipped')

    expect(launchMock).not.toHaveBeenCalled()
    expect(resetMock).not.toHaveBeenCalled()
  })
})
