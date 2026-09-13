import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Suppressions de salle ET journal des parties : la ligne ouverte doit être
 * close AVANT que la salle disparaisse — après, plus rien ne date sa fin et la
 * réconciliation la classe « fiabilité inconnue ». Et une table abandonnée
 * depuis plus longtemps que le seuil de purge est close comme par la purge
 * (dernière écriture), jamais à l'heure où son dernier membre revient.
 * La base est simulée : on vérifie l'ORDRE et le contenu des écritures.
 */
const { roomMock, memberMock, sessionMock } = vi.hoisted(() => ({
  roomMock: { findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
  memberMock: { count: vi.fn() },
  sessionMock: { findMany: vi.fn(), updateMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { onlineRoom: roomMock, onlineRoomMember: memberMock, onlineGameSession: sessionMock },
}))
vi.mock('@/lib/online/room-bus', () => ({ publishRoomChanged: vi.fn() }))

import {
  cleanupStaleActiveRooms,
  cleanupStaleWaitingRooms,
  closeGameSessionBeforeRoomDelete,
  deleteRoomIfEmpty,
  isAbandonedActiveRoom,
} from '@/lib/online-room'

const NOW = new Date('2026-09-12T20:00:00.000Z')
const MINUTE = 60 * 1000
const ago = (ms: number) => new Date(NOW.getTime() - ms)

/** Rang d'appel du premier appel d'une fonction simulée (ordre global). */
const firstCallOrder = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0]

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  roomMock.deleteMany.mockResolvedValue({ count: 1 })
  roomMock.delete.mockResolvedValue({})
  sessionMock.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('purges : fermeture du journal AVANT la suppression', () => {
  it('cleanupStaleActiveRooms ferme à la dernière écriture, puis supprime', async () => {
    const updatedAt = ago(90 * MINUTE)
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', updatedAt }])
    sessionMock.findMany.mockResolvedValue([{ id: 's1', roomId: 'room-1', startedAt: ago(120 * MINUTE) }])

    await cleanupStaleActiveRooms()

    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', endedAt: null },
      data: { endedAt: updatedAt, endReason: 'abandoned' },
    })
    expect(firstCallOrder(sessionMock.findMany)).toBeLessThan(firstCallOrder(roomMock.deleteMany))
    expect(firstCallOrder(sessionMock.updateMany)).toBeLessThan(firstCallOrder(roomMock.deleteMany))
  })

  it('cleanupStaleWaitingRooms ferme aussi avant de supprimer', async () => {
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', updatedAt: ago(10 * MINUTE) }])
    sessionMock.findMany.mockResolvedValue([{ id: 's1', roomId: 'room-1', startedAt: ago(30 * MINUTE) }])

    await cleanupStaleWaitingRooms()

    expect(firstCallOrder(sessionMock.updateMany)).toBeLessThan(firstCallOrder(roomMock.deleteMany))
  })

  it('un journal en panne n’empêche pas la purge', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', updatedAt: ago(90 * MINUTE) }])
    sessionMock.findMany.mockRejectedValue(new Error('base occupée'))

    await cleanupStaleActiveRooms()

    expect(roomMock.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['room-1'] } } })
    errorSpy.mockRestore()
  })
})

describe('deleteRoomIfEmpty', () => {
  it('ferme la partie maintenant (« left »), puis supprime la salle vide', async () => {
    memberMock.count.mockResolvedValue(0)
    roomMock.findUnique.mockResolvedValue({ id: 'room-1', status: 'playing', updatedAt: ago(2 * MINUTE) })

    await deleteRoomIfEmpty('room-1')

    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', endedAt: null },
      data: { endedAt: NOW, endReason: 'left' },
    })
    expect(firstCallOrder(sessionMock.updateMany)).toBeLessThan(firstCallOrder(roomMock.delete))
  })

  it('table abandonnée depuis plus d’une heure : close à sa dernière écriture, pas au retour du joueur', async () => {
    // Onglet fermé en pleine partie à 17 h, retour à 20 h pour créer une table.
    const updatedAt = ago(3 * 60 * MINUTE)
    memberMock.count.mockResolvedValue(0)
    roomMock.findUnique.mockResolvedValue({ id: 'room-1', status: 'playing', updatedAt })
    sessionMock.findMany.mockResolvedValue([{ id: 's1', roomId: 'room-1', startedAt: ago(200 * MINUTE) }])

    await deleteRoomIfEmpty('room-1')

    expect(sessionMock.updateMany).toHaveBeenCalledTimes(1)
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', endedAt: null },
      data: { endedAt: updatedAt, endReason: 'abandoned' },
    })
    expect(firstCallOrder(sessionMock.updateMany)).toBeLessThan(firstCallOrder(roomMock.delete))
  })

  it('ne touche à rien tant qu’il reste un membre', async () => {
    memberMock.count.mockResolvedValue(1)

    await deleteRoomIfEmpty('room-1')

    expect(sessionMock.updateMany).not.toHaveBeenCalled()
    expect(roomMock.delete).not.toHaveBeenCalled()
  })
})

describe('closeGameSessionBeforeRoomDelete (départ du dernier membre, fermeture par le staff)', () => {
  it('garde le motif de l’appelant pour une table vivante', async () => {
    await closeGameSessionBeforeRoomDelete(
      { id: 'room-1', status: 'playing', updatedAt: ago(20 * MINUTE) },
      'staff'
    )

    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', endedAt: null },
      data: { endedAt: NOW, endReason: 'staff' },
    })
  })

  it('une salle revenue au lobby n’est jamais traitée en abandon de partie', () => {
    expect(isAbandonedActiveRoom({ status: 'waiting', updatedAt: ago(5 * 60 * MINUTE) }, NOW.getTime())).toBe(false)
    expect(isAbandonedActiveRoom({ status: 'briefing', updatedAt: ago(61 * MINUTE) }, NOW.getTime())).toBe(true)
    expect(isAbandonedActiveRoom({ status: 'playing', updatedAt: ago(59 * MINUTE) }, NOW.getTime())).toBe(false)
  })

  it('ne lève jamais : quitter une table ne dépend pas du journal', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sessionMock.updateMany.mockRejectedValue(new Error('base occupée'))

    await expect(
      closeGameSessionBeforeRoomDelete({ id: 'room-1', status: 'playing', updatedAt: NOW }, 'left')
    ).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })
})
