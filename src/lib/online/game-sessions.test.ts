import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

/**
 * Le journal des parties tient sur trois promesses, testées ici :
 *  - un participant est SOIT un compte (référence, jamais de pseudo recopié),
 *    SOIT un bot (nom d'affichage) ;
 *  - une revanche ouvre une NOUVELLE partie et ferme la précédente ;
 *  - une partie dont la salle a disparu cesse d'être annoncée « en cours ».
 * La base est simulée : on vérifie les écritures demandées, pas Prisma.
 */
const { roomMock, sessionMock } = vi.hoisted(() => ({
  roomMock: { findUnique: vi.fn(), findMany: vi.fn() },
  sessionMock: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { onlineRoom: roomMock, onlineGameSession: sessionMock },
}))

import {
  closeGameSession,
  closeOrphanGameSessions,
  listGameSessions,
  listRecentLaunches,
  recordGameSessionStart,
  summarizeRecentLaunches,
} from '@/lib/online/game-sessions'

/** Ce que `create` a reçu, sous une forme lisible. */
const createdData = () => sessionMock.create.mock.calls[0][0].data
const createdParticipants = () =>
  createdData().participants.create as { seat: number; userId: string | null; botName: string | null }[]

beforeEach(() => {
  vi.resetAllMocks()
  sessionMock.updateMany.mockResolvedValue({ count: 0 })
  sessionMock.create.mockResolvedValue({})
  sessionMock.count.mockResolvedValue(0)
  sessionMock.findMany.mockResolvedValue([])
  roomMock.findMany.mockResolvedValue([])
})

describe('recordGameSessionStart', () => {
  it('sépare les comptes des bots et compte l’effectif réel', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ABCD',
      gameId: 'menteur',
      gameStateJson: JSON.stringify({
        players: [
          { id: 'u1', name: 'Alice', isBot: false },
          { id: 'u2', name: 'Bob', isBot: false },
          { id: 'bot-1', name: 'Gépéto', isBot: true },
        ],
      }),
      members: [{ userId: 'u1' }, { userId: 'u2' }],
    })

    await recordGameSessionStart('room-1')

    expect(createdData()).toMatchObject({
      roomId: 'room-1',
      code: 'ABCD',
      gameId: 'menteur',
      playerCount: 3,
      humanCount: 2,
    })
    // Aucun pseudo humain recopié : seul le bot porte un nom.
    expect(createdParticipants()).toEqual([
      { seat: 0, userId: 'u1', botName: null },
      { seat: 1, userId: 'u2', botName: null },
      { seat: 2, userId: null, botName: 'Gépéto' },
    ])
  })

  it('ne recopie JAMAIS le pseudo d’un humain, même introuvable dans les membres', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ABCD',
      gameId: 'quiz',
      gameStateJson: JSON.stringify({
        players: [
          { id: 'u1', name: 'Alice', isBot: false },
          { id: 'fantome', name: 'Bernard', isBot: false },
        ],
      }),
      members: [{ userId: 'u1' }],
    })

    await recordGameSessionStart('room-1')

    // `botName` porterait le pseudo d'un humain, donc une copie qui survivrait
    // à la suppression de son compte : le siège est gardé, sans nom.
    expect(createdParticipants()[1]).toEqual({ seat: 1, userId: null, botName: null })
    expect(createdData().humanCount).toBe(1)
  })

  it('rattache un joueur dont l’id est préfixé par la convention online-', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ABCD',
      gameId: 'petit-buveur',
      gameStateJson: JSON.stringify({
        players: [{ id: 'online-u1', name: 'Alice', isBot: false }],
      }),
      members: [{ userId: 'u1' }],
    })

    await recordGameSessionStart('room-1')

    expect(createdParticipants()[0]).toEqual({ seat: 0, userId: 'u1', botName: null })
    expect(createdData().humanCount).toBe(1)
  })

  it('retombe sur les membres quand l’état du jeu n’expose aucune table', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ABCD',
      gameId: 'pmu',
      gameStateJson: null,
      members: [{ userId: 'u1' }, { userId: 'u2' }],
    })

    await recordGameSessionStart('room-1')

    expect(createdData()).toMatchObject({ playerCount: 2, humanCount: 2 })
    expect(createdParticipants().every((p) => p.botName === null)).toBe(true)
  })

  it('revanche : la partie précédente est fermée avant d’en ouvrir une autre', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ABCD',
      gameId: 'menteur',
      gameStateJson: null,
      members: [{ userId: 'u1' }],
    })

    await recordGameSessionStart('room-1')

    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', endedAt: null },
      data: { endedAt: expect.any(Date) },
    })
    expect(sessionMock.create).toHaveBeenCalledTimes(1)
  })

  it('ne journalise rien pour une salle sans jeu, et ne lève jamais', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ABCD',
      gameId: null,
      gameStateJson: null,
      members: [],
    })
    await expect(recordGameSessionStart('room-1')).resolves.toBeUndefined()
    expect(sessionMock.create).not.toHaveBeenCalled()

    roomMock.findUnique.mockRejectedValue(new Error('base indisponible'))
    await expect(recordGameSessionStart('room-1')).resolves.toBeUndefined()
  })
})

