import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fiche compte, activité en ligne et visites. Ce qui se calcule ici doit tenir
 * ces promesses :
 *  - une séance regroupe les parties enchaînées à MOINS de 30 min d'écart, et
 *    prend la pire fiabilité de ses parties ;
 *  - les tuiles 7 j / 30 j découpent en jours de PARIS, changement d'heure
 *    compris, et n'additionnent jamais une durée inconnue ou en cours ;
 *  - le bilan victoires / défaites se lit par jeu ;
 *  - la réponse ne sert ni visitorId ni IP de navigateur, et ignore un compte
 *    hors périmètre ;
 *  - deux visites créées au même instant n'en font qu'une, sans compter deux
 *    fois la même minute ; deux visites distinctes ne sont jamais fusionnées ;
 *  - la tranche horaire suit l'heure de PARIS, changements d'heure compris ;
 *  - une partie du journal est rattachée à la visite pendant laquelle elle a
 *    été lancée, et à aucune autre.
 * La base est simulée : on vérifie les calculs et la forme, pas Prisma.
 */
const {
  userMock,
  seatMock,
  historyMock,
  resultMock,
  presenceMock,
  visitMock,
  listGameSessionsMock,
  ipsMock,
} = vi.hoisted(() => ({
  userMock: { findUnique: vi.fn() },
  seatMock: { findMany: vi.fn() },
  historyMock: { findMany: vi.fn() },
  resultMock: { groupBy: vi.fn() },
  presenceMock: { findMany: vi.fn(), groupBy: vi.fn() },
  visitMock: { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() },
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
    accountVisit: visitMock,
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
  buildAccountVisitRows,
  computePlayTotals,
  computeVisitTotals,
  getAccountActivity,
  groupSeances,
  listAccountVisits,
  mergeOverlappingVisits,
  parisVisitSlot,
  summarizeAccountPlay,
  summarizeAccountVisits,
  summarizeMatchResults,
  summarizeRecentVisitsByUser,
  summarizeVisitsCoverage,
  type AccountPlayedGame,
  type AccountVisitRow,
  type StoredAccountVisit,
} from '@/lib/account-activity-server'

const MIN = 60 * 1000

/** Visite stockée de test : début ISO, dernier battement N min plus tard. */
function stored(
  startIso: string,
  minutesToLastBeat: number,
  extra: Partial<StoredAccountVisit> = {}
): StoredAccountVisit {
  const startedAt = new Date(startIso)
  return {
    startedAt,
    lastBeatAt: new Date(startedAt.getTime() + minutesToLastBeat * MIN),
    visibleSeconds: 0,
    activeSeconds: 0,
    gameSeconds: 0,
    device: 'pc',
    ...extra,
  }
}

/** Ligne de chronologie réduite à ce que lisent les cumuls. */
function row(day: string, durationSeconds: number, extra: Partial<AccountVisitRow> = {}): AccountVisitRow {
  return {
    day,
    slot: 'evening',
    startedAt: `${day}T18:00:00.000Z`,
    endedAt: `${day}T19:00:00.000Z`,
    durationSeconds,
    visibleSeconds: 0,
    activeSeconds: 0,
    gameSeconds: 0,
    device: 'pc',
    games: [],
    ...extra,
  }
}

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

/** Siège du journal tel que le lit Prisma (OnlineGameSessionPlayer ⨝ OnlineGameSession). */
function seat(
  id: string,
  startIso: string,
  minutes: number,
  endReason: string | null,
  humanCount = 2,
  gameId = 'quiz'
) {
  const startedAt = new Date(startIso)
  return {
    session: {
      id,
      gameId,
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * MIN),
      endReason,
      humanCount,
    },
  }
}

describe('mergeOverlappingVisits', () => {
  it('fusionne deux visites créées au même instant, sans perdre ni doubler le temps', () => {
    const merged = mergeOverlappingVisits([
      // Le doublon : créé 20 ms plus tard, jamais crédité ensuite.
      stored('2026-09-12T18:00:00.020Z', 0, { device: 'pc' }),
      stored('2026-09-12T18:00:00Z', 60, {
        visibleSeconds: 3600,
        activeSeconds: 3000,
        gameSeconds: 1200,
        device: 'mobile',
      }),
    ])

    expect(merged).toEqual([
      {
        startedAt: new Date('2026-09-12T18:00:00Z'),
        lastBeatAt: new Date('2026-09-12T19:00:00Z'),
        visibleSeconds: 3600,
        activeSeconds: 3000,
        gameSeconds: 1200,
        device: 'mobile',
      },
    ])
  })

  it('borne les crédits à l’écart entre premier et dernier battement si les deux copies ont crédité', () => {
    const [visit] = mergeOverlappingVisits([
      stored('2026-09-12T18:00:00Z', 2, { visibleSeconds: 120, activeSeconds: 120, gameSeconds: 60 }),
      stored('2026-09-12T18:00:00Z', 2, { visibleSeconds: 90, activeSeconds: 30, gameSeconds: 90 }),
    ])
    // 2 min réelles : jamais 210 s de visible, et actif / en partie restent dans le visible.
    expect(visit).toMatchObject({ visibleSeconds: 120, activeSeconds: 120, gameSeconds: 120 })
  })

  it('ne fusionne jamais deux visites distinctes (reprise après plus de 30 min)', () => {
    const merged = mergeOverlappingVisits([
      stored('2026-09-12T18:00:00Z', 30, { visibleSeconds: 1800 }),
      // 31 min après le dernier battement (18:30) : nouvelle visite.
      stored('2026-09-12T19:01:00Z', 10, { visibleSeconds: 600 }),
    ])
    expect(merged.map((v) => v.visibleSeconds)).toEqual([1800, 600])
  })

  it('arrête le chevauchement à la fin calculée, dernier battement + 60 s', () => {
    // Dernier battement 18:30 : la visite court jusqu'à 18:31.
    const inside = mergeOverlappingVisits([
      stored('2026-09-12T18:00:00Z', 30),
      stored('2026-09-12T18:30:59Z', 5),
    ])
    expect(inside).toHaveLength(1)
    expect(inside[0].lastBeatAt).toEqual(new Date('2026-09-12T18:35:59Z'))

    const outside = mergeOverlappingVisits([
      stored('2026-09-12T18:00:00Z', 30),
      stored('2026-09-12T18:31:01Z', 5),
    ])
    expect(outside).toHaveLength(2)
  })

  it('garde l’appareil du premier battement, sinon celui du doublon', () => {
    const [visit] = mergeOverlappingVisits([
      stored('2026-09-12T18:00:00Z', 10, { device: null }),
      stored('2026-09-12T18:00:00.005Z', 0, { device: 'tablet' }),
    ])
    expect(visit.device).toBe('tablet')
  })
})

describe('parisVisitSlot', () => {
  it('découpe nuit / matin / après-midi / soir en heure de Paris (été, UTC+2)', () => {
    expect(parisVisitSlot(new Date('2026-09-12T03:59:00Z'))).toBe('night') // 05:59
    expect(parisVisitSlot(new Date('2026-09-12T04:00:00Z'))).toBe('morning') // 06:00
    expect(parisVisitSlot(new Date('2026-09-12T09:59:00Z'))).toBe('morning') // 11:59
    expect(parisVisitSlot(new Date('2026-09-12T10:00:00Z'))).toBe('afternoon') // 12:00
    expect(parisVisitSlot(new Date('2026-09-12T15:59:00Z'))).toBe('afternoon') // 17:59
    expect(parisVisitSlot(new Date('2026-09-12T16:00:00Z'))).toBe('evening') // 18:00
    expect(parisVisitSlot(new Date('2026-09-12T21:59:00Z'))).toBe('evening') // 23:59
    expect(parisVisitSlot(new Date('2026-09-12T22:00:00Z'))).toBe('night') // 00:00 le 13
  })

  it('suit le passage à l’heure d’hiver (25/10/2026) : même heure UTC, autre tranche', () => {
    expect(parisVisitSlot(new Date('2026-10-24T04:30:00Z'))).toBe('morning') // 06:30 (UTC+2)
    expect(parisVisitSlot(new Date('2026-10-25T04:30:00Z'))).toBe('night') // 05:30 (UTC+1)
    expect(parisVisitSlot(new Date('2026-10-24T16:30:00Z'))).toBe('evening') // 18:30
    expect(parisVisitSlot(new Date('2026-10-25T16:30:00Z'))).toBe('afternoon') // 17:30
    // L'heure doublée : 02:30 deux fois, la nuit les deux fois.
    expect(parisVisitSlot(new Date('2026-10-25T00:30:00Z'))).toBe('night')
    expect(parisVisitSlot(new Date('2026-10-25T01:30:00Z'))).toBe('night')
  })

  it('suit le passage à l’heure d’été (28/03/2027)', () => {
    expect(parisVisitSlot(new Date('2027-03-27T04:30:00Z'))).toBe('night') // 05:30 (UTC+1)
    expect(parisVisitSlot(new Date('2027-03-28T04:30:00Z'))).toBe('morning') // 06:30 (UTC+2)
    expect(parisVisitSlot(new Date('2027-03-27T10:30:00Z'))).toBe('morning') // 11:30
    expect(parisVisitSlot(new Date('2027-03-28T10:30:00Z'))).toBe('afternoon') // 12:30
  })
})

describe('buildAccountVisitRows', () => {
  it('rattache chaque partie à la visite où elle a été lancée, fin = dernier battement + 60 s', () => {
    const rows = buildAccountVisitRows(
      [
        stored('2026-09-12T18:00:00Z', 60, { visibleSeconds: 3000, activeSeconds: 2400, gameSeconds: 1800 }),
        stored('2026-09-12T21:00:00Z', 30, { device: 'mobile' }),
      ],
      [
        // Désordre volontaire : le rattachement trie lui-même.
        game('menteur-tard', '2026-09-12T21:05:00Z', 10, { gameId: 'menteur' }),
        game('revanche', '2026-09-12T18:50:00Z', 5, { gameId: 'quiz' }),
        game('premiere', '2026-09-12T18:10:00Z', 20, { gameId: 'quiz' }),
        game('seconde', '2026-09-12T18:40:00Z', 10, { gameId: 'sans-filtre' }),
        // 19:00:30 : dans la minute de fin de la première visite.
        game('dans-la-fin', '2026-09-12T19:00:30Z', 10, { gameId: 'menteur' }),
        // Entre deux visites, et juste avant la première : rattachées à rien.
        game('entre', '2026-09-12T19:30:00Z', 10, { gameId: 'quiz' }),
        game('avant', '2026-09-12T17:59:59Z', 10, { gameId: 'quiz' }),
      ]
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ startedAt: '2026-09-12T21:00:00.000Z', device: 'mobile', games: ['menteur'] })
    expect(rows[1]).toEqual({
      day: '2026-09-12',
      slot: 'evening', // 20:00 à Paris
      startedAt: '2026-09-12T18:00:00.000Z',
      endedAt: '2026-09-12T19:01:00.000Z',
      durationSeconds: 3660,
      visibleSeconds: 3000,
      activeSeconds: 2400,
      gameSeconds: 1800,
      device: 'pc',
      // Une entrée par partie, revanche comprise, dans l'ordre de lancement.
      games: ['quiz', 'sans-filtre', 'quiz', 'menteur'],
    })
  })

  it('range au jour et à la tranche de Paris, et ne rattache une partie qu’une fois malgré un doublon', () => {
    const rows = buildAccountVisitRows(
      [
        // 22:30 UTC le 12/09 = 00:30 le 13/09 à Paris ; créée deux fois.
        stored('2026-09-12T22:30:00Z', 45, { visibleSeconds: 2700 }),
        stored('2026-09-12T22:30:00.010Z', 0),
      ],
      [game('minuit', '2026-09-12T22:40:00Z', 10, { gameId: 'quiz' })]
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ day: '2026-09-13', slot: 'night', games: ['quiz'], visibleSeconds: 2700 })
  })

  it('compte une visite d’un seul battement pour une minute, sans crédit', () => {
    const [visit] = buildAccountVisitRows([stored('2026-09-12T18:00:00Z', 0)], [])
    expect(visit).toMatchObject({ durationSeconds: 60, visibleSeconds: 0, games: [] })
  })
})

