import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Avis de 1re partie côté serveur : la lecture d'éligibilité (une requête,
 * tranchée par la fonction pure) et le résumé de la Supervision — sur un
 * client Prisma simulé qui n'expose que les opérations utilisées.
 */
const { userMock, feedbackMock } = vi.hoisted(() => ({
  userMock: { findUnique: vi.fn() },
  feedbackMock: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { user: userMock, userFeedback: feedbackMock } }))

import {
  firstGameFeedbackId,
  isFirstGameFeedbackDue,
  isLocalFirstGameFeedbackDue,
  listFirstGameReviews,
  summarizeFirstGameFeedback,
} from '@/lib/first-game-feedback-server'

const NOW = new Date('2026-10-07T21:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

beforeEach(() => {
  vi.resetAllMocks()
})

describe('isFirstGameFeedbackDue', () => {
  it('UNE lecture par clé primaire, succès first_game joint', async () => {
    userMock.findUnique.mockResolvedValue({
      firstFeedbackAskedAt: null,
      createdAt: new Date(NOW.getTime() - 2 * HOUR_MS),
      achievements: [{ unlockedAt: new Date(NOW.getTime() - HOUR_MS) }],
    })

    expect(await isFirstGameFeedbackDue('u1', NOW)).toBe(true)
    expect(userMock.findUnique).toHaveBeenCalledTimes(1)
    expect(userMock.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: {
        firstFeedbackAskedAt: true,
        createdAt: true,
        achievements: { where: { type: 'first_game' }, select: { unlockedAt: true }, take: 1 },
      },
    })
  })

  it('déjà sollicité, sans succès, ou compte introuvable : false', async () => {
    const recent = {
      createdAt: new Date(NOW.getTime() - 2 * HOUR_MS),
      achievements: [{ unlockedAt: new Date(NOW.getTime() - HOUR_MS) }],
    }
    userMock.findUnique.mockResolvedValueOnce({ ...recent, firstFeedbackAskedAt: new Date(NOW) })
    expect(await isFirstGameFeedbackDue('u1', NOW)).toBe(false)

    userMock.findUnique.mockResolvedValueOnce({ ...recent, firstFeedbackAskedAt: null, achievements: [] })
    expect(await isFirstGameFeedbackDue('u1', NOW)).toBe(false)

    userMock.findUnique.mockResolvedValueOnce(null)
    expect(await isFirstGameFeedbackDue('u1', NOW)).toBe(false)
  })
})

describe('isLocalFirstGameFeedbackDue', () => {
  it('UNE lecture par clé primaire ; compte récent jamais sollicité : true', async () => {
    userMock.findUnique.mockResolvedValue({
      firstFeedbackAskedAt: null,
      createdAt: new Date(NOW.getTime() - 3 * DAY_MS),
    })

    expect(await isLocalFirstGameFeedbackDue('u1', NOW)).toBe(true)
    expect(userMock.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { firstFeedbackAskedAt: true, createdAt: true },
    })
  })

  it('ancien compte, déjà sollicité, ou introuvable : false', async () => {
    userMock.findUnique.mockResolvedValueOnce({
      firstFeedbackAskedAt: null,
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
    })
    expect(await isLocalFirstGameFeedbackDue('u1', NOW)).toBe(false)

    userMock.findUnique.mockResolvedValueOnce({
      firstFeedbackAskedAt: new Date(NOW.getTime() - HOUR_MS),
      createdAt: new Date(NOW.getTime() - DAY_MS),
    })
    expect(await isLocalFirstGameFeedbackDue('u1', NOW)).toBe(false)

    userMock.findUnique.mockResolvedValueOnce(null)
    expect(await isLocalFirstGameFeedbackDue('u1', NOW)).toBe(false)
  })
})

describe('firstGameFeedbackId', () => {
  it('déterministe par compte, distinct d’un compte à l’autre', () => {
    expect(firstGameFeedbackId('compte-a')).toBe(firstGameFeedbackId('compte-a'))
    expect(firstGameFeedbackId('compte-a')).not.toBe(firstGameFeedbackId('compte-b'))
  })

  it('ne contient pas l’id du compte en clair, ni de caractère à échapper dans une URL', () => {
    const id = firstGameFeedbackId('cm9xyzcompte42')
    expect(id).not.toContain('cm9xyzcompte42')
    expect(id).toMatch(/^first-game-[0-9a-f]{32}$/)
  })
})

/** Agrégats vides : chaque test surcharge ce qu'il vérifie. */
function mockEmptySummary() {
  feedbackMock.aggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } })
  feedbackMock.groupBy.mockResolvedValue([])
}

