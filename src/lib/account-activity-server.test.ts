import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fiche compte, activité en ligne. Ce qui se calcule ici doit tenir quatre
 * promesses :
 *  - une séance regroupe les parties enchaînées à MOINS de 30 min d'écart, et
 *    prend la pire fiabilité de ses parties ;
 *  - les tuiles 7 j / 30 j découpent en jours de PARIS, changement d'heure
 *    compris, et n'additionnent jamais une durée inconnue ou en cours ;
 *  - le bilan victoires / défaites se lit par jeu ;
 *  - la réponse ne sert ni visitorId ni IP de navigateur, et ignore un compte
 *    hors périmètre.
 * La base est simulée : on vérifie les calculs et la forme, pas Prisma.
 */
const { userMock, seatMock, historyMock, resultMock, presenceMock, listGameSessionsMock, ipsMock } =
  vi.hoisted(() => ({
    userMock: { findUnique: vi.fn() },
    seatMock: { findMany: vi.fn() },
    historyMock: { findMany: vi.fn() },
    resultMock: { groupBy: vi.fn() },
    presenceMock: { findMany: vi.fn() },
    listGameSessionsMock: vi.fn(),
    ipsMock: vi.fn(),
  }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: userMock,
    onlineGameSessionPlayer: seatMock,
    onlineGameHistory: historyMock,
    onlineMatchResult: resultMock,
    sitePresence: presenceMock,
  },
}))

vi.mock('@/lib/online/game-sessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/online/game-sessions')>()
  return { ...actual, listGameSessions: listGameSessionsMock }
})

vi.mock('@/lib/ip-history-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ip-history-server')>()
  return { ...actual, getIpsBySubjectKeys: ipsMock }
})

import {
  computePlayTotals,
  getAccountActivity,
  groupSeances,
  summarizeAccountPlay,
  summarizeMatchResults,
  type AccountPlayedGame,
} from '@/lib/account-activity-server'

const MIN = 60 * 1000

