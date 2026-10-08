import { beforeEach, describe, expect, it, vi } from 'vitest'

// `summarizeOnlinePlay` est pure ; le reste du module lit la base, simulée
// ici : on vérifie les calculs et la forme des réponses, pas Prisma.
const { prismaMock, cleanupAbandonedRoomsMock, listFlaggedMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRawUnsafe: vi.fn(),
    user: { count: vi.fn(), findMany: vi.fn() },
    onlineGameSession: { findMany: vi.fn() },
    siteSetting: { findUnique: vi.fn() },
    accountBanEvent: { create: vi.fn(), findMany: vi.fn() },
    cosmeticGrant: { findMany: vi.fn() },
    featureBan: { findMany: vi.fn() },
    moderationTerm: { findMany: vi.fn() },
    userFeedback: { findMany: vi.fn() },
    dailyVisitor: { groupBy: vi.fn() },
    localGameDaily: { findMany: vi.fn(), aggregate: vi.fn() },
    onlineRoom: { findMany: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
  },
  cleanupAbandonedRoomsMock: vi.fn(),
  listFlaggedMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/online-room', () => ({ cleanupAbandonedRooms: cleanupAbandonedRoomsMock }))
vi.mock('@/lib/name-moderation-attempts-server', () => ({
  listFlaggedNameModerationUsers: listFlaggedMock,
}))

import { FEEDBACK_INBOX_WHERE } from '@/lib/feedback'
import { getGameById } from '@/lib/games'
import { parisDayOffset } from '@/lib/paris-time'
import {
  getGrowthStats,
  getSupervisionOverview,
  invalidateGrowthStats,
  logStaffAction,
  summarizeLocalPlay,
  summarizeOnlinePlay,
  type LocalGameDailyRow,
  type OnlinePlaySessionRow,
} from '@/lib/supervision-overview-server'

beforeEach(() => {
  vi.resetAllMocks()
})

/**
 * Joueurs du jeu en ligne (Vue d'ensemble) : jours de PARIS justes le jour du
 * changement d'heure, équipe exclue des effectifs ET de la série, sièges sans
 * compte comptés à part. `now` = 25/10/2026 à 23 h 30, heure de Paris — le
 * jour où l'on repasse à l'heure d'hiver.
 */
const NOW = new Date('2026-10-25T22:30:00.000Z')

const player = (userId: string, isGuest = false) => ({ userId, user: { role: 'user', isGuest } })
const staff = (userId: string) => ({ userId, user: { role: 'admin', isGuest: false } })
const noAccount = { userId: null, user: null }

const session = (
  startedAt: string,
  humanSeats: OnlinePlaySessionRow['humanSeats'],
  humanCount = 1,
  gameId = 'quiz'
): OnlinePlaySessionRow => ({
  startedAt: new Date(startedAt),
  gameId,
  humanCount,
  humanSeats,
})

const SESSIONS: OnlinePlaySessionRow[] = [
  // 25/10 à 1 h 30 à Paris (encore à l'heure d'été) : aujourd'hui.
  session('2026-10-24T23:30:00.000Z', [player('u1')]),
  // 24/10 à 23 h 30 à Paris : hier, donc hors de « aujourd'hui ».
  session('2026-10-24T21:30:00.000Z', [player('g1', true)], 1, 'menteur'),
  // 19/10 à 0 h 30 à Paris : premier jour des 7 derniers jours.
  session('2026-10-18T22:30:00.000Z', [player('u2')]),
  // 18/10 à 23 h 30 à Paris : juste hors des 7 jours, dans les 30.
  session('2026-10-18T21:30:00.000Z', [player('u3')], 1, 'pmu'),
  // humanCount écrit à 1, mais deux humains à table (l'un jamais rattaché).
  session('2026-10-20T10:00:00.000Z', [player('u1'), noAccount], 1, 'menteur'),
  // Partie de l'équipe seule (test de TryBotsGate) : hors de la série.
  session('2026-10-21T10:00:00.000Z', [staff('a1')], 1, 'pmu'),
  // Équipe + joueur : une partie de joueur, avec un autre humain.
  session('2026-10-22T10:00:00.000Z', [staff('a1'), player('u2')], 2),
  // Au-delà des 30 jours de Paris : ignorée.
  session('2026-09-20T10:00:00.000Z', [player('u9')], 1, 'pmu'),
]

describe('summarizeOnlinePlay', () => {
  const stats = summarizeOnlinePlay(SESSIONS, NOW)

  it('compte les comptes distincts sur 1, 7 et 30 jours de Paris, invités ventilés', () => {
    expect(stats.uniquePlayers).toEqual({
      d1: 1,
      d7: 3,
      d30: 4,
      guests: { d1: 0, d7: 1, d30: 1 },
    })
  })

  it('exclut l’équipe des effectifs et la compte à part', () => {
    expect(stats.staffExcluded).toBe(1)
  })

  it('compte à part les sièges humains sans compte', () => {
    expect(stats.deletedSeats30).toBe(1)
  })

  it('série de 14 jours de Paris distincts, sans doublon au changement d’heure', () => {
    const days = stats.launchesByDay.map((d) => d.day)
    expect(days).toHaveLength(14)
    expect(new Set(days).size).toBe(14)
    expect(days[0]).toBe('2026-10-12')
    expect(days[13]).toBe('2026-10-25')
  })

  it('classe solo / avec humains par sièges humains, et écarte les parties de l’équipe seule', () => {
    const byDay = new Map(stats.launchesByDay.map((d) => [d.day, d]))
    expect(byDay.get('2026-10-25')).toMatchObject({ solo: 1, withHumans: 0 })
    expect(byDay.get('2026-10-24')).toMatchObject({ solo: 1, withHumans: 0 })
    expect(byDay.get('2026-10-22')).toMatchObject({ solo: 0, withHumans: 1 })
    expect(byDay.get('2026-10-21')).toMatchObject({ solo: 0, withHumans: 0 })
    expect(byDay.get('2026-10-20')).toMatchObject({ solo: 0, withHumans: 1 })
    expect(byDay.get('2026-10-19')).toMatchObject({ solo: 1, withHumans: 0 })
    expect(byDay.get('2026-10-18')).toMatchObject({ solo: 1, withHumans: 0 })
  })

  it('traite les comptes de test comme l’équipe : hors effectifs et hors lancements quand ils jouent seuls', () => {
    const withTests = summarizeOnlinePlay(
      [
        ...SESSIONS,
        // Invité de test seul contre des bots (essai de TryBotsGate) : pas un lancement.
        session('2026-10-23T10:00:00.000Z', [player('t1', true)]),
        // Compte de test + joueur : une partie de joueur.
        session('2026-10-24T10:00:00.000Z', [player('t1', true), player('u1')], 2),
      ],
      NOW,
      ['t1']
    )
    expect(withTests.uniquePlayers).toEqual(stats.uniquePlayers)
    expect(withTests.testExcluded).toBe(1)
    expect(withTests.staffExcluded).toBe(1)
    const byDay = new Map(withTests.launchesByDay.map((d) => [d.day, d]))
    expect(byDay.get('2026-10-23')).toMatchObject({ solo: 0, withHumans: 0 })
    expect(byDay.get('2026-10-24')).toMatchObject({ solo: 1, withHumans: 1 })
    expect(stats.testExcluded).toBe(0)
  })

  it('compte les lancements par jeu sur 7 jours de Paris, avec humains ventilés, titres du catalogue', () => {
    // pmu : lancée le 18/10 à 23 h 30 à Paris (hors des 7 jours), ou par l'équipe seule.
    expect(stats.launchesByGame7d).toEqual([
      { gameId: 'quiz', gameTitle: 'Le Grand Pillaveur', launches: 3, withHumans: 1 },
      { gameId: 'menteur', gameTitle: 'Le Menteur', launches: 2, withHumans: 1 },
    ])
  })

  it('par jeu : même total que les 7 derniers jours de la série', () => {
    const lastWeek = stats.launchesByDay.slice(-7)
    expect(lastWeek[0].day).toBe('2026-10-19')
    const seriesTotal = lastWeek.reduce((sum, d) => sum + d.solo + d.withHumans, 0)
    expect(stats.launchesByGame7d.reduce((sum, g) => sum + g.launches, 0)).toBe(seriesTotal)
  })

  it('par jeu : écarte les parties des comptes de test seuls, garde un jeu retiré sous son identifiant', () => {
    const byGame = summarizeOnlinePlay(
      [
        // Compte de test seul : pas un lancement.
        session('2026-10-23T10:00:00.000Z', [player('t1', true)], 1, 'pmu'),
        // Compte de test + joueur : une partie de joueur, avec humains.
        session('2026-10-24T10:00:00.000Z', [player('t1', true), player('u1')], 2, 'pmu'),
        // Jeu absent du catalogue : son identifiant tient lieu de titre.
        session('2026-10-24T11:00:00.000Z', [player('u1')], 1, 'jeu-retire'),
        // 26/10 à 0 h 30 à Paris (heure d'hiver) : demain, hors de la série, donc ignorée.
        session('2026-10-25T23:30:00.000Z', [player('u1')], 1, 'jeu-retire'),
      ],
      NOW,
      ['t1']
    ).launchesByGame7d
    // À égalité de lancements : la partie avec humains d'abord.
    expect(byGame).toEqual([
      { gameId: 'pmu', gameTitle: 'Course PMU', launches: 1, withHumans: 1 },
      { gameId: 'jeu-retire', gameTitle: 'jeu-retire', launches: 1, withHumans: 0 },
    ])
  })

  it('sans partie : série de 14 jours à zéro, aucun jeu', () => {
    const empty = summarizeOnlinePlay([], NOW)
    expect(empty.launchesByDay).toHaveLength(14)
    expect(empty.launchesByDay.every((d) => d.solo === 0 && d.withHumans === 0)).toBe(true)
    expect(empty.launchesByGame7d).toEqual([])
  })
})

/**
 * Parties locales : compteurs anonymes par jour de Paris et par jeu. Même
 * `NOW` (25/10/2026 à 23 h 30 à Paris) : 7 jours = depuis le 19/10, 30 jours =
 * depuis le 26/09, série de 14 jours = depuis le 12/10.
 */
const LOCAL_ROWS: LocalGameDailyRow[] = [
  // Aujourd'hui : plus de fins que de lancements (revanches sur la même page).
  { day: '2026-10-25', gameId: 'pmu', starts: 3, ends: 4 },
  // Jeu retiré du catalogue : son identifiant tient lieu de titre.
  { day: '2026-10-24', gameId: 'jeu-retire', starts: 1, ends: 0 },
  // Ligne abîmée (négatif, NaN) : comptée nulle part.
  { day: '2026-10-24', gameId: 'pendu', starts: -1, ends: Number.NaN },
  // Premier jour des 7 jours ; Purple n'a pas d'écran de fin.
  { day: '2026-10-19', gameId: 'purple', starts: 2, ends: 0 },
  // Veille des 7 jours : dans les 30 et dans la série.
  { day: '2026-10-18', gameId: 'pyramide', starts: 5, ends: 2 },
  // Premier jour des 30 jours, hors de la série.
  { day: '2026-09-26', gameId: 'pmu', starts: 1, ends: 1 },
  // Veille des 30 jours, et un jour à venir : ignorés malgré l'appelant.
  { day: '2026-09-25', gameId: 'pmu', starts: 9, ends: 9 },
  { day: '2026-10-26', gameId: 'pmu', starts: 7, ends: 7 },
]

const titleOf = (gameId: string) => getGameById(gameId)?.title ?? gameId

describe('summarizeLocalPlay', () => {
  const stats = summarizeLocalPlay(LOCAL_ROWS, NOW, '2026-09-01')

  it('série de 14 jours de Paris, lancées et terminées par jour', () => {
    expect(stats.byDay).toHaveLength(14)
    expect(stats.byDay[0].day).toBe('2026-10-12')
    expect(stats.byDay[13]).toEqual({ day: '2026-10-25', starts: 3, ends: 4 })
    const byDay = new Map(stats.byDay.map((d) => [d.day, d]))
    expect(byDay.get('2026-10-24')).toEqual({ day: '2026-10-24', starts: 1, ends: 0 })
    expect(byDay.get('2026-10-19')).toEqual({ day: '2026-10-19', starts: 2, ends: 0 })
    expect(byDay.get('2026-10-18')).toEqual({ day: '2026-10-18', starts: 5, ends: 2 })
    expect(byDay.get('2026-10-20')).toEqual({ day: '2026-10-20', starts: 0, ends: 0 })
  })

  it('par jeu sur 7 jours : tri par lancements, titres du catalogue, jeux sans écran de fin signalés', () => {
    expect(stats.byGame.d7).toEqual([
      { gameId: 'pmu', gameTitle: titleOf('pmu'), starts: 3, ends: 4, noEndScreen: false },
      { gameId: 'purple', gameTitle: titleOf('purple'), starts: 2, ends: 0, noEndScreen: true },
      { gameId: 'jeu-retire', gameTitle: 'jeu-retire', starts: 1, ends: 0, noEndScreen: false },
    ])
    expect(stats.totals.d7).toEqual({ starts: 6, ends: 4 })
  })

  it('par jeu sur 30 jours : bornes de la fenêtre refaites, rien au-delà d’aujourd’hui', () => {
    expect(stats.byGame.d30.map((g) => [g.gameId, g.starts, g.ends])).toEqual([
      ['pyramide', 5, 2],
      ['pmu', 4, 5],
      ['purple', 2, 0],
      ['jeu-retire', 1, 0],
    ])
    expect(stats.totals.d30).toEqual({ starts: 12, ends: 7 })
  })

  it('premier jour mesuré rendu tel quel, jamais un jour à venir', () => {
    expect(stats.since).toBe('2026-09-01')
    expect(summarizeLocalPlay([], NOW, '2026-10-26').since).toBeNull()
  })

  it('sans compteur : série à zéro, aucun jeu, aucun jour de début', () => {
    const empty = summarizeLocalPlay([], NOW, null)
    expect(empty.since).toBeNull()
    expect(empty.byDay).toHaveLength(14)
    expect(empty.byDay.every((d) => d.starts === 0 && d.ends === 0)).toBe(true)
    expect(empty.byGame).toEqual({ d7: [], d30: [] })
    expect(empty.totals).toEqual({ d7: { starts: 0, ends: 0 }, d30: { starts: 0, ends: 0 } })
  })
})

describe('getGrowthStats', () => {
  beforeEach(() => {
    // Valeur mise en cache 5 min par processus : chaque test recalcule.
    invalidateGrowthStats()
    prismaMock.localGameDaily.findMany.mockResolvedValue([])
    prismaMock.localGameDaily.aggregate.mockResolvedValue({ _min: { day: null } })
  })

  /** Lectures de la croissance, toutes vides : chaque test surcharge ce qu'il vérifie. */
  function mockEmptyGrowth() {
    prismaMock.user.count.mockResolvedValue(0)
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      sql.includes('OnlineGameHistory') ? [] : [{ live: BigInt(0), stalled: BigInt(0) }]
    )
    prismaMock.siteSetting.findUnique.mockResolvedValue(null)
    prismaMock.onlineGameSession.findMany.mockResolvedValue([])
  }

  it('sert les parties locales des 30 derniers jours de Paris, avec le premier jour mesuré', async () => {
    mockEmptyGrowth()
    const today = parisDayOffset(0)
    prismaMock.localGameDaily.findMany.mockResolvedValue([{ day: today, gameId: 'pmu', starts: 2, ends: 1 }])
    prismaMock.localGameDaily.aggregate.mockResolvedValue({ _min: { day: '2026-01-01' } })

    const growth = await getGrowthStats()

    expect(prismaMock.localGameDaily.findMany).toHaveBeenCalledWith({
      where: { day: { gte: parisDayOffset(29) } },
      select: { day: true, gameId: true, starts: true, ends: true },
    })
    expect(prismaMock.localGameDaily.aggregate).toHaveBeenCalledWith({ _min: { day: true } })
    expect(growth.localPlay?.since).toBe('2026-01-01')
    expect(growth.localPlay?.totals.d7).toEqual({ starts: 2, ends: 1 })
    expect(growth.localPlay?.byGame.d30).toEqual([
      { gameId: 'pmu', gameTitle: titleOf('pmu'), starts: 2, ends: 1, noEndScreen: false },
    ])
  })

  it('une lecture des parties locales en échec ne fait pas tomber le reste de la croissance', async () => {
    mockEmptyGrowth()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    prismaMock.localGameDaily.findMany.mockRejectedValue(new Error('no such table: LocalGameDaily'))

    const growth = await getGrowthStats()

    expect(growth.localPlay).toBeNull()
    expect(growth.onlinePlay.launchesByDay).toHaveLength(14)
    // Le nom de l'erreur seulement, jamais son message.
    expect(errorSpy).toHaveBeenCalledWith('growth stats: parties locales illisibles:', 'Error')
    errorSpy.mockRestore()
  })

  it('ne calcule plus de rétention sur lastSeenAt (remplacée par les retours par cohorte)', async () => {
    prismaMock.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1)
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      sql.includes('OnlineGameHistory')
        ? [{ gameId: 'quiz', players: BigInt(2) }]
        : [{ live: BigInt(4), stalled: BigInt(1) }]
    )
    prismaMock.siteSetting.findUnique.mockResolvedValue({ key: 'metrics.excludedUserIds', value: '["t1"]' })
    prismaMock.onlineGameSession.findMany.mockResolvedValue([
      {
        startedAt: new Date(),
        gameId: 'quiz',
        humanCount: 1,
        participants: [{ userId: 't1', user: { role: 'user', isGuest: true } }],
      },
    ])

    const growth = await getGrowthStats()

    // Même liste de comptes de test que le tableau des comptes actifs.
    expect(growth.onlinePlay.testExcluded).toBe(1)
    expect(growth.onlinePlay.uniquePlayers.d30).toBe(0)
    // Le jeu de chaque partie est lu ; celle du compte de test seul n'est pas un lancement.
    expect(prismaMock.onlineGameSession.findMany.mock.calls[0][0].select).toMatchObject({ gameId: true })
    expect(growth.onlinePlay.launchesByGame7d).toEqual([])
    expect(growth).not.toHaveProperty('retentionD1')
    expect(growth).not.toHaveProperty('retentionD7')
    expect(growth.windows).toEqual({ registeredShareDays: 30, playersByGameDays: 7 })
    expect(growth.registeredShare).toEqual({ registered: 3, guests: 1, share: 0.75 })
    expect(growth.abandonedTables).toEqual({ stalled: 1, live: 4, rate: 0.25 })
    // Plus aucune requête sur la table des comptes en SQL brut.
    const queries = prismaMock.$queryRawUnsafe.mock.calls.map(([sql]) => String(sql))
    expect(queries).toHaveLength(2)
    expect(queries.some((sql) => sql.includes('lastSeenAt >= createdAt'))).toBe(false)
  })
})

