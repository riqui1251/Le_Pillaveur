import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/online/rooms/[roomId]/action — le coup vaut présence.
 *
 * En partie, GET /state ne rafraîchit pas `lastSeenAt` : c'est le coup joué
 * qui dit au minuteur de service (table abandonnée), à l'écran de fin et au
 * quorum de la relance que le joueur est là. Le cœur de l'action est simulé
 * (room-actions.test.ts le couvre) : seule la présence est tenue ici.
 */

const { userMock, loadMock, applyMock, touchMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  loadMock: vi.fn(),
  applyMock: vi.fn(),
  touchMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online/room-actions', () => ({
  loadActionRoom: loadMock,
  applyActionToRoom: applyMock,
}))
vi.mock('@/lib/online-room', () => ({
  PRESENCE_WRITE_INTERVAL_MS: 30_000,
  touchMemberPresence: touchMock,
}))

import { POST } from './route'

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000)

const loaded = (lastSeenAt: Date) => ({
  ok: true,
  loaded: {
    roomId: 'room-1',
    adapter: {},
    room: { id: 'room-1', gameId: 'menteur', members: [{ userId: 'u1', lastSeenAt }] },
  },
})

const play = () =>
  POST(
    new Request('http://test/api/online/rooms/room-1/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'bid' }),
    }),
    { params: Promise.resolve({ roomId: 'room-1' }) }
  )

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'u1' })
  applyMock.mockResolvedValue({ status: 200, body: { ok: true } })
})

describe('POST /action — présence', () => {
  it('trace de plus de 30 s : le coup la rafraîchit', async () => {
    loadMock.mockResolvedValue(loaded(secondsAgo(45)))

    expect((await play()).status).toBe(200)
    expect(touchMock).toHaveBeenCalledWith('room-1', 'u1')
    expect(applyMock).toHaveBeenCalled()
  })

  it('trace fraîche : aucune écriture (un trait de Crobard par action)', async () => {
    loadMock.mockResolvedValue(loaded(secondsAgo(5)))

    expect((await play()).status).toBe(200)
    expect(touchMock).not.toHaveBeenCalled()
  })

  it('salle refusée (plus membre, partie finie) : rien d’écrit', async () => {
    loadMock.mockResolvedValue({ ok: false, result: { status: 403, body: { error: 'replaced_by_bot' } } })

    expect((await play()).status).toBe(403)
    expect(touchMock).not.toHaveBeenCalled()
    expect(applyMock).not.toHaveBeenCalled()
  })
})