/** Partie de test : début ISO, durée en minutes (null = en cours). */
function game(
  id: string,
  startIso: string,
  minutes: number | null,
  extra: Partial<AccountPlayedGame> = {}
): AccountPlayedGame {
  const startedAt = new Date(startIso)
  return {
    id,
    gameId: 'quiz',
    startedAt,
    endedAt: minutes === null ? null : new Date(startedAt.getTime() + minutes * MIN),
    humanCount: 2,
    reliability: 'reliable',
    ...extra,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('groupSeances', () => {
  it('regroupe les parties à moins de 30 min d’écart, la plus récente séance d’abord', () => {
    const seances = groupSeances([
      // Désordre volontaire : le regroupement trie lui-même.
      game('c', '2026-09-12T21:00:00Z', 15, { gameId: 'menteur' }),
      game('a', '2026-09-12T18:00:00Z', 20, { gameId: 'quiz' }),
      game('b', '2026-09-12T18:40:00Z', 20, { gameId: 'sans-filtre' }),
    ])

    expect(seances).toHaveLength(2)
    // 18:40 − 18:20 = 20 min : même séance. 21:00 − 19:00 = 2 h : nouvelle.
    expect(seances[1]).toEqual({
      startedAt: '2026-09-12T18:00:00.000Z',
      endedAt: '2026-09-12T19:00:00.000Z',
      durationSeconds: 3600,
      reliability: 'reliable',
      gameIds: ['quiz', 'sans-filtre'],
      count: 2,
    })
    expect(seances[0]).toMatchObject({ startedAt: '2026-09-12T21:00:00.000Z', count: 1, gameIds: ['menteur'] })
  })

  it('coupe à 30 min pile : l’écart doit être STRICTEMENT inférieur', () => {
    const seances = groupSeances([
      game('a', '2026-09-12T18:00:00Z', 30),
      game('b', '2026-09-12T19:00:00Z', 10),
    ])
    expect(seances).toHaveLength(2)
  })

  it('compte chaque revanche mais ne répète pas le jeu', () => {
    const [seance] = groupSeances([
      game('a', '2026-09-12T18:00:00Z', 10),
      game('b', '2026-09-12T18:10:00Z', 10),
      game('c', '2026-09-12T18:20:00Z', 10),
    ])
    expect(seance.count).toBe(3)
    expect(seance.gameIds).toEqual(['quiz'])
  })

  it('mesure l’écart depuis la fin la plus tardive quand des tables se chevauchent', () => {
    const seances = groupSeances([
      game('longue', '2026-09-12T18:00:00Z', 90), // → 19:30
      game('courte', '2026-09-12T18:10:00Z', 10), // → 18:20, pendant la longue
      game('suite', '2026-09-12T19:50:00Z', 10), // 20 min après 19:30
    ])
    expect(seances).toHaveLength(1)
    expect(seances[0].durationSeconds).toBe(2 * 3600)
  })

  it('prend la pire fiabilité de la séance', () => {
    const [estimated] = groupSeances([
      game('a', '2026-09-12T18:00:00Z', 10, { reliability: 'reliable' }),
      game('b', '2026-09-12T18:15:00Z', 10, { reliability: 'estimated' }),
      game('c', '2026-09-12T18:30:00Z', 10, { reliability: 'reliable' }),
    ])
    expect(estimated.reliability).toBe('estimated')

    const [unknown] = groupSeances([
      game('a', '2026-09-12T18:00:00Z', 10, { reliability: 'unknown' }),
      game('b', '2026-09-12T18:15:00Z', 10, { reliability: 'estimated' }),
    ])
    expect(unknown.reliability).toBe('unknown')
  })

  it('laisse une séance « en cours » sans fin ni durée tant qu’une partie tourne', () => {
    const [seance] = groupSeances([
      game('a', '2026-09-12T18:00:00Z', 10),
      game('b', '2026-09-12T18:20:00Z', null),
    ])
    expect(seance).toMatchObject({ endedAt: null, durationSeconds: null, count: 2 })
  })
})

describe('computePlayTotals', () => {
  it('additionne sûres et estimées à part, jamais l’inconnu ni l’en-cours', () => {
    const totals = computePlayTotals(
      [
        game('sure', '2026-09-12T18:00:00Z', 30, { reliability: 'reliable' }),
        game('estimee', '2026-09-12T19:00:00Z', 20, { reliability: 'estimated', humanCount: 1 }),
        game('inconnue', '2026-09-12T20:00:00Z', 420, { reliability: 'unknown' }),
        game('en-cours', '2026-09-12T21:00:00Z', null, { reliability: 'unknown', humanCount: 1 }),
      ],
      '2026-09-12'
    )
    expect(totals).toEqual({ games: 4, solo: 2, reliableSeconds: 1800, estimatedSeconds: 1200 })
  })

  it('range une partie au jour de Paris de son lancement, pas au jour UTC', () => {
    const totals = computePlayTotals(
      [
        // 06/09 23:30 UTC = 07/09 01:30 à Paris (heure d'été) : dans la fenêtre.
        game('apres-minuit', '2026-09-06T23:30:00Z', 10),
        // 06/09 21:30 UTC = 06/09 23:30 à Paris : la veille, hors fenêtre.
        game('avant-minuit', '2026-09-06T21:30:00Z', 10),
      ],
      '2026-09-07'
    )
    expect(totals.games).toBe(1)
  })
})

describe('summarizeAccountPlay', () => {
  it('découpe 7 j et 30 j en jours de Paris, aujourd’hui compris', () => {
    const now = new Date('2026-09-13T10:00:00Z')
    const { totals } = summarizeAccountPlay(
      [
        game('aujourdhui', '2026-09-13T08:00:00Z', 10),
        game('j-6', '2026-09-07T08:00:00Z', 10),
        game('j-7', '2026-09-06T08:00:00Z', 10),
        game('j-29', '2026-08-15T08:00:00Z', 10),
        game('j-30', '2026-08-14T08:00:00Z', 10),
      ],
      now
    )
    expect(totals.d7.games).toBe(2)
    expect(totals.d30.games).toBe(4)
  })

  it('reste juste le soir du passage à l’heure d’hiver (25/10/2026 à 22:30 UTC)', () => {
    // 23:30 à Paris le 25/10 : la fenêtre de 7 jours part du 19/10.
    const now = new Date('2026-10-25T22:30:00Z')
    const { totals } = summarizeAccountPlay(
      [
        // 19/10 00:30 à Paris (UTC+2) : premier jour de la fenêtre.
        game('premier-jour', '2026-10-18T22:30:00Z', 10),
        // 18/10 23:30 à Paris : la veille.
        game('veille', '2026-10-18T21:30:00Z', 10),
      ],
      now
    )
    expect(totals.d7.games).toBe(1)
    expect(totals.d30.games).toBe(2)
  })

  it('borne le nombre de séances renvoyées', () => {
    const games = Array.from({ length: 15 }, (_, i) =>
      game(`g${i}`, new Date(Date.UTC(2026, 8, 1 + i, 18)).toISOString(), 10)
    )
    const { seances } = summarizeAccountPlay(games, new Date('2026-09-16T10:00:00Z'))
    expect(seances).toHaveLength(10)
    expect(seances[0].startedAt).toBe('2026-09-15T18:00:00.000Z')
  })
})

describe('summarizeMatchResults', () => {
  it('ventile victoires et défaites par jeu, le plus joué d’abord', () => {
    expect(
      summarizeMatchResults([
        { gameId: 'quiz', outcome: 'win', count: 2 },
        { gameId: 'menteur', outcome: 'loss', count: 1 },
        { gameId: 'quiz', outcome: 'loss', count: 3 },
      ])
    ).toEqual([
      { gameId: 'quiz', wins: 2, losses: 3 },
      { gameId: 'menteur', wins: 0, losses: 1 },
    ])
  })
})

describe('getAccountActivity', () => {
  const now = new Date('2026-09-13T10:00:00Z')

  function seat(id: string, startIso: string, minutes: number, endReason: string | null, humanCount = 2) {
    const startedAt = new Date(startIso)
    return {
      session: {
        id,
        gameId: 'quiz',
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * MIN),
        endReason,
        humanCount,
      },
    }
  }

  beforeEach(() => {
    userMock.findUnique.mockResolvedValue({
      email: null,
      isGuest: true,
      onlineXp: 120,
      streakCount: 3,
      streakLastDay: '2026-09-12',
    })
    listGameSessionsMock.mockResolvedValue({ sessions: [], total: 0 })
    seatMock.findMany.mockResolvedValue([])
    historyMock.findMany.mockResolvedValue([])
    resultMock.groupBy.mockResolvedValue([])
    presenceMock.findMany.mockResolvedValue([])
    ipsMock.mockResolvedValue(new Map())
  })

  it('renvoie null pour un compte inexistant ou legacy (ni email ni invité)', async () => {
    userMock.findUnique.mockResolvedValueOnce(null)
    expect(await getAccountActivity('absent', now)).toBeNull()

    userMock.findUnique.mockResolvedValueOnce({
      email: null,
      isGuest: false,
      onlineXp: 0,
      streakCount: 0,
      streakLastDay: null,
    })
    expect(await getAccountActivity('legacy', now)).toBeNull()
  })

  it('lit le journal du compte depuis minuit de Paris il y a 29 jours', async () => {
    await getAccountActivity('u1', now)

    expect(listGameSessionsMock).toHaveBeenCalledWith({ skip: 0, take: 20, userId: 'u1' })
    const where = seatMock.findMany.mock.calls[0][0].where
    expect(where.userId).toBe('u1')
    // 15/08/2026 00:00 à Paris (UTC+2).
    expect(where.session.startedAt.gte).toEqual(new Date('2026-08-14T22:00:00Z'))
    expect(ipsMock).toHaveBeenCalledWith(['user:u1'])
  })

  it('déduit la fiabilité du motif de fin et ne compte pas deux fois un siège doublé', async () => {
    seatMock.findMany.mockResolvedValue([
      seat('fin', '2026-09-12T18:00:00Z', 30, 'finished'),
      seat('fin', '2026-09-12T18:00:00Z', 30, 'finished'),
      seat('abandon', '2026-09-12T20:00:00Z', 20, 'abandoned', 1),
      seat('ancienne', '2026-09-11T18:00:00Z', 420, null),
    ])

    const activity = await getAccountActivity('u1', now)

    expect(activity?.totals.d7).toEqual({ games: 3, solo: 1, reliableSeconds: 1800, estimatedSeconds: 1200 })
    expect(activity?.seances.map((s) => s.reliability)).toEqual(['estimated', 'reliable', 'unknown'])
  })

  it('sert navigateurs et réseaux sans visitorId, et le bilan par jeu', async () => {
    const lastSeen = new Date('2026-09-13T09:00:00Z')
    presenceMock.findMany.mockResolvedValue([
      { userId: 'u1', userSeenAt: lastSeen, lastSeen, lastDevice: 'mobile', country: 'FR' },
      { userId: 'u1', userSeenAt: null, lastSeen, lastDevice: 'pc', country: null },
    ])
    ipsMock.mockResolvedValue(
      new Map([
        [
          'user:u1',
          [
            { ip: '2a01:cb05:545:a200::1', country: 'FR', firstSeenAt: '2026-09-10T08:00:00.000Z', lastSeenAt: '2026-09-12T08:00:00.000Z' },
            { ip: '2a01:cb05:545:a200::2', country: 'FR', firstSeenAt: '2026-09-07T08:00:00.000Z', lastSeenAt: '2026-09-11T08:00:00.000Z' },
          ],
        ],
      ])
    )
    resultMock.groupBy.mockResolvedValue([{ gameId: 'quiz', outcome: 'win', _count: { _all: 4 } }])
    historyMock.findMany.mockResolvedValue([
      { gameId: 'quiz', playCount: 6, lastPlayedAt: new Date('2026-09-12T18:00:00Z') },
    ])

    const activity = await getAccountActivity('u1', now)

    expect(activity?.browsers).toEqual([
      { lastSeen: lastSeen.toISOString(), device: 'mobile', country: 'FR', connectedHere: true },
      { lastSeen: lastSeen.toISOString(), device: 'pc', country: null, connectedHere: false },
    ])
    expect(activity?.networks).toHaveLength(1)
    expect(activity?.networks[0]).toMatchObject({
      key: '2a01:cb05:0545:a200::/64',
      family: 'ipv6',
      count: 2,
      firstSeenAt: '2026-09-07T08:00:00.000Z',
      lastSeenAt: '2026-09-12T08:00:00.000Z',
      countries: ['FR'],
    })
    expect(activity?.results).toEqual([{ gameId: 'quiz', wins: 4, losses: 0 }])
    expect(activity?.history).toEqual([{ gameId: 'quiz', playCount: 6, lastPlayedAt: '2026-09-12T18:00:00.000Z' }])
    expect(activity?.progression).toEqual({ onlineXp: 120, streakCount: 3, streakLastDay: '2026-09-12' })
    expect(activity?.journalSince).toBe('2026-09-10')
  })
})
