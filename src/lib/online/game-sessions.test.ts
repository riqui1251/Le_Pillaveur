import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

/**
 * Le journal des parties tient sur quatre promesses, testées ici :
 *  - un participant est SOIT un compte (référence, jamais de pseudo recopié),
 *    SOIT un bot (nom d'affichage) ;
 *  - une revanche ouvre une NOUVELLE partie et ferme la précédente ;
 *  - une partie dont la salle a disparu cesse d'être annoncée « en cours » ;
 *  - une fin n'est JAMAIS datée à l'heure où l'on lit le journal, et son motif
 *    dit si la durée est sûre, estimée ou inconnue.
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
  closeGameSessionsOfPurgedRooms,
  closeOrphanGameSessions,
  durationReliabilityOf,
  listGameSessions,
  listRecentLaunches,
  orphanSessionEnd,
  parseEndReason,
  prepareHostedGameSessionsClose,
  recordGameSessionStart,
  summarizeRecentLaunches,
} from '@/lib/online/game-sessions'

/** Horloge figée (Date seulement) : « maintenant » devient une valeur attendue. */
const NOW = new Date('2026-09-12T20:00:00.000Z')
const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(NOW.getTime() - ms)

/** Ce que `create` a reçu, sous une forme lisible. */
const createdData = () => sessionMock.create.mock.calls[0][0].data
const createdParticipants = () =>
  createdData().participants.create as { seat: number; userId: string | null; botName: string | null }[]

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sessionMock.updateMany.mockResolvedValue({ count: 0 })
  sessionMock.create.mockResolvedValue({})
  sessionMock.count.mockResolvedValue(0)
  sessionMock.findMany.mockResolvedValue([])
  roomMock.findMany.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
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
    // … et il reste compté parmi les HUMAINS : sinon botCount (playerCount −
    // humanCount) le rangeait parmi les bots.
    expect(createdData()).toMatchObject({ playerCount: 2, humanCount: 2 })
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

    // La précédente se ferme à l'instant même où la nouvelle commence : durée sûre.
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', endedAt: null },
      data: { endedAt: NOW, endReason: 'rematch' },
    })
    expect(createdData().startedAt).toEqual(NOW)
    expect(sessionMock.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      sessionMock.create.mock.invocationCallOrder[0]
    )
    expect(sessionMock.create).toHaveBeenCalledTimes(1)
  })

  it('compte en humains les sièges sans botName, bots exclus', async () => {
    roomMock.findUnique.mockResolvedValue({
      code: 'ABCD',
      gameId: 'quiz',
      gameStateJson: JSON.stringify({
        players: [
          { id: 'u1', name: 'Alice', isBot: false },
          { id: 'inconnu', name: 'Bernard', isBot: false },
          { id: 'bot-1', name: 'Gépéto', isBot: true },
          { id: 'bot-2', name: null, isBot: true },
        ],
      }),
      members: [{ userId: 'u1' }],
    })

    await recordGameSessionStart('room-1')

    expect(createdData()).toMatchObject({ playerCount: 4, humanCount: 2 })
    expect(createdParticipants()[3]).toEqual({ seat: 3, userId: null, botName: 'Bot' })
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
  it('ferme la partie en cours de la salle, motif « terminée » par défaut', async () => {
    const client = {
      onlineGameSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaClient
    const endedAt = new Date('2026-09-10T20:00:00.000Z')

    expect(await closeGameSession(client, 'room-1', endedAt)).toBe(1)
    expect(client.onlineGameSession.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', endedAt: null },
      data: { endedAt, endReason: 'finished' },
    })
  })

  it('écrit le motif donné par l’appelant', async () => {
    const client = {
      onlineGameSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaClient

    await closeGameSession(client, 'room-1', NOW, 'staff')
    expect(client.onlineGameSession.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', endedAt: null },
      data: { endedAt: NOW, endReason: 'staff' },
    })
  })

  it('ne casse pas une fin de partie quand le client ignore le modèle', async () => {
    expect(await closeGameSession({} as unknown as PrismaClient, 'room-1')).toBe(0)
  })
})

