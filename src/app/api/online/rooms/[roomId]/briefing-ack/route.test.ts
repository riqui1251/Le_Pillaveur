import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/online/rooms/[roomId]/briefing-ack — la vraie route et la vraie
 * fin de briefing (briefing-start.ts), sur une salle en mémoire dont chaque
 * accès rend la main (deux requêtes simultanées s'entrelacent comme en
 * production). Lanceur, DTO, session et bus simulés.
 */

type MemRoom = {
  id: string
  status: string
  gameId: string
  hostUserId: string
  settingsJson: string | null
  briefingJson: string | null
  gameStateJson: string | null
  members: string[]
}

const { db, userMock, roomMock, launchMock, resetMock, bus } = vi.hoisted(() => ({
  db: { room: null as MemRoom | null },
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  launchMock: vi.fn(),
  resetMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomMock } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({
  buildRoomDto: async () => ({ status: db.room?.status ?? null }),
}))
vi.mock('@/lib/online-room-launch', () => ({
  launchOnlineRoom: launchMock,
  resetRoomToWaitingLobby: resetMock,
}))
vi.mock('@/lib/online/room-bus', () => bus)

import { POST } from './route'
import { BRIEFING_TIMEOUT_MS, parseBriefing } from '@/lib/online/briefing'

const yieldTurn = () => new Promise((resolve) => setTimeout(resolve, 0))

const briefingRoom = (gameId: string, members: string[], briefing = { startedAt: Date.now(), acks: [] as string[] }): MemRoom => ({
  id: 'room-1',
  status: 'briefing',
  gameId,
  hostUserId: members[0],
  settingsJson: JSON.stringify({ difficulty: 'normal', lang: 'fr' }),
  briefingJson: JSON.stringify(briefing),
  gameStateJson: null,
  members,
})

const ack = (body: unknown = {}) =>
  POST(
    new Request('http://test/api/online/rooms/room-1/briefing-ack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ roomId: 'room-1' }) }
  )

const acks = () => parseBriefing(db.room?.briefingJson)?.acks ?? []

beforeEach(() => {
  vi.resetAllMocks()
  roomMock.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    await yieldTurn()
    const room = db.room
    if (!room || room.id !== where.id) return null
    return {
      ...room,
      members: room.members.map((userId) => ({ userId, user: { displayName: userId.toUpperCase() } })),
    }
  })
  roomMock.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Partial<MemRoom> }) => {
      await yieldTurn()
      const room = db.room as Record<string, unknown> | null
      if (!room || Object.entries(where).some(([key, value]) => room[key] !== value)) return { count: 0 }
      Object.assign(room, data)
      return { count: 1 }
    }
  )
  // Écriture SANS condition (l'ancien chemin de l'ack) : elle écrase.
  roomMock.update.mockImplementation(async ({ data }: { data: Partial<MemRoom> }) => {
    await yieldTurn()
    if (db.room) Object.assign(db.room, data)
    return db.room
  })
  launchMock.mockImplementation(async () => {
    if (db.room) db.room.gameStateJson = '{"phase":"play"}'
  })
  resetMock.mockImplementation(async () => {
    if (db.room) Object.assign(db.room, { status: 'waiting', gameStateJson: null })
  })
})

describe('POST /briefing-ack — acks simultanés', () => {
  it('deux « prêt » dans la même seconde : aucun ack perdu, la partie démarre une fois', async () => {
    db.room = briefingRoom('petit-bac', ['a', 'b'])
    userMock.mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce({ id: 'b' })

    const [first, second] = await Promise.all([ack(), ack()])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(db.room.status).toBe('playing')
    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(roomMock.update).not.toHaveBeenCalled()
  })

  it('un seul « prêt » sur deux : l’ack est écrit par compare-and-swap, la partie attend', async () => {
    db.room = briefingRoom('petit-bac', ['a', 'b'])
    userMock.mockResolvedValue({ id: 'a' })

    const res = await ack()

    expect(res.status).toBe(200)
    expect(acks()).toEqual(['a'])
    expect(db.room.status).toBe('briefing')
    expect(launchMock).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed' })
  })
})

describe('POST /briefing-ack — départ pendant le tuto', () => {
  it.each([
    ['petit-bac', ['a']],
    ['telephone-dessine', ['a', 'b']],
    ['mots-codes', ['a', 'b', 'c']],
  ])('%s : le dernier ack ramène la table au lobby au lieu de la figer', async (gameId, members) => {
    db.room = briefingRoom(gameId, members, { startedAt: Date.now(), acks: members.slice(1) })
    userMock.mockResolvedValue({ id: members[0] })

    const res = await ack()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ room: { status: 'waiting' } })
    expect(launchMock).not.toHaveBeenCalled()
    expect(resetMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('Tabou réduit à 2 contre 1 : pas de partie complétée par un bot', async () => {
    db.room = {
      ...briefingRoom('tabou', ['a', 'b', 'c'], { startedAt: Date.now(), acks: ['b', 'c'] }),
      settingsJson: JSON.stringify({ lang: 'fr', tabouTeams: { a: 'A', b: 'A', c: 'B' } }),
    }
    userMock.mockResolvedValue({ id: 'a' })

    await ack()

    expect(launchMock).not.toHaveBeenCalled()
    expect(db.room.status).toBe('waiting')
  })

  it('lancement en échec : la salle revient en attente', async () => {
    db.room = briefingRoom('petit-bac', ['a', 'b'], { startedAt: Date.now(), acks: ['b'] })
    userMock.mockResolvedValue({ id: 'a' })
    launchMock.mockRejectedValue(new Error('NOT_ENOUGH_PLAYERS'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await ack()

    expect(res.status).toBe(200)
    expect(db.room.status).toBe('waiting')
  })
})

describe('POST /briefing-ack — tick de timeout et corps', () => {
  it('échéance passée : le tick lance sans ack de l’absent', async () => {
    db.room = briefingRoom('petit-bac', ['a', 'b'], { startedAt: Date.now() - BRIEFING_TIMEOUT_MS - 1, acks: ['a'] })
    userMock.mockResolvedValue({ id: 'a' })

    await ack({ timeout: true })

    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(db.room.status).toBe('playing')
  })

  it('tick trop tôt pour l’horloge du serveur : rien', async () => {
    db.room = briefingRoom('petit-bac', ['a', 'b'], { startedAt: Date.now() - 1_000, acks: ['a'] })
    userMock.mockResolvedValue({ id: 'a' })

    await ack({ timeout: true })

    expect(launchMock).not.toHaveBeenCalled()
    expect(db.room.status).toBe('briefing')
  })

  it('corps de plus de 1 Ko : 413, rien écrit', async () => {
    db.room = briefingRoom('petit-bac', ['a', 'b'])
    userMock.mockResolvedValue({ id: 'a' })

    const res = await ack({ pad: 'x'.repeat(2048) })

    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('payload_too_large')
    expect(acks()).toEqual([])
  })

  it('hors de la table : 403', async () => {
    db.room = briefingRoom('petit-bac', ['a', 'b'])
    userMock.mockResolvedValue({ id: 'intrus' })

    const res = await ack()

    expect(res.status).toBe(403)
    expect(acks()).toEqual([])
  })
})
