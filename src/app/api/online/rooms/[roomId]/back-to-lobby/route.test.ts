import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/online/rooms/[roomId]/back-to-lobby : une partie FINIE revient à
 * la table d'attente, même salle, même code. Ces tests appellent la vraie
 * route (base, session, adaptateur et bus simulés) et tiennent ses trois
 * gardes : partie vraiment terminée, bon demandeur (l'hôte, ou un présent si
 * l'hôte s'est absenté), et une écriture qui ne double pas une relance.
 */

const { userMock, roomMock, dtoMock, touchMock, resetMock, adapterMock, bus, cache } = vi.hoisted(() => ({
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn(), updateMany: vi.fn() },
  dtoMock: vi.fn(),
  touchMock: vi.fn(),
  resetMock: vi.fn(),
  adapterMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
  cache: { invalidateLobbiesCache: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomMock } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({ buildRoomDto: dtoMock, touchMemberPresence: touchMock }))
vi.mock('@/lib/online-room-launch', () => ({
  // Même valeur que la fenêtre du vote « Rejouer » (online-room-launch.ts).
  REMATCH_PRESENCE_MS: 90_000,
  resetRoomToWaitingLobby: resetMock,
}))
vi.mock('@/lib/online/game-adapters', () => ({ getGameAdapter: adapterMock }))
vi.mock('@/lib/online/room-bus', () => bus)
vi.mock('@/lib/online/lobbies-cache', () => cache)

import { POST } from './route'

/** Adaptateur minimal : l'état porte sa phase, `finished` = partie terminée. */
const fakeAdapter = {
  parse: (json: string | null) => (json ? JSON.parse(json) : null),
  isFinished: (state: unknown) => (state as { phase: string }).phase === 'finished',
}

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000)

/** Salle en fin de partie : l'hôte et Alice, vus à l'instant. */
const finishedRoom = (over: Record<string, unknown> = {}) => ({
  id: 'room-1',
  status: 'playing',
  gameId: 'menteur',
  hostUserId: 'host',
  gameStateJson: JSON.stringify({ phase: 'finished' }),
  stateVersion: 12,
  members: [
    { userId: 'host', lastSeenAt: secondsAgo(5) },
    { userId: 'alice', lastSeenAt: secondsAgo(5) },
  ],
  ...over,
})

const call = (userId: string) => {
  userMock.mockResolvedValue({ id: userId })
  return POST(new Request('http://test/api/online/rooms/room-1/back-to-lobby', { method: 'POST' }), {
    params: Promise.resolve({ roomId: 'room-1' }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  adapterMock.mockReturnValue(fakeAdapter)
  roomMock.updateMany.mockResolvedValue({ count: 1 })
  dtoMock.mockResolvedValue({ id: 'room-1', status: 'waiting' })
})

describe('POST /back-to-lobby — droits', () => {
  it('l’hôte ramène la table : réclamation sur la version lue, remise à zéro, lobby publié', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom())

    const res = await call('host')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ room: { id: 'room-1', status: 'waiting' } })
    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'room-1', status: 'playing', stateVersion: 12 },
      data: { status: 'waiting', gameStateJson: null, stateVersion: 0, currentTurnUserId: null },
    })
    expect(resetMock).toHaveBeenCalledWith('room-1')
    expect(cache.invalidateLobbiesCache).toHaveBeenCalled()
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('un membre ne peut pas ramener la table quand l’hôte est là', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom())

    const res = await call('alice')

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('not_host')
    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(resetMock).not.toHaveBeenCalled()
  })

  it('un membre présent ramène la table quand l’hôte s’est absenté (> fenêtre du vote)', async () => {
    roomMock.findUnique.mockResolvedValue(
      finishedRoom({
        members: [
          { userId: 'host', lastSeenAt: secondsAgo(120) },
          { userId: 'alice', lastSeenAt: secondsAgo(5) },
        ],
      })
    )

    const res = await call('alice')

    expect(res.status).toBe(200)
    expect(resetMock).toHaveBeenCalledWith('room-1')
  })

  it('un membre ramène la table quand l’hôte n’y siège plus du tout', async () => {
    roomMock.findUnique.mockResolvedValue(
      finishedRoom({ members: [{ userId: 'alice', lastSeenAt: secondsAgo(5) }] })
    )

    expect((await call('alice')).status).toBe(200)
  })

  it('refuse qui n’est pas à la table', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom())

    const res = await call('intrus')

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
  })

  it('401 sans session, 404 sans salle', async () => {
    userMock.mockResolvedValue(null)
    const anonymous = await POST(new Request('http://test/x', { method: 'POST' }), {
      params: Promise.resolve({ roomId: 'room-1' }),
    })
    expect(anonymous.status).toBe(401)

    roomMock.findUnique.mockResolvedValue(null)
    expect((await call('host')).status).toBe(404)
  })
})