describe('closeGameSessionsOfPurgedRooms', () => {
  const purgeClient = (open: { id: string; roomId: string; startedAt: Date }[]) => {
    const findMany = vi.fn().mockResolvedValue(open)
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const client = { onlineGameSession: { findMany, updateMany } } as unknown as PrismaClient
    return { client, findMany, updateMany }
  }

  it('ferme chaque partie à la dernière écriture de SA salle, motif « abandonnée »', async () => {
    const { client, findMany, updateMany } = purgeClient([
      { id: 's1', roomId: 'room-1', startedAt: ago(2 * HOUR) },
      { id: 's2', roomId: 'room-2', startedAt: ago(5 * HOUR) },
    ])

    const closed = await closeGameSessionsOfPurgedRooms(client, [
      { id: 'room-1', updatedAt: ago(65 * 60 * 1000) },
      { id: 'room-2', updatedAt: ago(3 * HOUR) },
    ])

    expect(closed).toBe(2)
    // Une seule lecture pour toutes les salles purgées.
    expect(findMany).toHaveBeenCalledWith({
      where: { roomId: { in: ['room-1', 'room-2'] }, endedAt: null },
      select: { id: true, roomId: true, startedAt: true },
    })
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 's1', endedAt: null },
      data: { endedAt: ago(65 * 60 * 1000), endReason: 'abandoned' },
    })
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 's2', endedAt: null },
      data: { endedAt: ago(3 * HOUR), endReason: 'abandoned' },
    })
  })

  it('ne date jamais la fin avant le début (aucun coup joué après le lancement)', async () => {
    const startedAt = ago(2 * HOUR)
    const { client, updateMany } = purgeClient([{ id: 's1', roomId: 'room-1', startedAt }])

    await closeGameSessionsOfPurgedRooms(client, [
      { id: 'room-1', updatedAt: new Date(startedAt.getTime() - 4) },
    ])

    expect(updateMany.mock.calls[0][0].data.endedAt).toEqual(startedAt)
  })

  it('n’écrit rien quand aucune partie n’est ouverte, ni sans salle', async () => {
    const { client, findMany, updateMany } = purgeClient([])

    expect(await closeGameSessionsOfPurgedRooms(client, [{ id: 'room-1', updatedAt: ago(HOUR) }])).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()

    expect(await closeGameSessionsOfPurgedRooms(client, [])).toBe(0)
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('ne lève jamais : la purge doit passer quoi qu’il arrive', async () => {
    const { client, findMany } = purgeClient([])
    findMany.mockRejectedValueOnce(new Error('base verrouillée'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      closeGameSessionsOfPurgedRooms(client, [{ id: 'room-1', updatedAt: ago(HOUR) }])
    ).resolves.toBe(0)
    // Client de test sans ce modèle : rien à fermer, rien de cassé.
    await expect(
      closeGameSessionsOfPurgedRooms({} as unknown as PrismaClient, [
        { id: 'room-1', updatedAt: ago(HOUR) },
      ])
    ).resolves.toBe(0)
    errorSpy.mockRestore()
  })
})

describe('prepareHostedGameSessionsClose (suppression de compte)', () => {
  it('prépare, sans la lancer, la fermeture des parties des salles hébergées', async () => {
    roomMock.findMany.mockResolvedValue([{ id: 'room-1' }, { id: 'room-2' }])
    sessionMock.updateMany.mockReturnValue('requete-de-fermeture')

    const queries = await prepareHostedGameSessionsClose('u1')

    expect(roomMock.findMany).toHaveBeenCalledWith({
      where: { hostUserId: 'u1' },
      select: { id: true },
    })
    // Une requête à placer dans la transaction, devant le `user.delete` qui
    // emporte ces salles en cascade.
    expect(queries).toEqual(['requete-de-fermeture'])
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: { in: ['room-1', 'room-2'] }, endedAt: null },
      data: { endedAt: NOW, endReason: 'left' },
    })
  })

  it('ne prépare rien pour un compte qui n’héberge aucune salle', async () => {
    roomMock.findMany.mockResolvedValue([])

    expect(await prepareHostedGameSessionsClose('u1')).toEqual([])
    expect(sessionMock.updateMany).not.toHaveBeenCalled()
  })
})

describe('orphanSessionEnd', () => {
  const now = NOW.getTime()

  it('salle disparue : fin = début, motif « inconnu » — on n’invente rien', () => {
    const startedAt = ago(2 * HOUR)
    expect(orphanSessionEnd({ startedAt }, null, now)).toEqual({
      endedAt: startedAt,
      endReason: 'unknown',
    })
    // Même au-delà du plafond : aucune durée de 12 h fabriquée.
    const vieux = ago(30 * HOUR)
    expect(orphanSessionEnd({ startedAt: vieux }, null, now)).toEqual({
      endedAt: vieux,
      endReason: 'unknown',
    })
  })

  it('salle revenue au lobby : fin = dernière écriture de la salle', () => {
    const room = { status: 'waiting', updatedAt: ago(40 * 60 * 1000) }
    expect(orphanSessionEnd({ startedAt: ago(HOUR) }, room, now)).toEqual({
      endedAt: ago(40 * 60 * 1000),
      endReason: 'abandoned',
    })
  })

  it('laisse ouverte une partie qui joue encore sous le plafond', () => {
    const room = { status: 'playing', updatedAt: NOW }
    expect(orphanSessionEnd({ startedAt: ago(11 * HOUR) }, room, now)).toBeNull()
    expect(
      orphanSessionEnd({ startedAt: ago(HOUR) }, { status: 'briefing', updatedAt: NOW }, now)
    ).toBeNull()
  })

  it('au-delà du plafond : début + 12 h si la salle écrit encore, sinon sa dernière écriture', () => {
    const startedAt = ago(13 * HOUR)
    expect(orphanSessionEnd({ startedAt }, { status: 'playing', updatedAt: NOW }, now)).toEqual({
      endedAt: new Date(startedAt.getTime() + 12 * HOUR),
      endReason: 'abandoned',
    })
    expect(
      orphanSessionEnd({ startedAt }, { status: 'playing', updatedAt: ago(12.5 * HOUR) }, now)
    ).toEqual({ endedAt: ago(12.5 * HOUR), endReason: 'abandoned' })
  })

  it('jamais de fin avant le début (écriture du lancement juste avant la ligne)', () => {
    const startedAt = ago(2 * HOUR)
    const room = { status: 'waiting', updatedAt: new Date(startedAt.getTime() - 5) }
    expect(orphanSessionEnd({ startedAt }, room, now)?.endedAt).toEqual(startedAt)
  })
})

