import { beforeEach, describe, expect, it, vi } from 'vitest'

// `summarizeLiveGames` et `planAbsentLobbyPurge` sont pures, mais le module
// importe prisma (et sa chaîne d'adaptateurs) au chargement : on le neutralise
// pour tester la seule règle métier — ce qui a le droit de sortir du serveur,
// ce qui ne compte que, et qui perd son siège. Les effets (présence,
// expulsion, départ d'une partie) s'observent par les écritures demandées à
// la base et les notifications émises.
const { memberMock, roomMock, bus, cache, sessions, adapters } = vi.hoisted(() => ({
  memberMock: {
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  roomMock: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  bus: { publishRoomChanged: vi.fn() },
  cache: { invalidateLobbiesCache: vi.fn() },
  sessions: { closeGameSession: vi.fn(), closeGameSessionsOfPurgedRooms: vi.fn() },
  adapters: { getGameAdapter: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoomMember: memberMock, onlineRoom: roomMock } }))
vi.mock('@/lib/online/room-bus', () => bus)
vi.mock('@/lib/online/lobbies-cache', () => cache)
vi.mock('@/lib/online/game-sessions', () => sessions)
vi.mock('@/lib/online/game-adapters', () => adapters)

import {
  kickMember,
  leaveOtherRooms,
  planAbsentLobbyPurge,
  PRESENCE_WRITE_INTERVAL_MS,
  purgeAbsentLobbyMembers,
  ROOM_MEMBER_ABSENT_MS,
  summarizeLiveGames,
  touchMemberPresence,
  type AbsentPurgeRoom,
  type LiveRoomRow,
} from '@/lib/online-room'

const NOW = new Date('2026-09-10T12:00:00Z').getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)
const secondsAgo = (s: number) => new Date(NOW - s * 1000)

/** Salle candidate par défaut : publique, en jeu, deux joueurs. */
const room = (over: Partial<LiveRoomRow> = {}): LiveRoomRow => ({
  id: 'r1',
  gameId: 'menteur',
  status: 'playing',
  visibility: 'public',
  createdAt: minutesAgo(3),
  playerCount: 2,
  ...over,
})

describe('summarizeLiveGames', () => {
  it('décrit une table publique en cours sans nommer personne', () => {
    const { liveGames, liveGamesTotal } = summarizeLiveGames([room()], NOW)
    expect(liveGamesTotal).toBe(1)
    expect(liveGames).toEqual([
      {
        id: 'r1',
        gameId: 'menteur',
        isPrivate: false,
        playerCount: 2,
        openedAgoMinutes: 3,
      },
    ])
  })

  it('annonce le jeu et l’effectif de toutes les tables, privées comprises', () => {
    const rows = [
      room({ id: 'pub', visibility: 'public' }),
      room({ id: 'priv', visibility: 'private', gameId: 'president', playerCount: 6 }),
      room({ id: 'inv', visibility: 'invite', gameId: 'quiz' }),
    ]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)

    expect(liveGamesTotal).toBe(3)
    expect(liveGames.map((g) => g.id).sort()).toEqual(['inv', 'priv', 'pub'])
    expect(liveGames.filter((g) => g.isPrivate).map((g) => g.gameId).sort()).toEqual([
      'president',
      'quiz',
    ])
    expect(liveGames.find((g) => g.id === 'priv')).toMatchObject({ playerCount: 6 })
  })

  it('ne peut PAS livrer de pseudo : la sortie n’en porte aucun champ', () => {
    // Garde-fou de forme : le guichet dit combien ils sont, jamais qui joue.
    // Une table publique n'y échappe pas — une table ouverte à tous n'est pas
    // une table dont on publie les noms.
    const [item] = summarizeLiveGames([room()], NOW).liveGames
    expect(Object.keys(item).sort()).toEqual([
      'gameId',
      'id',
      'isPrivate',
      'openedAgoMinutes',
      'playerCount',
    ])
  })

  it('exclut les salles « cast » (afficheur TV d’une partie locale)', () => {
    const rows = [room({ id: 'tv', status: 'cast' }), room({ id: 'jeu' })]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)

    expect(liveGamesTotal).toBe(1)
    expect(liveGames.map((g) => g.id)).toEqual(['jeu'])
  })

  it('compte le briefing comme une partie en cours', () => {
    const { liveGames, liveGamesTotal } = summarizeLiveGames([room({ status: 'briefing' })], NOW)
    expect(liveGamesTotal).toBe(1)
    expect(liveGames).toHaveLength(1)
  })

  it('ignore une salle en attente ou sans jeu choisi', () => {
    const rows = [room({ id: 'w', status: 'waiting' }), room({ id: 'nogame', gameId: null })]
    expect(summarizeLiveGames(rows, NOW)).toEqual({ liveGames: [], liveGamesTotal: 0 })
  })

  it('ne rend rien du tout quand personne ne joue', () => {
    // Rien à afficher ⇒ l’interface se tait (pas de « 0 partie en cours »).
    expect(summarizeLiveGames([], NOW)).toEqual({ liveGames: [], liveGamesTotal: 0 })
  })

  it('range la table la plus fraîche en tête', () => {
    const rows = [
      room({ id: 'vieille', createdAt: minutesAgo(40) }),
      room({ id: 'fraiche', createdAt: minutesAgo(1) }),
    ]
    expect(summarizeLiveGames(rows, NOW).liveGames.map((g) => g.id)).toEqual(['fraiche', 'vieille'])
  })

  it('garde une table dont l’effectif est vide (dernier membre parti)', () => {
    const rows = [room({ id: 'vide', playerCount: 0 }), room({ id: 'pleine' })]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)
    expect(liveGamesTotal).toBe(2)
    expect(liveGames.map((g) => g.id).sort()).toEqual(['pleine', 'vide'])
  })
})