describe('computeVisitTotals', () => {
  it('additionne les visites de la fenêtre et prend la durée médiane', () => {
    const totals = computeVisitTotals(
      [
        row('2026-09-13', 600, { visibleSeconds: 500, activeSeconds: 400, gameSeconds: 100 }),
        row('2026-09-12', 60, { visibleSeconds: 0 }),
        row('2026-09-10', 3600, { visibleSeconds: 3000, activeSeconds: 1000, gameSeconds: 2000 }),
        // Hors fenêtre.
        row('2026-09-09', 9000, { visibleSeconds: 9000, activeSeconds: 9000, gameSeconds: 9000 }),
      ],
      '2026-09-10'
    )
    expect(totals).toEqual({
      visits: 3,
      visibleSeconds: 3500,
      activeSeconds: 1400,
      gameSeconds: 2100,
      medianVisitSeconds: 600,
    })
  })

  it('moyenne les deux durées centrales pour un nombre pair, et vaut 0 sans visite', () => {
    const rows = [row('2026-09-13', 60), row('2026-09-13', 1200), row('2026-09-13', 600), row('2026-09-13', 3600)]
    expect(computeVisitTotals(rows, '2026-09-13').medianVisitSeconds).toBe(900)
    expect(computeVisitTotals([], '2026-09-13')).toEqual({
      visits: 0,
      visibleSeconds: 0,
      activeSeconds: 0,
      gameSeconds: 0,
      medianVisitSeconds: 0,
    })
  })
})