describe('closeOrphanGameSessions', () => {
  it('ferme les parties dont la salle a disparu et laisse vivre les autres', async () => {
    const startedAt = ago(30 * 60 * 1000)
    sessionMock.findMany.mockResolvedValue([
      { id: 's-vivante', roomId: 'room-1', startedAt },
      { id: 's-orpheline', roomId: 'room-2', startedAt },
    ])
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', status: 'playing', updatedAt: NOW }])
    sessionMock.updateMany.mockResolvedValue({ count: 1 })

    expect(await closeOrphanGameSessions()).toBe(1)
    expect(roomMock.findMany.mock.calls[0][0].select).toEqual({
      id: true,
      status: true,
      updatedAt: true,
    })
    expect(sessionMock.updateMany).toHaveBeenCalledTimes(1)
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: 's-orpheline', endedAt: null },
      data: { endedAt: startedAt, endReason: 'unknown' },
    })
  })

  it('ferme aussi une partie qui traîne depuis plus de 12 h, bornée à début + 12 h', async () => {
    const vieux = ago(13 * HOUR)
    sessionMock.findMany.mockResolvedValue([{ id: 's-figee', roomId: 'room-1', startedAt: vieux }])
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', status: 'playing', updatedAt: NOW }])
    sessionMock.updateMany.mockResolvedValue({ count: 1 })

    expect(await closeOrphanGameSessions()).toBe(1)
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: 's-figee', endedAt: null },
      data: { endedAt: new Date(vieux.getTime() + 12 * HOUR), endReason: 'abandoned' },
    })
  })

  it('ferme la partie d’une salle revenue au lobby (elle existe, mais ne joue plus)', async () => {
    const retourAuLobby = ago(20 * 60 * 1000)
    sessionMock.findMany.mockResolvedValue([
      { id: 's-au-lobby', roomId: 'room-1', startedAt: ago(HOUR) },
    ])
    roomMock.findMany.mockResolvedValue([
      { id: 'room-1', status: 'waiting', updatedAt: retourAuLobby },
    ])
    sessionMock.updateMany.mockResolvedValue({ count: 1 })

    expect(await closeOrphanGameSessions()).toBe(1)
    expect(sessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: 's-au-lobby', endedAt: null },
      data: { endedAt: retourAuLobby, endReason: 'abandoned' },
    })
  })

  it('ne date jamais une fin à l’heure de lecture', async () => {
    sessionMock.findMany.mockResolvedValue([
      { id: 'a', roomId: 'disparue', startedAt: ago(3 * HOUR) },
      { id: 'b', roomId: 'lobby', startedAt: ago(2 * HOUR) },
      { id: 'c', roomId: 'figee', startedAt: ago(20 * HOUR) },
    ])
    roomMock.findMany.mockResolvedValue([
      { id: 'lobby', status: 'waiting', updatedAt: ago(HOUR) },
      { id: 'figee', status: 'playing', updatedAt: NOW },
    ])
    sessionMock.updateMany.mockResolvedValue({ count: 1 })

    expect(await closeOrphanGameSessions()).toBe(3)
    for (const [args] of sessionMock.updateMany.mock.calls) {
      expect(args.data.endedAt.getTime()).toBeLessThan(NOW.getTime())
    }
  })

  it('ne touche à rien quand toutes les salles vivent encore', async () => {
    sessionMock.findMany.mockResolvedValue([
      { id: 's-vivante', roomId: 'room-1', startedAt: ago(HOUR) },
    ])
    roomMock.findMany.mockResolvedValue([{ id: 'room-1', status: 'playing', updatedAt: NOW }])

    expect(await closeOrphanGameSessions()).toBe(0)
    expect(sessionMock.updateMany).not.toHaveBeenCalled()
  })
})

