import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/online/rooms/[roomId]/launch — les bornes d'effectif au lancement.
 * La vraie route (base, session, bus et cache simulés ; registre, adaptateurs
 * et répartition des équipes réels) :
 * - Tabou Vocal : 2 joueurs HUMAINS par équipe (team_min_players) — un bot ne
 *   décrit rien, et le jeu ne se complète plus par des bots (le minimum ne
 *   compte donc que les humains, même si un botsCount traîne dans les réglages) ;
 * - Petit Buveur : se complète par des bots — un joueur seul avec un bot lance.
 */

const { userMock, roomMock, memberMock, dtoMock, bus, cache, departures } = vi.hoisted(() => ({
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn(), update: vi.fn() },
  memberMock: { deleteMany: vi.fn() },
  dtoMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
  cache: { invalidateLobbiesCache: vi.fn() },
  departures: { recordDeparture: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomMock, onlineRoomMember: memberMock } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({ buildRoomDto: dtoMock }))
vi.mock('@/lib/online/room-bus', () => bus)
vi.mock('@/lib/online/lobbies-cache', () => cache)
vi.mock('@/lib/online/departures', () => departures)

import { POST } from './route'

/** Table en attente, hôte `p1`, tout le monde prêt. */
const waitingRoom = (gameId: string, humans: number, settings: Record<string, unknown> = {}) => ({
  id: 'room-1',
  status: 'waiting',
  gameId,
  hostUserId: 'p1',
  settingsJson: JSON.stringify({ difficulty: 'normal', lang: 'fr', ...settings }),
  members: Array.from({ length: humans }, (_, i) => ({ userId: `p${i + 1}`, isReady: true })),
})

/** Choix d'équipe du lobby : `a` joueurs en A puis `b` en B (p1, p2…). */
const tabouTeams = (a: number, b: number) =>
  Object.fromEntries([
    ...Array.from({ length: a }, (_, i) => [`p${i + 1}`, 'A']),
    ...Array.from({ length: b }, (_, i) => [`p${a + i + 1}`, 'B']),
  ])

const launch = () => {
  userMock.mockResolvedValue({ id: 'p1' })
  return POST(new Request('http://test/api/online/rooms/room-1/launch', { method: 'POST' }), {
    params: Promise.resolve({ roomId: 'room-1' }),
  })
}

/** La partie est partie en briefing (seule écriture d'un lancement accepté). */
const expectLaunched = async (res: Response) => {
  expect(res.status).toBe(200)
  expect(roomMock.update).toHaveBeenCalledTimes(1)
  expect(roomMock.update.mock.calls[0][0].data.status).toBe('briefing')
}

const expectRefused = async (res: Response, error: string, extra: Record<string, unknown> = {}) => {
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ error, ...extra })
  expect(roomMock.update).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
  roomMock.update.mockImplementation(async (args) => args)
  dtoMock.mockResolvedValue({ id: 'room-1' })
})

describe('POST /launch — Tabou Vocal, 2 humains par équipe', () => {
  it('2 contre 2 : lance', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom('tabou', 4, { tabouTeams: tabouTeams(2, 2) }))
    await expectLaunched(await launch())
  })

  it('4 joueurs sans choix d’équipe : répartis 2 contre 2, lance', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom('tabou', 4))
    await expectLaunched(await launch())
  })

  it('4 contre 0 : team_min_players', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom('tabou', 4, { tabouTeams: tabouTeams(4, 0) }))
    await expectRefused(await launch(), 'team_min_players')
  })

  it('4 contre 1 : refusé, l’équipe B n’a qu’un humain', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom('tabou', 5, { tabouTeams: tabouTeams(4, 1) }))
    await expectRefused(await launch(), 'team_min_players')
  })

  it('3 humains + des bots réglés : min_players, les bots ne comptent pas', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom('tabou', 3, { botsCount: 5 }))
    await expectRefused(await launch(), 'min_players', { count: 4 })
  })
})

describe('POST /launch — Petit Buveur complété par des bots', () => {
  it('1 humain + 1 bot : lance', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom('petit-buveur', 1, { botsCount: 1 }))
    await expectLaunched(await launch())
  })

  it('1 humain sans bot : min_players', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom('petit-buveur', 1))
    await expectRefused(await launch(), 'min_players', { count: 2 })
  })
})