describe('summarizeAccountVisits', () => {
  const now = new Date('2026-09-13T10:00:00Z')
  const noCoverage = { trackedBrowsers: 0, seenBrowsers: 0 }

  it('découpe 7 j et 30 j en jours de Paris et dit depuis quand le compte est suivi', () => {
    const rows = [
      row('2026-09-13', 60),
      row('2026-09-07', 60),
      row('2026-09-06', 60),
      row('2026-08-15', 60),
      row('2026-08-14', 60),
    ]
    const summary = summarizeAccountVisits(
      {
        windowRows: rows,
        recentRows: rows,
        // 01/07 22:30 UTC = 02/07 00:30 à Paris.
        firstVisitStartedAt: new Date('2026-07-01T22:30:00Z'),
        coverage: { trackedBrowsers: 1, seenBrowsers: 2 },
      },
      now
    )
    expect(summary.tracked).toBe(true)
    expect(summary.since).toBe('2026-07-02')
    expect(summary.totals.d7.visits).toBe(2)
    expect(summary.totals.d30.visits).toBe(4)
    expect(summary.coverage).toEqual({ trackedBrowsers: 1, seenBrowsers: 2 })
  })

  it('borne la chronologie aux 20 plus récentes', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row(new Date(Date.UTC(2026, 8, 13 - i, 12)).toISOString().slice(0, 10), 60)
    )
    const summary = summarizeAccountVisits(
      { windowRows: rows, recentRows: rows, firstVisitStartedAt: new Date('2026-08-01T10:00:00Z'), coverage: noCoverage },
      now
    )
    expect(summary.recent).toHaveLength(20)
    expect(summary.recent[0].day).toBe('2026-09-13')
  })

  it('garde la chronologie d’un compte absent depuis plus de 30 jours, sans la compter dans les cumuls', () => {
    const old = [row('2026-07-20', 600), row('2026-07-18', 300)]
    const summary = summarizeAccountVisits(
      { windowRows: [], recentRows: old, firstVisitStartedAt: new Date('2026-07-18T18:00:00Z'), coverage: noCoverage },
      now
    )
    expect(summary.tracked).toBe(true)
    expect(summary.totals.d30.visits).toBe(0)
    expect(summary.recent.map((visit) => visit.day)).toEqual(['2026-07-20', '2026-07-18'])
  })

  it('distingue « non suivi » : aucune visite conservée', () => {
    expect(
      summarizeAccountVisits({ windowRows: [], recentRows: [], firstVisitStartedAt: null, coverage: noCoverage }, now)
    ).toEqual({
      tracked: false,
      since: null,
      totals: {
        d7: { visits: 0, visibleSeconds: 0, activeSeconds: 0, gameSeconds: 0, medianVisitSeconds: 0 },
        d30: { visits: 0, visibleSeconds: 0, activeSeconds: 0, gameSeconds: 0, medianVisitSeconds: 0 },
      },
      recent: [],
      coverage: noCoverage,
    })
  })
})