describe('POST /back-to-lobby — partie non finie', () => {
  it('refuse une partie en cours', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom({ gameStateJson: JSON.stringify({ phase: 'bidding' }) }))

    const res = await call('host')

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('game_not_finished')
    expect(roomMock.updateMany).not.toHaveBeenCalled()
  })

  it('refuse pendant la relance (version sentinelle, état terminé remis un instant)', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom({ stateVersion: -1 }))

    const res = await call('host')

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('game_not_finished')
  })

  it('refuse un briefing', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom({ status: 'briefing' }))

    expect((await call('host')).status).toBe(409)
  })

  it('table déjà revenue en attente : succès sans rien réécrire', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom({ status: 'waiting', gameStateJson: null, stateVersion: 0 }))

    const res = await call('alice')

    expect(res.status).toBe(200)
    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(resetMock).not.toHaveBeenCalled()
  })
})

describe('fenêtre de présence', () => {
  /**
   * Trois lecteurs, une seule fenêtre : le quorum de la relance
   * (REMATCH_PRESENCE_MS), l'hôte « absent » de cette route (même constante)
   * et `members[].present` du DTO (MEMBER_PRESENT_MS, recopiée pour ne pas
   * boucler les imports). Le compteur de l'écran de fin doit compter ceux que
   * la relance compte.
   */
  // Délai large : les vrais modules tirent tous les lanceurs et leurs moteurs,
  // transformés à froid — 3 s seul, et plus de 5 s (le défaut de vitest) sous
  // la charge de la suite complète, sans que rien ne soit en cause.
  it('le DTO et la relance tiennent la même fenêtre', { timeout: 30_000 }, async () => {
    const room = await vi.importActual<typeof import('@/lib/online-room')>('@/lib/online-room')
    const launch = await vi.importActual<typeof import('@/lib/online-room-launch')>(
      '@/lib/online-room-launch'
    )
    expect(room.MEMBER_PRESENT_MS).toBe(launch.REMATCH_PRESENCE_MS)
  })
})

describe('POST /back-to-lobby — course d’écriture', () => {
  it('un vote « Rejouer » passé entre-temps : relit et retente sur la nouvelle version', async () => {
    roomMock.findUnique
      .mockResolvedValueOnce(finishedRoom({ stateVersion: 12 }))
      .mockResolvedValueOnce(finishedRoom({ stateVersion: 13 }))
    roomMock.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    const res = await call('host')

    expect(res.status).toBe(200)
    expect(roomMock.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'room-1', status: 'playing', stateVersion: 13 } })
    )
    expect(resetMock).toHaveBeenCalledTimes(1)
  })

  it('la relance a gagné la course : refus, rien de remis à zéro', async () => {
    roomMock.findUnique
      .mockResolvedValueOnce(finishedRoom())
      .mockResolvedValueOnce(finishedRoom({ gameStateJson: JSON.stringify({ phase: 'bidding' }), stateVersion: 1 }))
    roomMock.updateMany.mockResolvedValueOnce({ count: 0 })

    const res = await call('host')

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('game_not_finished')
    expect(resetMock).not.toHaveBeenCalled()
  })

  it('course perdue trois fois : conflict', async () => {
    roomMock.findUnique.mockResolvedValue(finishedRoom())
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    const res = await call('host')

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('conflict')
    expect(roomMock.updateMany).toHaveBeenCalledTimes(3)
    expect(resetMock).not.toHaveBeenCalled()
  })
})