describe('touchMemberPresence', () => {
  beforeEach(() => {
    memberMock.updateMany.mockReset()
    memberMock.updateMany.mockResolvedValue({ count: 0 })
  })

  it('ne réécrit la présence que si elle date de plus de 30 s — le filtre est dans le where', async () => {
    // Sondage jusqu'à toutes les 1,5-2 s (flux SSE mort) : sans ce filtre,
    // dix joueurs qui attendent font cinq transactions d'écriture par seconde
    // pour rien. La base tranche elle-même (un UPDATE sans ligne touchée,
    // aucune page écrite) : aucun aller-retour de plus.
    await touchMemberPresence('room-1', 'user-1', NOW)

    expect(PRESENCE_WRITE_INTERVAL_MS).toBe(30_000)
    expect(memberMock.updateMany).toHaveBeenCalledTimes(1)
    expect(memberMock.updateMany).toHaveBeenCalledWith({
      where: {
        roomId: 'room-1',
        userId: 'user-1',
        lastSeenAt: { lt: new Date(NOW - PRESENCE_WRITE_INTERVAL_MS) },
      },
      data: { lastSeenAt: new Date(NOW) },
    })
  })

  it('reste bien sous le seuil de purge le plus court lu sur lastSeenAt', () => {
    // Le plus court est désormais celui des absents d'un lobby (2 min,
    // ROOM_MEMBER_ABSENT_MS) ; viennent ensuite les tables « figées » de
    // Supervision (3 min) et la purge des tables ouvertes (5 min). Une
    // présence en retard d'au plus 30 s + un sondage ne doit jamais
    // déclencher l'un ni l'autre.
    expect(PRESENCE_WRITE_INTERVAL_MS).toBeLessThan(ROOM_MEMBER_ABSENT_MS / 2)
  })
})

// ─── Expulsion (une seule implémentation pour AFK, lobby et changement de table)

beforeEach(() => {
  vi.resetAllMocks()
  memberMock.deleteMany.mockResolvedValue({ count: 1 })
  memberMock.findFirst.mockResolvedValue(null)
  memberMock.count.mockResolvedValue(1)
  roomMock.update.mockResolvedValue({})
  roomMock.updateMany.mockResolvedValue({ count: 1 })
  roomMock.delete.mockResolvedValue({})
})

describe('kickMember', () => {
  it('retire le membre et prévient le guichet, sans toucher à l’hôte', async () => {
    await kickMember('room-1', 'host', 'bob')

    expect(memberMock.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'room-1', userId: 'bob' } })
    expect(memberMock.findFirst).not.toHaveBeenCalled()
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(cache.invalidateLobbiesCache).toHaveBeenCalledTimes(1)
  })

  it('l’hôte expulsé (remplacement AFK) passe la main au plus ancien membre restant', async () => {
    // Une table dont l'hôte n'est plus membre ne peut plus être ni lancée
    // ni fermée : personne ne pourrait la débloquer.
    memberMock.findFirst.mockResolvedValue({ userId: 'ancienne' })

    await kickMember('room-1', 'host', 'host')

    expect(memberMock.findFirst).toHaveBeenCalledWith({
      where: { roomId: 'room-1' },
      orderBy: { joinedAt: 'asc' },
    })
    expect(roomMock.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { hostUserId: 'ancienne' },
    })
  })

  it('l’hôte expulsé d’une table vide ne transfère rien', async () => {
    await kickMember('room-1', 'host', 'host')
    expect(roomMock.update).not.toHaveBeenCalled()
  })
})