describe('logStaffAction', () => {
  it('ancre une action sans cible sur son auteur', async () => {
    await logStaffAction({ actorId: 'admin1', action: 'site-setting', detail: 'Vocal désactivé sur tout le site' })
    expect(prismaMock.accountBanEvent.create).toHaveBeenCalledWith({
      data: { userId: 'admin1', actorId: 'admin1', action: 'site-setting', comment: 'Vocal désactivé sur tout le site' },
    })
  })

  it('ancre une exclusion des statistiques sur le compte visé, l’auteur à part', async () => {
    await logStaffAction({
      actorId: 'admin1',
      action: 'metrics-exclusion',
      targetUserId: 'guest1',
      detail: 'on',
    })
    expect(prismaMock.accountBanEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'guest1',
        actorId: 'admin1',
        action: 'metrics-exclusion',
        comment: 'on',
      },
    })
  })
})

/** Lectures de la Vue d'ensemble, toutes vides : chaque test surcharge ce qu'il vérifie. */
function mockEmptyOverview() {
  prismaMock.dailyVisitor.groupBy.mockResolvedValue([])
  prismaMock.$queryRawUnsafe.mockResolvedValue([])
  prismaMock.onlineRoom.findMany.mockResolvedValue([])
  prismaMock.onlineRoom.groupBy.mockResolvedValue([])
  prismaMock.accountBanEvent.findMany.mockResolvedValue([])
  prismaMock.cosmeticGrant.findMany.mockResolvedValue([])
  prismaMock.featureBan.findMany.mockResolvedValue([])
  prismaMock.moderationTerm.findMany.mockResolvedValue([])
  prismaMock.userFeedback.findMany.mockResolvedValue([])
  listFlaggedMock.mockResolvedValue([])
}