describe('summarizeFirstGameFeedback', () => {
  it('aucun avis : zéros partout, moyennes null, chaque note présente', async () => {
    mockEmptySummary()

    expect(await summarizeFirstGameFeedback(NOW)).toEqual({
      total: 0,
      average: null,
      last30d: { count: 0, average: null },
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      byGame: [],
    })
  })

  it('agrège : total et 30 j, répartition, par jeu trié, moyennes au centième', async () => {
    feedbackMock.aggregate
      .mockResolvedValueOnce({ _count: { _all: 7 }, _avg: { rating: 29 / 7 } })
      .mockResolvedValueOnce({ _count: { _all: 3 }, _avg: { rating: 11 / 3 } })
    feedbackMock.groupBy
      .mockResolvedValueOnce([
        { rating: 5, _count: { _all: 3 } },
        { rating: 4, _count: { _all: 2 } },
        { rating: 2, _count: { _all: 1 } },
        { rating: 3, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { gameId: 'quiz', _count: { _all: 2 }, _avg: { rating: 4.5 } },
        { gameId: 'loup-garou', _count: { _all: 4 }, _avg: { rating: 3.75 } },
        { gameId: 'bluff', _count: { _all: 2 }, _avg: { rating: 4 } },
        // Ligne sans jeu (ne devrait pas exister) : écartée, pas d'id null.
        { gameId: null, _count: { _all: 1 }, _avg: { rating: 1 } },
      ])

    const summary = await summarizeFirstGameFeedback(NOW)

    expect(summary.total).toBe(7)
    expect(summary.average).toBe(4.14)
    expect(summary.last30d).toEqual({ count: 3, average: 3.67 })
    expect(summary.distribution).toEqual({ '1': 0, '2': 1, '3': 1, '4': 2, '5': 3 })
    expect(summary.byGame).toEqual([
      { gameId: 'loup-garou', count: 4, average: 3.75 },
      { gameId: 'bluff', count: 2, average: 4 },
      { gameId: 'quiz', count: 2, average: 4.5 },
    ])
  })

  it('requêtes : type first-game noté, fenêtre de 30 j, aucune ligne rapatriée', async () => {
    mockEmptySummary()

    await summarizeFirstGameFeedback(NOW)

    const rated = { type: 'first-game', rating: { not: null } }
    expect(feedbackMock.aggregate).toHaveBeenNthCalledWith(1, {
      where: rated,
      _count: { _all: true },
      _avg: { rating: true },
    })
    expect(feedbackMock.aggregate).toHaveBeenNthCalledWith(2, {
      where: { ...rated, createdAt: { gte: new Date(NOW.getTime() - 30 * DAY_MS) } },
      _count: { _all: true },
      _avg: { rating: true },
    })
    // Les avis un par un ont leur route paginée : le résumé n'agrège que.
    expect(feedbackMock.findMany).not.toHaveBeenCalled()
  })
})

describe('listFirstGameReviews', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'cm-anonyme',
    rating: 4,
    gameId: 'quiz',
    playMode: 'local',
    message: '',
    createdAt: new Date('2026-11-20T21:00:00.000Z'),
    userId: null,
    user: null,
    ...over,
  })

  it('chaque avis avec son auteur : compte (pseudo, invité ou non), compte supprimé, sans compte', async () => {
    feedbackMock.findMany.mockResolvedValue([
      row({
        id: firstGameFeedbackId('u-alice'),
        rating: 5,
        playMode: 'online',
        message: 'Trop bien',
        userId: 'u-alice',
        user: { displayName: 'Alice', isGuest: false },
      }),
      row({ id: firstGameFeedbackId('u-invite'), rating: 2, userId: 'u-invite', user: { displayName: 'Zed', isGuest: true } }),
      // Compte supprimé depuis : userId remis à null, la clé d'empreinte reste.
      row({ id: firstGameFeedbackId('u-parti'), rating: 3 }),
      // Partie locale sans connexion : cuid par défaut, jamais de compte.
      row({ id: 'cm-anonyme', rating: 1 }),
    ])
    feedbackMock.count.mockResolvedValue(4)

    const { reviews, total } = await listFirstGameReviews({ gameId: null, skip: 0, take: 10 })

    expect(total).toBe(4)
    expect(reviews.map((r) => [r.rating, r.author])).toEqual([
      [5, { kind: 'account', userId: 'u-alice', name: 'Alice', isGuest: false }],
      [2, { kind: 'account', userId: 'u-invite', name: 'Zed', isGuest: true }],
      [3, { kind: 'deleted' }],
      [1, { kind: 'anonymous' }],
    ])
    expect(reviews[0]).toEqual({
      id: firstGameFeedbackId('u-alice'),
      rating: 5,
      gameId: 'quiz',
      playMode: 'online',
      comment: 'Trop bien',
      createdAt: '2026-11-20T21:00:00.000Z',
      author: { kind: 'account', userId: 'u-alice', name: 'Alice', isGuest: false },
    })
  })

  it('requêtes : avis notés seulement, du plus récent au plus ancien (id départage), page demandée, pseudo sans e-mail', async () => {
    feedbackMock.findMany.mockResolvedValue([])
    feedbackMock.count.mockResolvedValue(0)

    await listFirstGameReviews({ gameId: null, skip: 20, take: 10 })

    const where = { type: 'first-game', rating: { not: null } }
    const query = feedbackMock.findMany.mock.calls[0][0]
    expect(query.where).toEqual(where)
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect(query.skip).toBe(20)
    expect(query.take).toBe(10)
    expect(query.select.user).toEqual({ select: { displayName: true, isGuest: true } })
    expect(query.select).not.toHaveProperty('contactEmail')
    expect(query.select).not.toHaveProperty('userAgent')
    expect(feedbackMock.count).toHaveBeenCalledWith({ where })
  })

  it('filtre par jeu : la liste ET le total portent sur ce jeu seul', async () => {
    feedbackMock.findMany.mockResolvedValue([])
    feedbackMock.count.mockResolvedValue(0)

    await listFirstGameReviews({ gameId: 'loup-garou', skip: 0, take: 10 })

    const where = { type: 'first-game', rating: { not: null }, gameId: 'loup-garou' }
    expect(feedbackMock.findMany.mock.calls[0][0].where).toEqual(where)
    expect(feedbackMock.count).toHaveBeenCalledWith({ where })
  })
})