// ─── Purge des absents au lobby ──────────────────────────────────────────────

/** Table ouverte : l'hôte et deux invités, tous vus à l'instant. */
const lobby = (over: Partial<AbsentPurgeRoom> = {}): AbsentPurgeRoom => ({
  id: 'room-1',
  status: 'waiting',
  hostUserId: 'host',
  members: [
    { userId: 'host', lastSeenAt: secondsAgo(5) },
    { userId: 'alice', lastSeenAt: secondsAgo(5) },
    { userId: 'bob', lastSeenAt: secondsAgo(5) },
  ],
  ...over,
})

describe('planAbsentLobbyPurge', () => {
  it('le seuil tient compte de la granularité de présence et du sondage', () => {
    // Trace d'un membre BIEN PRÉSENT : jusqu'à 30 s (écriture) + 25 s
    // (sondage lobby au flux vivant) ≈ 55 s. Le seuil doit rester nettement
    // au-dessus, et sous la purge des tables ouvertes (5 min) pour que les
    // sièges se libèrent avant que la table soit jugée abandonnée.
    expect(ROOM_MEMBER_ABSENT_MS).toBe(2 * 60_000)
    expect(ROOM_MEMBER_ABSENT_MS).toBeGreaterThanOrEqual(2 * (PRESENCE_WRITE_INTERVAL_MS + 25_000))
    expect(ROOM_MEMBER_ABSENT_MS).toBeLessThan(5 * 60_000)
  })

  it('désigne les membres non vus depuis 2 min, jamais celui qui agit', () => {
    const table = lobby({
      members: [
        { userId: 'host', lastSeenAt: secondsAgo(5) },
        { userId: 'alice', lastSeenAt: minutesAgo(3) },
        { userId: 'bob', lastSeenAt: minutesAgo(3) },
        { userId: 'carl', lastSeenAt: secondsAgo(55) },
      ],
    })
    // Alice vient d'agir (route ready/settings/team) : elle est là, quoi que
    // dise sa trace.
    expect(planAbsentLobbyPurge(table, 'alice', NOW)).toEqual({ absent: ['bob'], nextHostUserId: null })
    expect(planAbsentLobbyPurge(table, null, NOW)).toEqual({
      absent: ['alice', 'bob'],
      nextHostUserId: null,
    })
  })

  it('l’hôte absent passe la main au plus ancien membre à la trace fraîche, puis perd son siège', () => {
    const table = lobby({
      members: [
        { userId: 'host', lastSeenAt: minutesAgo(10) },
        { userId: 'alice', lastSeenAt: minutesAgo(3) },
        { userId: 'bob', lastSeenAt: secondsAgo(40) },
        { userId: 'carl', lastSeenAt: secondsAgo(5) },
      ],
    })
    // Bob est le plus ancien VU : c'est lui, pas Carl.
    expect(planAbsentLobbyPurge(table, null, NOW)).toEqual({ absent: ['host', 'alice'], nextHostUserId: 'bob' })
  })

  it('celui qui agit avec une trace vieille reste, mais ne devient pas hôte sur sa seule bonne foi', () => {
    // Deux sondages concurrents doivent désigner le MÊME successeur : Alice
    // (trace vieille, mais elle agit) ne l'est pas — Bob, vu par tous, oui.
    const table = lobby({
      members: [
        { userId: 'host', lastSeenAt: minutesAgo(10) },
        { userId: 'alice', lastSeenAt: minutesAgo(3) },
        { userId: 'bob', lastSeenAt: secondsAgo(40) },
      ],
    })
    expect(planAbsentLobbyPurge(table, 'alice', NOW)).toEqual({ absent: ['host'], nextHostUserId: 'bob' })
    // Personne de vu : l'hôte reste, la table se videra par cleanupStaleWaitingRooms.
    const seul = lobby({
      members: [
        { userId: 'host', lastSeenAt: minutesAgo(10) },
        { userId: 'alice', lastSeenAt: minutesAgo(3) },
      ],
    })
    expect(planAbsentLobbyPurge(seul, 'alice', NOW)).toEqual({ absent: [], nextHostUserId: null })
  })

  it('l’hôte qui agit est là, quoi que dise sa trace : pas de transfert', () => {
    const table = lobby({
      members: [
        { userId: 'host', lastSeenAt: minutesAgo(10) },
        { userId: 'alice', lastSeenAt: secondsAgo(5) },
      ],
    })
    expect(planAbsentLobbyPurge(table, 'host', NOW)).toEqual({ absent: [], nextHostUserId: null })
  })

  it('ne touche à rien hors du lobby : en partie, c’est le remplacement AFK', () => {
    const table = lobby({ status: 'playing', members: [{ userId: 'bob', lastSeenAt: minutesAgo(30) }] })
    expect(planAbsentLobbyPurge(table, null, NOW)).toEqual({ absent: [], nextHostUserId: null })
    expect(planAbsentLobbyPurge({ ...table, status: 'briefing' }, null, NOW)).toEqual({
      absent: [],
      nextHostUserId: null,
    })
  })
})

