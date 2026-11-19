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
import { getGameAdapter } from '@/lib/online/game-adapters'

/** Salle en briefing ; `acks` : qui a déjà validé le tuto. */
const briefingRoom = (
  gameId: string,
  userIds: string[],
  acks: string[] = [],
  settings: Record<string, unknown> | null = null
) => ({
  id: 'room-1',
  status: 'briefing',
  gameId,
  hostUserId: userIds[0],
  settingsJson: settings ? JSON.stringify(settings) : null,
  gameStateJson: null,
  stateVersion: 0,
  briefingJson: JSON.stringify({ startedAt: Date.now(), acks }),
  members: userIds.map((userId) => ({ userId, user: { displayName: userId } })),
})

const BACK_TO_LOBBY = {
  where: { id: 'room-1', status: 'briefing' },
  data: { status: 'waiting', briefingJson: null },
}

const expectBackToLobby = (res: Response) => {
  expect(res.status).toBe(200)
  expect(roomMock.updateMany).toHaveBeenCalledTimes(1)
  expect(roomMock.updateMany).toHaveBeenCalledWith(BACK_TO_LOBBY)
  expect(resetMock).toHaveBeenCalledWith('room-1')
  expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  expect(launchMock).not.toHaveBeenCalled()
}

const expectLaunched = (res: Response, gameId: string) => {
  expect(res.status).toBe(200)
  expect(roomMock.updateMany).toHaveBeenCalledWith({
    where: { id: 'room-1', status: 'briefing' },
    data: { status: 'playing', briefingJson: null },
  })
  expect(launchMock).toHaveBeenCalledWith('room-1', expect.objectContaining({ gameId }))
  expect(resetMock).not.toHaveBeenCalled()
}

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
    // Lancé à 2 sans bot, l'autre est parti pendant le briefing : le lanceur ajoute un bot d'office.
    roomMock.findUnique.mockResolvedValue(briefingRoom('chiffre-piege', ['u1']))

    await ack('u1')

    expect(launchMock).toHaveBeenCalledWith('room-1', expect.objectContaining({ gameId: 'chiffre-piege' }))
    expect(resetMock).not.toHaveBeenCalled()
  })
})

describe('POST /briefing-ack — effectif revérifié avant le lancement', () => {
  it('Téléphone Dessiné lancé à 3, un parti pendant le briefing : retour au lobby', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('telephone-dessine', ['u1', 'u2'], ['u2']))
    expectBackToLobby(await ack('u1'))
  })

  it('Téléphone Dessiné à 3 au complet : lance', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('telephone-dessine', ['u1', 'u2', 'u3'], ['u2', 'u3']))
    expectLaunched(await ack('u1'), 'telephone-dessine')
  })

  it('Petit Bac lancé à 2, un parti : retour au lobby', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('petit-bac', ['u1']))
    expectBackToLobby(await ack('u1'))
  })

  it('Petit Bac à 2 au complet : lance', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('petit-bac', ['u1', 'u2'], ['u2']))
    expectLaunched(await ack('u1'), 'petit-bac')
  })

  it('Mots Codés lancé à 4, un parti : retour au lobby', async () => {
    roomMock.findUnique.mockResolvedValue(briefingRoom('mots-codes', ['u1', 'u2', 'u3'], ['u2', 'u3']))
    expectBackToLobby(await ack('u1'))
  })

  it('Mots Codés à 4 au complet : lance', async () => {
    roomMock.findUnique.mockResolvedValue(
      briefingRoom('mots-codes', ['u1', 'u2', 'u3', 'u4'], ['u2', 'u3', 'u4'])
    )
    expectLaunched(await ack('u1'), 'mots-codes')
  })

  it('jeu à bots repassé sous le minimum : la décision revient au lanceur', async () => {
    const min = getGameAdapter('imposteur')!.minPlayers
    // Lancé pile au minimum avec 2 humains, l'un d'eux part pendant le briefing.
    roomMock.findUnique.mockResolvedValue(briefingRoom('imposteur', ['u1'], [], { botsCount: min - 2 }))
    expectLaunched(await ack('u1'), 'imposteur')
  })

  it('jeu à bots repassé sous le minimum, lanceur qui lève : retour au lobby', async () => {
    const min = getGameAdapter('imposteur')!.minPlayers
    roomMock.findUnique.mockResolvedValue(briefingRoom('imposteur', ['u1'], [], { botsCount: min - 2 }))
    launchMock.mockRejectedValue(new Error('NOT_ENOUGH_PLAYERS'))

    const res = await ack('u1')

    expect(res.status).toBe(200)
    expect(roomMock.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'waiting' }) })
    )
    expect(resetMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('jeu à bots au minimum, personne parti : lance', async () => {
    const min = getGameAdapter('imposteur')!.minPlayers
    roomMock.findUnique.mockResolvedValue(briefingRoom('imposteur', ['u1', 'u2'], ['u2'], { botsCount: min - 2 }))
    expectLaunched(await ack('u1'), 'imposteur')
  })

  it('timeout : la même garde s’applique', async () => {
    const room = briefingRoom('telephone-dessine', ['u1', 'u2'])
    room.briefingJson = JSON.stringify({ startedAt: Date.now() - 10 * 60 * 1000, acks: [] })
    roomMock.findUnique.mockResolvedValue(room)
    userMock.mockResolvedValue({ id: 'u1' })

    const res = await POST(
      new Request('http://test/api/online/rooms/room-1/briefing-ack', {
        method: 'POST',
        body: JSON.stringify({ timeout: true }),
      }),
      { params: Promise.resolve({ roomId: 'room-1' }) }
    )

    expectBackToLobby(res)
  })
})

describe('POST /briefing-ack — lanceur qui lève', () => {
  it('la salle revient au lobby au lieu de rester « playing » sans état, réponse 200', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    roomMock.findUnique.mockResolvedValue(briefingRoom('telephone-dessine', ['u1', 'u2', 'u3'], ['u2', 'u3']))
    launchMock.mockRejectedValue(new Error('NOT_ENOUGH_PLAYERS'))

    const res = await ack('u1')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ room: { id: 'room-1' } })
    expect(roomMock.updateMany).toHaveBeenCalledTimes(2)
    expect(roomMock.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'room-1', status: 'playing', stateVersion: 0 },
      data: { status: 'waiting', gameStateJson: null, stateVersion: 0, currentTurnUserId: null },
    })
    expect(resetMock).toHaveBeenCalledWith('room-1')
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('état déjà écrit avant l’exception : la partie est gardée, pas de remise à zéro', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    roomMock.findUnique.mockResolvedValue(briefingRoom('telephone-dessine', ['u1', 'u2', 'u3'], ['u2', 'u3']))
    launchMock.mockRejectedValue(new Error('après écriture'))
    roomMock.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    const res = await ack('u1')

    expect(res.status).toBe(200)
    expect(resetMock).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'changed' })
    expect(bus.publishRoomChanged).not.toHaveBeenCalledWith('room-1', { type: 'lobby' })
    errorSpy.mockRestore()
  })
})