describe('summarizeVisitsCoverage', () => {
  it("compte à part les navigateurs de l'accord courant, anciens accords compris dans les vus", () => {
    expect(
      summarizeVisitsCoverage([
        { consentVersion: '2', count: 2 },
        { consentVersion: null, count: 3 },
      ])
    ).toEqual({ trackedBrowsers: 2, seenBrowsers: 5 })
  })

  it('aucun navigateur lié : 0 sur 0', () => {
    expect(summarizeVisitsCoverage([])).toEqual({ trackedBrowsers: 0, seenBrowsers: 0 })
  })
})

describe('listAccountVisits', () => {
  const now = new Date('2026-09-13T10:00:00Z')

  it('lit visites et journal sur la même fenêtre de Paris, puis fusionne et rattache', async () => {
    visitMock.findMany.mockResolvedValue([
      stored('2026-09-12T18:00:00Z', 60, { visibleSeconds: 3600 }),
      stored('2026-09-12T18:00:00.030Z', 0),
    ])
    seatMock.findMany.mockResolvedValue([
      seat('a', '2026-09-12T18:20:00Z', 20, 'finished', 2, 'sans-filtre'),
      seat('a', '2026-09-12T18:20:00Z', 20, 'finished', 2, 'sans-filtre'),
    ])

    const rows = await listAccountVisits('u1', 7, now)

    // 07/09/2026 00:00 à Paris (UTC+2).
    const since = new Date('2026-09-06T22:00:00Z')
    expect(visitMock.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1', startedAt: { gte: since } })
    expect(seatMock.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      session: { startedAt: { gte: since } },
    })
    // Doublon de création fusionné, siège doublé compté une fois.
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ visibleSeconds: 3600, games: ['sans-filtre'] })
  })

  it('prend 30 jours de Paris par défaut', async () => {
    visitMock.findMany.mockResolvedValue([])
    seatMock.findMany.mockResolvedValue([])
    await listAccountVisits('u1', undefined, now)
    // 15/08/2026 00:00 à Paris.
    expect(visitMock.findMany.mock.calls[0][0].where.startedAt.gte).toEqual(new Date('2026-08-14T22:00:00Z'))
  })
})

