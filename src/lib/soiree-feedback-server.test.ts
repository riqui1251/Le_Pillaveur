import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Votes du Mode Soirée côté Supervision : le résumé — la note de la soirée
 * entière (votes sans jeu) d'un côté, la moyenne par jeu des votes d'entracte
 * de l'autre — et la liste des votes un par un, sur un client Prisma simulé.
 */
const { feedbackMock } = vi.hoisted(() => ({
  feedbackMock: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { userFeedback: feedbackMock } }))

import { listSoireeReviews, summarizeSoireeFeedback } from './soiree-feedback-server'

const NOW = new Date('2026-11-22T21:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.resetAllMocks()
  feedbackMock.aggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } })
  feedbackMock.groupBy.mockResolvedValue([])
  feedbackMock.findMany.mockResolvedValue([])
  feedbackMock.count.mockResolvedValue(0)
})

describe('summarizeSoireeFeedback', () => {
  it('soirée entière (sans jeu) pour le chiffre principal, entractes (avec jeu) pour la moyenne par jeu', async () => {
    await summarizeSoireeFeedback(NOW)

    const night = { type: 'soiree', rating: { not: null }, gameId: null }
    expect(feedbackMock.aggregate).toHaveBeenNthCalledWith(1, { where: night, _count: { _all: true }, _avg: { rating: true } })
    expect(feedbackMock.aggregate).toHaveBeenNthCalledWith(2, {
      where: { ...night, createdAt: { gte: new Date(NOW.getTime() - 30 * DAY_MS) } },
      _count: { _all: true },
      _avg: { rating: true },
    })
    expect(feedbackMock.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['rating'], where: night }))
    expect(feedbackMock.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['gameId'], where: { type: 'soiree', rating: { not: null }, gameId: { not: null } } })
    )
    // Les votes un par un ont leur route paginée : le résumé n'agrège que.
    expect(feedbackMock.findMany).not.toHaveBeenCalled()
  })

  it('des votes d’entracte sans vote d’addition : la moyenne par jeu sort quand même', async () => {
    feedbackMock.groupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by[0] === 'gameId' ? [{ gameId: 'hi-lo', _count: { _all: 3 }, _avg: { rating: 4.333 } }] : []
    )

    const summary = await summarizeSoireeFeedback(NOW)

    expect(summary.total).toBe(0)
    expect(summary.byGame).toEqual([{ gameId: 'hi-lo', count: 3, average: 4.33 }])
  })
})

describe('listSoireeReviews', () => {
  const RATED = { type: 'soiree', rating: { not: null } }

  it.each([
    ['tous les votes', { kind: 'all' } as const, RATED],
    ['la soirée entière : votes sans jeu', { kind: 'night' } as const, { ...RATED, gameId: null }],
    ['un jeu : ses votes d’entracte', { kind: 'game', gameId: 'hi-lo' } as const, { ...RATED, gameId: 'hi-lo' }],
  ])('%s — la liste ET le total portent sur le même filtre', async (_label, subject, where) => {
    await listSoireeReviews({ subject, skip: 10, take: 10 })

    const query = feedbackMock.findMany.mock.calls[0][0]
    expect(query.where).toEqual(where)
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect(query.skip).toBe(10)
    expect(query.take).toBe(10)
    expect(query.select).not.toHaveProperty('contactEmail')
    expect(feedbackMock.count).toHaveBeenCalledWith({ where })
  })

  it('auteur : le compte connecté sur l’appareil, sinon personne — jamais « compte supprimé »', async () => {
    const createdAt = new Date('2026-11-22T23:10:00.000Z')
    feedbackMock.findMany.mockResolvedValue([
      {
        id: 'soiree-mb1x2y3z-k4f9-fin',
        rating: 5,
        gameId: null,
        playMode: 'local',
        message: 'Super soirée',
        createdAt,
        userId: 'u-hote',
        user: { displayName: 'Hôte', isGuest: false },
      },
      // Soirée jouée sans connexion — ou compte supprimé depuis : la clé du
      // vote ne porte pas le compte, on ne peut pas les distinguer.
      { id: 'soiree-mb1x2y3z-k4f9-m0', rating: 3, gameId: 'hi-lo', playMode: 'local', message: '', createdAt, userId: null, user: null },
    ])
    feedbackMock.count.mockResolvedValue(2)

    const { reviews, total } = await listSoireeReviews({ subject: { kind: 'all' }, skip: 0, take: 10 })

    expect(total).toBe(2)
    expect(reviews).toEqual([
      {
        id: 'soiree-mb1x2y3z-k4f9-fin',
        rating: 5,
        gameId: null,
        playMode: 'local',
        comment: 'Super soirée',
        createdAt: '2026-11-22T23:10:00.000Z',
        author: { kind: 'account', userId: 'u-hote', name: 'Hôte', isGuest: false },
      },
      {
        id: 'soiree-mb1x2y3z-k4f9-m0',
        rating: 3,
        gameId: 'hi-lo',
        playMode: 'local',
        comment: '',
        createdAt: '2026-11-22T23:10:00.000Z',
        author: { kind: 'anonymous' },
      },
    ])
  })
})
