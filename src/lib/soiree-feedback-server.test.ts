import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Résumé des votes du Mode Soirée (Supervision) : la note de la soirée
 * entière (votes sans jeu) d'un côté, la moyenne par jeu des votes d'entracte
 * de l'autre — sur un client Prisma simulé.
 */
const { feedbackMock } = vi.hoisted(() => ({
  feedbackMock: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { userFeedback: feedbackMock } }))

import { summarizeSoireeFeedback } from './soiree-feedback-server'

const NOW = new Date('2026-11-22T21:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.resetAllMocks()
  feedbackMock.aggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } })
  feedbackMock.groupBy.mockResolvedValue([])
  feedbackMock.findMany.mockResolvedValue([])
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
    expect(feedbackMock.findMany.mock.calls[0][0].where).toEqual({ ...night, message: { not: '' } })
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
