import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Avis de 1re partie côté serveur : la lecture d'éligibilité (une requête,
 * tranchée par la fonction pure) et le résumé de la Supervision — sur un
 * client Prisma simulé qui n'expose que les opérations utilisées.
 */
const { userMock, feedbackMock } = vi.hoisted(() => ({
  userMock: { findUnique: vi.fn() },
  feedbackMock: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { user: userMock, userFeedback: feedbackMock } }))

import {
  FIRST_GAME_SUMMARY_COMMENTS,
  firstGameFeedbackId,
  isFirstGameFeedbackDue,
  isLocalFirstGameFeedbackDue,
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
  feedbackMock.findMany.mockResolvedValue([])
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
      recentComments: [],
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
    feedbackMock.findMany.mockResolvedValue([
      {
        id: 'f1',
        rating: 5,
        gameId: 'quiz',
        playMode: 'online',
        message: 'Génial',
        createdAt: new Date('2026-10-07T20:00:00.000Z'),
      },
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
    expect(summary.recentComments).toEqual([
      {
        id: 'f1',
        rating: 5,
        gameId: 'quiz',
        playMode: 'online',
        comment: 'Génial',
        createdAt: '2026-10-07T20:00:00.000Z',
      },
    ])
  })

  it('requêtes : type first-game noté, fenêtre de 30 j, 10 commentaires non vides SANS auteur', async () => {
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
    const comments = feedbackMock.findMany.mock.calls[0][0]
    expect(comments.where).toEqual({ ...rated, message: { not: '' } })
    expect(comments.take).toBe(FIRST_GAME_SUMMARY_COMMENTS)
    expect(comments.orderBy).toEqual({ createdAt: 'desc' })
    // Minimisation : ni compte, ni e-mail, ni UA dans le résumé.
    expect(Object.keys(comments.select).sort()).toEqual(
      ['createdAt', 'gameId', 'id', 'message', 'playMode', 'rating'].sort()
    )
  })
})