describe('getSupervisionOverview — tables en cours', () => {
  it('compte les statuts EN BASE, pas sur la liste plafonnée, diffusion TV comprise', async () => {
    mockEmptyOverview()
    const room = (id: string, status: string) => ({
      id,
      code: id.toUpperCase(),
      gameId: 'quiz',
      status,
      visibility: 'public',
      currentTurnUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      host: null,
      _count: { members: 0 },
      members: [],
    })
    // La liste ne remonte que deux salles (ses `take`) alors que 45 jouent.
    prismaMock.onlineRoom.findMany.mockResolvedValue([room('r1', 'playing'), room('r2', 'waiting')])
    prismaMock.onlineRoom.groupBy.mockResolvedValue([
      { status: 'playing', _count: { _all: 45 } },
      { status: 'waiting', _count: { _all: 3 } },
      { status: 'cast', _count: { _all: 1 } },
    ])

    const overview = await getSupervisionOverview('admin')

    expect(overview.liveTables).toHaveLength(2)
    expect(overview.liveTablesByStatus).toEqual({ waiting: 3, briefing: 0, playing: 45, cast: 1 })
    expect(prismaMock.onlineRoom.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { status: { in: ['waiting', 'briefing', 'playing', 'cast'] } },
      _count: { _all: true },
    })
  })
})