describe('summarizeRecentVisitsByUser', () => {
  it('ne lit rien pour une page vide', async () => {
    expect((await summarizeRecentVisitsByUser([])).size).toBe(0)
    expect(visitMock.groupBy).not.toHaveBeenCalled()
  })

  it('fait UN groupBy sur les comptes de la page, 7 jours de Paris', async () => {
    visitMock.groupBy.mockResolvedValue([
      { userId: 'u1', _count: { _all: 3 }, _sum: { activeSeconds: 4200 } },
      { userId: 'u2', _count: { _all: 1 }, _sum: { activeSeconds: null } },
    ])

    const digests = await summarizeRecentVisitsByUser(['u1', 'u2', 'u3'], new Date('2026-09-13T10:00:00Z'))

    expect(visitMock.groupBy).toHaveBeenCalledTimes(1)
    expect(visitMock.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      // 07/09/2026 00:00 à Paris.
      where: { userId: { in: ['u1', 'u2', 'u3'] }, startedAt: { gte: new Date('2026-09-06T22:00:00Z') } },
      _count: { _all: true },
      _sum: { activeSeconds: true },
    })
    expect(digests.get('u1')).toEqual({ visits: 3, activeSeconds: 4200 })
    expect(digests.get('u2')).toEqual({ visits: 1, activeSeconds: 0 })
    expect(digests.has('u3')).toBe(false)
  })
})