describe('durationReliabilityOf / parseEndReason', () => {
  it('sûre en fin de partie ou de revanche, estimée sinon, inconnue sans motif', () => {
    expect(durationReliabilityOf('finished')).toBe('reliable')
    expect(durationReliabilityOf('rematch')).toBe('reliable')
    expect(durationReliabilityOf('left')).toBe('estimated')
    expect(durationReliabilityOf('staff')).toBe('estimated')
    expect(durationReliabilityOf('abandoned')).toBe('estimated')
    expect(durationReliabilityOf('unknown')).toBe('unknown')
    // Lignes antérieures à la colonne (les 2 parties du 10-12/09).
    expect(durationReliabilityOf(null)).toBe('unknown')
  })

  it('garde NULL et ne laisse passer aucune valeur inconnue pour une durée sûre', () => {
    expect(parseEndReason(null)).toBeNull()
    expect(parseEndReason('rematch')).toBe('rematch')
    expect(parseEndReason('timeout')).toBe('unknown')
  })
})

// OnlineRoom.updatedAt réécrit par updateMany : vérifié sur une vraie base
// SQLite jetable dans room-updated-at.test.ts (ce fichier-ci simule Prisma).

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
        endReason: 'finished',
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
    expect(sessions[0]).toMatchObject({
      durationSeconds: 720,
      botCount: 1,
      gameTitle: 'Le Menteur',
      endReason: 'finished',
      durationReliability: 'reliable',
    })
    // Sans filtre : tout le journal, compté sur le même périmètre.
    expect(sessionMock.findMany.mock.calls[0][0].where).toBeUndefined()
    expect(sessionMock.count).toHaveBeenCalledWith({ where: undefined })
    // Siège humain sans compte (supprimé OU jamais rattaché) : jamais nommé.
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
        endReason: null,
        playerCount: 2,
        humanCount: 2,
        participants: [],
      },
    ])
    sessionMock.count.mockResolvedValue(1)

    const { sessions } = await listGameSessions({ skip: 0, take: 20 })
    expect(sessions[0].endedAt).toBeNull()
    expect(sessions[0].durationSeconds).toBeNull()
    expect(sessions[0].endReason).toBeNull()
    // Jeu retiré du catalogue : on affiche son identifiant plutôt que rien.
    expect(sessions[0].gameTitle).toBe('inconnu')
  })

  it('marque « fiabilité inconnue » les lignes antérieures au motif, « estimée » une purge', async () => {
    const row = (id: string, endReason: string | null) => ({
      id,
      roomId: 'room-1',
      code: 'ABCD',
      gameId: 'quiz',
      startedAt: new Date('2026-09-10T20:00:00.000Z'),
      endedAt: new Date('2026-09-10T21:30:00.000Z'),
      endReason,
      playerCount: 2,
      humanCount: 2,
      participants: [],
    })
    sessionMock.findMany.mockResolvedValue([row('ancienne', null), row('purgee', 'abandoned')])
    sessionMock.count.mockResolvedValue(2)

    const { sessions } = await listGameSessions({ skip: 0, take: 20 })
    expect(sessions.map((s) => [s.endReason, s.durationReliability, s.durationSeconds])).toEqual([
      [null, 'unknown', 5400],
      ['abandoned', 'estimated', 5400],
    ])
  })

  it('filtre sur les parties où le compte a un siège, total compris', async () => {
    sessionMock.count.mockResolvedValue(0)

    await listGameSessions({ skip: 20, take: 20, userId: 'u1' })

    const where = { participants: { some: { userId: 'u1' } } }
    expect(sessionMock.findMany.mock.calls[0][0]).toMatchObject({ where, skip: 20, take: 20 })
    expect(sessionMock.count).toHaveBeenCalledWith({ where })
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

  it('annonce le jeu des deux, et l’effectif de la seule table publique', () => {
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
      { id: 's1', gameId: 'menteur', isPrivate: false, playerCount: 4, startedAgoMinutes: 3 },
      { id: 's2', gameId: 'president', isPrivate: true, playerCount: null, startedAgoMinutes: 8 },
    ])
  })

  it('traite « invite » et une visibilité inconnue comme non publiques', () => {
    const rows = [
      { id: 'a', gameId: 'quiz', visibility: 'invite', playerCount: 3, startedAt: minutesAgo(1) },
      { id: 'b', gameId: 'quiz', visibility: 'unknown', playerCount: 3, startedAt: minutesAgo(2) },
    ]
    const items = summarizeRecentLaunches(rows, NOW)
    expect(items.map((i) => i.isPrivate)).toEqual([true, true])
    // Le jeu est annoncé, l'effectif non.
    expect(items.map((i) => i.gameId)).toEqual(['quiz', 'quiz'])
    expect(items.map((i) => i.playerCount)).toEqual([null, null])
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