describe('purgeAbsentLobbyMembers', () => {
  it('ne coûte AUCUNE requête tant que tout le monde est là', async () => {
    // Appelée à chaque sondage (buildRoomDto) : c'est ce qui autorise
    // l'absence de throttle.
    expect(await purgeAbsentLobbyMembers(lobby(), 'host', NOW)).toEqual({ absent: [], hostUserId: 'host' })
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).not.toHaveBeenCalled()
    expect(cache.invalidateLobbiesCache).not.toHaveBeenCalled()
  })

  it('libère les sièges des absents en une écriture, puis prévient table et guichet', async () => {
    const table = lobby({
      members: [
        { userId: 'host', lastSeenAt: secondsAgo(5) },
        { userId: 'alice', lastSeenAt: minutesAgo(4) },
        { userId: 'bob', lastSeenAt: minutesAgo(2.5) },
      ],
    })
    memberMock.deleteMany.mockResolvedValue({ count: 2 })

    expect(await purgeAbsentLobbyMembers(table, 'host', NOW)).toEqual({
      absent: ['alice', 'bob'],
      hostUserId: 'host',
    })

    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(memberMock.deleteMany).toHaveBeenCalledTimes(1)
    expect(memberMock.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', userId: { in: ['alice', 'bob'] } },
    })
    expect(cache.invalidateLobbiesCache).toHaveBeenCalledTimes(1)
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('un sondage concurrent qui n’efface rien ne notifie personne', async () => {
    const table = lobby({ members: [{ userId: 'bob', lastSeenAt: minutesAgo(3) }] })
    memberMock.deleteMany.mockResolvedValue({ count: 0 })

    // Bob n'est plus à la table quoi qu'il en soit : le DTO doit l'omettre.
    expect(await purgeAbsentLobbyMembers(table, 'host', NOW)).toEqual({ absent: ['bob'], hostUserId: 'host' })
    expect(bus.publishRoomChanged).not.toHaveBeenCalled()
    expect(cache.invalidateLobbiesCache).not.toHaveBeenCalled()
  })

  it('hôte absent : passe la main par compare-and-swap, libère son siège, décrit le nouvel hôte', async () => {
    const table = lobby({
      members: [
        { userId: 'host', lastSeenAt: minutesAgo(10) },
        { userId: 'alice', lastSeenAt: secondsAgo(5) },
      ],
    })
    roomMock.updateMany.mockResolvedValue({ count: 1 })
    memberMock.deleteMany.mockResolvedValue({ count: 1 })

    expect(await purgeAbsentLobbyMembers(table, 'alice', NOW)).toEqual({ absent: ['host'], hostUserId: 'alice' })

    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'room-1', hostUserId: 'host' },
      data: { hostUserId: 'alice' },
    })
    expect(memberMock.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', userId: { in: ['host'] } },
    })
    expect(cache.invalidateLobbiesCache).toHaveBeenCalledTimes(1)
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
  })

  it('transfert perdu (un sondage concurrent a déjà passé la main) : rien n’est effacé ce tour-ci', async () => {
    const table = lobby({
      members: [
        { userId: 'host', lastSeenAt: minutesAgo(10) },
        { userId: 'alice', lastSeenAt: secondsAgo(5) },
        { userId: 'bob', lastSeenAt: minutesAgo(3) },
      ],
    })
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    expect(await purgeAbsentLobbyMembers(table, 'alice', NOW)).toEqual({ absent: [], hostUserId: 'host' })
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).not.toHaveBeenCalled()
  })
})

// ─── Changer de table = quitter proprement les autres ────────────────────────