describe('getSupervisionOverview — journal', () => {
  it('affiche une exclusion des statistiques comme un réglage visant un compte, jamais comme un ban', async () => {
    mockEmptyOverview()
    prismaMock.accountBanEvent.findMany.mockResolvedValue([
      {
        id: 'e1',
        userId: 'guest1',
        actorId: 'admin1',
        action: 'metrics-exclusion',
        comment: 'on',
        createdAt: new Date('2026-10-25T10:00:00.000Z'),
        user: { displayName: 'Suzon' },
        actor: { displayName: 'Alice' },
      },
    ])

    const { journal } = await getSupervisionOverview('admin')

    expect(journal).toEqual([
      {
        id: 'ban-e1',
        kind: 'site-setting',
        actorName: 'Alice',
        // Nom résolu à la lecture ; la ligne ne stocke que la référence du compte.
        targetName: 'Suzon',
        targetUserId: 'guest1',
        detail: 'on',
        createdAt: '2026-10-25T10:00:00.000Z',
      },
    ])
  })
})

describe('getSupervisionOverview — file « à traiter »', () => {
  it('lit les retours ouverts À TRAVERS le filtre de la boîte de tri, sans les captures', async () => {
    mockEmptyOverview()

    await getSupervisionOverview('moderator')

    const args = prismaMock.userFeedback.findMany.mock.calls[0][0]
    // Les notes de 1re partie sans commentaire restent hors de la file.
    expect(args.where).toEqual({ AND: [{ status: 'open' }, FEEDBACK_INBOX_WHERE] })
    expect(args.select).not.toHaveProperty('screenshots')
  })

  it('un avis de 1re partie commenté : libellé dédié et note devant le texte', async () => {
    mockEmptyOverview()
    prismaMock.userFeedback.findMany.mockResolvedValue([
      {
        id: 'f1',
        type: 'first-game',
        message: 'Trop bien, mais les règles vont vite',
        rating: 4,
        createdAt: new Date('2026-10-07T20:00:00.000Z'),
        user: { displayName: 'Suzon' },
      },
      {
        id: 'f2',
        type: 'bug',
        message: 'Le bouton ne répond pas',
        rating: null,
        createdAt: new Date('2026-10-07T19:00:00.000Z'),
        user: null,
      },
    ])

    const { queue } = await getSupervisionOverview('moderator')

    expect(queue).toEqual([
      expect.objectContaining({
        id: 'feedback-f1',
        title: 'Avis 1re partie',
        subtitle: 'Suzon — 4/5 · Trop bien, mais les règles vont vite',
      }),
      expect.objectContaining({
        id: 'feedback-f2',
        title: 'Bug',
        subtitle: 'Anonyme — Le bouton ne répond pas',
      }),
    ])
  })
})
