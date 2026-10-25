import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT /api/online/rooms/[roomId]/team — la vraie route sur une salle en
 * mémoire dont chaque accès rend la main : deux choix simultanés s'entrelacent
 * comme en production. DTO, session et bus simulés.
 */

type MemRoom = {
  id: string
  status: string
  gameId: string
  settingsJson: string | null
  members: string[]
}

const { db, userMock, roomMock, bus } = vi.hoisted(() => ({
  db: { room: null as MemRoom | null },
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  bus: { publishRoomChanged: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomMock } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({ buildRoomDto: async () => ({ id: 'room-1' }) }))
vi.mock('@/lib/online/room-bus', () => bus)

import { PUT } from './route'

const yieldTurn = () => new Promise((resolve) => setTimeout(resolve, 0))

const pick = (body: unknown) =>
  PUT(
    new Request('http://test/api/online/rooms/room-1/team', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ roomId: 'room-1' }) }
  )

const teams = (key: string) => (JSON.parse(db.room?.settingsJson ?? '{}') as Record<string, unknown>)[key]

beforeEach(() => {
  vi.resetAllMocks()
  roomMock.findUnique.mockImplementation(async () => {
    await yieldTurn()
    const room = db.room
    return room ? { ...room, members: room.members.map((userId) => ({ userId })) } : null
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
  // Écriture SANS condition (l'ancien chemin) : elle écrase.
  roomMock.update.mockImplementation(async ({ data }: { data: Partial<MemRoom> }) => {
    await yieldTurn()
    if (db.room) Object.assign(db.room, data)
    return db.room
  })
})

describe('PUT /team — choix simultanés', () => {
  it('deux joueurs choisissent dans la même seconde : les deux choix restent', async () => {
    db.room = { id: 'room-1', status: 'waiting', gameId: 'tabou', settingsJson: '{"lang":"fr"}', members: ['a', 'b', 'c'] }
    userMock.mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce({ id: 'b' })

    const [first, second] = await Promise.all([pick({ team: 'A' }), pick({ team: 'B' })])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(teams('tabouTeams')).toEqual({ a: 'A', b: 'B' })
    expect(JSON.parse(db.room.settingsJson!).lang).toBe('fr')
  })

  it('team_full refait sur l’état frais : la dernière place ne se prend pas deux fois', async () => {
    // Toucher-Coulé 1v1 : une place par équipe.
    db.room = { id: 'room-1', status: 'waiting', gameId: 'toucher-coule', settingsJson: '{}', members: ['a', 'b'] }
    userMock.mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce({ id: 'b' })

    const results = await Promise.all([pick({ team: 'A' }), pick({ team: 'A' })])

    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(Object.keys(teams('tcTeams') as object)).toHaveLength(1)
  })
})

describe('PUT /team — corps', () => {
  beforeEach(() => {
    db.room = { id: 'room-1', status: 'waiting', gameId: 'tabou', settingsJson: '{}', members: ['a'] }
    userMock.mockResolvedValue({ id: 'a' })
  })

  it('plus de 1 Ko : 413, rien écrit', async () => {
    const res = await pick({ team: 'A', pad: 'x'.repeat(2048) })

    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('payload_too_large')
    expect(db.room!.settingsJson).toBe('{}')
  })

  it('équipe inconnue : invalid_team', async () => {
    const res = await pick({ team: 'C' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_team')
  })

  it('hors de la table : 403 avant toute lecture du corps', async () => {
    userMock.mockResolvedValue({ id: 'intrus' })

    const res = await pick({ team: 'A' })

    expect(res.status).toBe(403)
    expect(roomMock.updateMany).not.toHaveBeenCalled()
  })
})