describe('leaveOtherRooms', () => {
  /** Adaptateur minimal : l'état est une liste de joueurs, partir pose `leftAt`. */
  const fakeAdapter = {
    parse: (json: string | null) => (json ? JSON.parse(json) : null),
    serialize: (state: unknown) => JSON.stringify(state),
    markLeft: (state: unknown, userId: string, at: number) => {
      const s = state as { players: { id: string; leftAt?: number }[]; turn: string }
      if (!s.players.some((p) => p.id === userId && !p.leftAt)) return null
      return {
        ...s,
        players: s.players.map((p) => (p.id === userId ? { ...p, leftAt: at } : p)),
        turn: s.turn === userId ? 'alice' : s.turn,
      }
    },
    isFinished: () => false,
    currentActorId: (state: unknown) => (state as { turn: string }).turn,
  }
  const playingRoom = {
    id: 'partie',
    status: 'playing',
    hostUserId: 'host',
    gameId: 'menteur',
    gameStateJson: JSON.stringify({ players: [{ id: 'bob' }, { id: 'alice' }], turn: 'bob' }),
    stateVersion: 7,
  }
  const waitingRoom = {
    id: 'lobby',
    status: 'waiting',
    hostUserId: 'host',
    gameId: 'quiz',
    gameStateJson: null,
    stateVersion: 0,
  }

  beforeEach(() => {
    adapters.getGameAdapter.mockReturnValue(fakeAdapter)
  })

  it('marque le joueur « parti » dans sa partie en cours AVANT de libérer son siège, et le tour passe', async () => {
    // Avant, create/join effaçaient l'adhésion sans toucher à l'état : Bob
    // restait « au tour » dans le moteur et la partie des autres se figeait.
    memberMock.findMany.mockResolvedValue([{ room: playingRoom }])

    await leaveOtherRooms('bob', 'nouvelle')

    expect(memberMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'bob', roomId: { not: 'nouvelle' } } })
    )
    expect(roomMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'partie', stateVersion: 7 },
      data: {
        gameStateJson: expect.stringContaining('"leftAt"'),
        stateVersion: 8,
        currentTurnUserId: 'alice',
      },
    })
    expect(roomMock.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      memberMock.deleteMany.mock.invocationCallOrder[0]
    )
    expect(memberMock.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'partie', userId: 'bob' } })
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('partie', { type: 'changed', stateVersion: 8 })
  })

  it('sans autre table, ne lit qu’une fois et n’écrit rien', async () => {
    memberMock.findMany.mockResolvedValue([])

    await leaveOtherRooms('bob')

    expect(memberMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'bob' } })
    )
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(bus.publishRoomChanged).not.toHaveBeenCalled()
  })

  it('quitter un simple lobby n’écrit aucun état et notifie « lobby »', async () => {
    memberMock.findMany.mockResolvedValue([{ room: waitingRoom }])

    await leaveOtherRooms('bob', 'nouvelle')

    expect(roomMock.updateMany).not.toHaveBeenCalled()
    expect(memberMock.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'lobby', userId: 'bob' } })
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('lobby', { type: 'lobby' })
  })

  it('l’hôte qui part ailleurs passe la main : la table qu’il laisse reste déblocable', async () => {
    memberMock.findMany.mockResolvedValue([{ room: waitingRoom }])
    memberMock.findFirst.mockResolvedValue({ userId: 'alice' })

    await leaveOtherRooms('host', 'nouvelle')

    expect(roomMock.update).toHaveBeenCalledWith({ where: { id: 'lobby' }, data: { hostUserId: 'alice' } })
  })

  it('la dernière personne qui part ailleurs emporte la table avec elle', async () => {
    memberMock.findMany.mockResolvedValue([{ room: waitingRoom }])
    memberMock.count.mockResolvedValue(0)
    roomMock.findUnique.mockResolvedValue({ id: 'lobby', status: 'waiting', updatedAt: new Date(NOW) })

    await leaveOtherRooms('bob')

    expect(roomMock.delete).toHaveBeenCalledWith({ where: { id: 'lobby' } })
  })

  it('un coup joué entre-temps gagne : le départ non marqué ne fait pas échouer le changement de table', async () => {
    memberMock.findMany.mockResolvedValue([{ room: playingRoom }])
    roomMock.updateMany.mockResolvedValue({ count: 0 })

    await expect(leaveOtherRooms('bob', 'nouvelle')).resolves.toBeUndefined()

    // Le siège est libéré quand même ; sans version nouvelle, on ne ment pas
    // aux clients avec un `changed` : le remplacement AFK rattrapera le départ.
    expect(memberMock.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'partie', userId: 'bob' } })
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('partie', { type: 'lobby' })
  })
})