describe('getAccountActivity', () => {
  const now = new Date('2026-09-13T10:00:00Z')

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
    presenceMock.groupBy.mockResolvedValue([])
    visitMock.findMany.mockResolvedValue([])
    visitMock.findFirst.mockResolvedValue(null)
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

  it('dit « non suivi » quand le compte n’a aucune visite conservée', async () => {
    const activity = await getAccountActivity('u1', now)
    expect(activity?.visits).toMatchObject({ tracked: false, since: null, recent: [] })
    expect(activity?.visits.totals.d30.visits).toBe(0)
  })

  it('sert la couverture : navigateurs liés au compte, par version du consentement', async () => {
    presenceMock.groupBy.mockResolvedValue([
      { consentVersion: '2', _count: { _all: 1 } },
      { consentVersion: null, _count: { _all: 2 } },
    ])
    const activity = await getAccountActivity('u1', now)
    expect(presenceMock.groupBy).toHaveBeenCalledWith({
      by: ['consentVersion'],
      where: { userId: 'u1' },
      _count: { _all: true },
    })
    expect(activity?.visits.coverage).toEqual({ trackedBrowsers: 1, seenBrowsers: 3 })
  })

  it('lit les dernières visites sans borne de date, et le journal depuis la plus ancienne', async () => {
    const old = stored('2026-07-20T18:00:00Z', 30, { visibleSeconds: 1800 })
    // 1er appel : fenêtre de 30 jours (vide) ; 2e : dernières visites, sans borne.
    visitMock.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([old])
    visitMock.findFirst.mockResolvedValue({ startedAt: old.startedAt })
    seatMock.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([seat('vieille', '2026-07-20T18:10:00Z', 15, 'finished', 2, 'menteur')])

    const activity = await getAccountActivity('u1', now)

    expect(visitMock.findMany.mock.calls[1][0]).toMatchObject({
      where: { userId: 'u1' },
      orderBy: { startedAt: 'desc' },
      take: 40,
    })
    // Journal relu depuis le début de la plus ancienne visite de la chronologie.
    expect(seatMock.findMany.mock.calls[1][0].where.session.startedAt.gte).toEqual(old.startedAt)
    expect(activity?.visits.totals.d30.visits).toBe(0)
    expect(activity?.visits.recent).toHaveLength(1)
    expect(activity?.visits.recent[0]).toMatchObject({ day: '2026-07-20', games: ['menteur'] })
  })

  it('sert les visites de la fenêtre avec les parties du journal lancées pendant chacune', async () => {
    seatMock.findMany.mockResolvedValue([
      seat('dedans', '2026-09-12T18:10:00Z', 20, 'finished'),
      seat('ailleurs', '2026-09-11T12:00:00Z', 20, 'finished', 2, 'menteur'),
    ])
    visitMock.findMany.mockResolvedValue([
      stored('2026-09-12T18:00:00Z', 40, { visibleSeconds: 2400, activeSeconds: 2000, gameSeconds: 1200 }),
    ])
    visitMock.findFirst.mockResolvedValue({ startedAt: new Date('2026-09-01T08:00:00Z') })

    const activity = await getAccountActivity('u1', now)

    // Même fenêtre que le journal : 15/08/2026 00:00 à Paris.
    expect(visitMock.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      startedAt: { gte: new Date('2026-08-14T22:00:00Z') },
    })
    expect(visitMock.findFirst.mock.calls[0][0]).toMatchObject({ where: { userId: 'u1' }, orderBy: { startedAt: 'asc' } })
    expect(activity?.visits.tracked).toBe(true)
    expect(activity?.visits.since).toBe('2026-09-01')
    expect(activity?.visits.totals.d7).toEqual({
      visits: 1,
      visibleSeconds: 2400,
      activeSeconds: 2000,
      gameSeconds: 1200,
      medianVisitSeconds: 2460,
    })
    expect(activity?.visits.recent).toEqual([
      {
        day: '2026-09-12',
        slot: 'evening',
        startedAt: '2026-09-12T18:00:00.000Z',
        endedAt: '2026-09-12T18:41:00.000Z',
        durationSeconds: 2460,
        visibleSeconds: 2400,
        activeSeconds: 2000,
        gameSeconds: 1200,
        device: 'pc',
        games: ['quiz'],
      },
    ])
  })
})