describe('closeGameSession', () => {
  it('ferme la partie en cours de la salle', async () => {
    const client = {
      onlineGameSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaClient
    const endedAt = new Date('2026-09-10T20:00:00.000Z')

    expect(await closeGameSession(client, 'room-1', endedAt)).toBe(1)
    expect(client.onlineGameSession.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', endedAt: null },
      data: { endedAt },
    })
  })

  it('ne casse pas une fin de partie quand le client ignore le modèle', async () => {
    expect(await closeGameSession({} as unknown as PrismaClient, 'room-1')).toBe(0)
  })
})

describe('closeOrphanGameSessions', () => {
  it('ferme les parties dont la salle a disparu et laisse vivre les autres', async () => {
    sessionMock.findMany.mockResolvedValue([
      { id: 's-vivante', roomId: 'room-1', startedAt: new Date() },
      { id: 's-orpheline', roomId: 'room-2', startedAt: new Date() },
    ])
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', status: 'playing' }])
    sessionMock.updateMany.mockResolvedValue({ count: 1 })

    expect(await closeOrphanGameSessions()).toBe(1)
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s-orpheline'] } },
      data: { endedAt: expect.any(Date) },
    })
  })

  it('ferme aussi une partie qui traîne depuis plus de 12 h, salle vivante ou non', async () => {
    const vieux = new Date(Date.now() - 13 * 60 * 60 * 1000)
    sessionMock.findMany.mockResolvedValue([{ id: 's-figee', roomId: 'room-1', startedAt: vieux }])
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', status: 'playing' }])
    sessionMock.updateMany.mockResolvedValue({ count: 1 })

    expect(await closeOrphanGameSessions()).toBe(1)
  })

  it('ferme la partie d’une salle revenue au lobby (elle existe, mais ne joue plus)', async () => {
    sessionMock.findMany.mockResolvedValue([
      { id: 's-au-lobby', roomId: 'room-1', startedAt: new Date() },
    ])
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', status: 'waiting' }])
    sessionMock.updateMany.mockResolvedValue({ count: 1 })

    expect(await closeOrphanGameSessions()).toBe(1)
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s-au-lobby'] } },
      data: { endedAt: expect.any(Date) },
    })
  })

  it('ne touche à rien quand toutes les salles vivent encore', async () => {
    sessionMock.findMany.mockResolvedValue([
      { id: 's-vivante', roomId: 'room-1', startedAt: new Date() },
    ])
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', status: 'playing' }])

    expect(await closeOrphanGameSessions()).toBe(0)
    expect(sessionMock.updateMany).not.toHaveBeenCalled()
  })
})

describe('listGameSessions', () => {
  it('résout les noms à la lecture et affiche « compte supprimé » quand la référence est tombée', async () => {
    sessionMock.findMany.mockResolvedValue([
      {
        id: 's1',
        roomId: 'room-1',
        code: 'ABCD',
        gameId: 'menteur',
        startedAt: new Date('2026-09-10T20:00:00.000Z'),
        endedAt: new Date('2026-09-10T20:12:00.000Z'),
        playerCount: 3,
        humanCount: 2,
        participants: [
          { id: 'p1', userId: 'u1', botName: null, user: { displayName: 'Alice' } },
          { id: 'p2', userId: null, botName: null, user: null },
          { id: 'p3', userId: null, botName: 'Gépéto', user: null },
        ],
      },
    ])
    sessionMock.count.mockResolvedValue(1)

    const { sessions, total } = await listGameSessions({ skip: 0, take: 20 })

    expect(total).toBe(1)
    expect(sessions[0]).toMatchObject({ durationSeconds: 720, botCount: 1, gameTitle: 'Le Menteur' })
    expect(sessions[0].participants).toEqual([
      { id: 'p1', kind: 'account', name: 'Alice', userId: 'u1' },
      { id: 'p2', kind: 'deleted', name: null, userId: null },
      { id: 'p3', kind: 'bot', name: 'Gépéto', userId: null },
    ])
  })

  it('laisse « en cours » (durée nulle) une partie qui tourne encore', async () => {
    sessionMock.findMany.mockResolvedValue([
      {
        id: 's1',
        roomId: 'room-1',
        code: 'ABCD',
        gameId: 'inconnu',
        startedAt: new Date(),
        endedAt: null,
        playerCount: 2,
        humanCount: 2,
        participants: [],
      },
    ])
    sessionMock.count.mockResolvedValue(1)

    const { sessions } = await listGameSessions({ skip: 0, take: 20 })
    expect(sessions[0].endedAt).toBeNull()
    expect(sessions[0].durationSeconds).toBeNull()
    // Jeu retiré du catalogue : on affiche son identifiant plutôt que rien.
    expect(sessions[0].gameTitle).toBe('inconnu')
  })
})

describe('recordGameSessionStart, visibilité', () => {
  it('fige la visibilité de la table au moment du lancement', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ZZZZ',
      gameId: 'quiz',
      visibility: 'private',
      gameStateJson: null,
      members: [{ userId: 'u1' }],
    })

    await recordGameSessionStart('room-9')

    expect(createdData().visibility).toBe('private')
  })
})

describe('summarizeRecentLaunches', () => {
  const NOW = new Date('2026-09-10T12:00:00Z').getTime()
  const minutesAgo = (m: number) => new Date(NOW - m * 60_000)

  it('détaille une table publique et laisse une table privée anonyme', () => {
    const items = summarizeRecentLaunches(
      [
        {
          id: 's1',
          gameId: 'menteur',
          visibility: 'public',
          playerCount: 4,
          startedAt: minutesAgo(3),
        },
        {
          id: 's2',
          gameId: 'president',
          visibility: 'private',
          playerCount: 6,
          startedAt: minutesAgo(8),
        },
      ],
      NOW
    )

    expect(items).toEqual([
      { id: 's1', gameId: 'menteur', playerCount: 4, startedAgoMinutes: 3 },
      { id: 's2', gameId: null, playerCount: null, startedAgoMinutes: 8 },
    ])
    // Le jeu d'une table non publique ne doit fuiter NULLE PART.
    expect(JSON.stringify(items)).not.toContain('president')
  })

  it('traite « invite » et une visibilité inconnue comme non publiques', () => {
    const rows = [
      { id: 'a', gameId: 'quiz', visibility: 'invite', playerCount: 3, startedAt: minutesAgo(1) },
      { id: 'b', gameId: 'quiz', visibility: 'unknown', playerCount: 3, startedAt: minutesAgo(2) },
    ]
    expect(summarizeRecentLaunches(rows, NOW).map((i) => i.gameId)).toEqual([null, null])
  })

  it('met la plus fraîche en tête et ne descend jamais sous zéro minute', () => {
    const rows = [
      { id: 'vieille', gameId: 'quiz', visibility: 'public', playerCount: 2, startedAt: minutesAgo(40) },
      // Horloge en avance (décalage serveur/base) : pas d'âge négatif.
      { id: 'future', gameId: 'quiz', visibility: 'public', playerCount: 2, startedAt: new Date(NOW + 5_000) },
    ]
    const items = summarizeRecentLaunches(rows, NOW)
    expect(items.map((i) => i.id)).toEqual(['future', 'vieille'])
    expect(items[0].startedAgoMinutes).toBe(0)
  })
})

describe('listRecentLaunches', () => {
  it('borne la requête à 10 lignes, sans jamais charger les participants', async () => {
    sessionMock.findMany.mockResolvedValue([])
    await listRecentLaunches(500)

    const args = sessionMock.findMany.mock.calls[0][0]
    expect(args.take).toBe(10)
    expect(args.orderBy).toEqual({ startedAt: 'desc' })
    expect(args.include).toBeUndefined()
    expect(args.select.participants).toBeUndefined()
  })
})
