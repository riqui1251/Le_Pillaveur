import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FEEDBACK_INBOX_WHERE } from '@/lib/feedback'

/**
 * GET /api/admin/feedback — boîte de tri. Vraie route, vraie garde ; session
 * et base simulées : les notes de 1re partie sans commentaire sont écartées
 * de la liste ET des compteurs, chaque item porte rating / gameId / playMode
 * (null hors avis de 1re partie), et les captures ne sont toujours pas lues.
 */

const { userMock, feedbackDb, queryRawMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  feedbackDb: { findMany: vi.fn(), count: vi.fn() },
  queryRawMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { userFeedback: feedbackDb, $queryRaw: queryRawMock } }))

import { GET } from './route'

const list = (query = '') => GET(new Request(`http://test/api/admin/feedback${query}`))

const row = (extra: Record<string, unknown>) => ({
  id: 'f1',
  type: 'bug',
  message: 'Le bouton ne répond pas',
  pageUrl: '/fr',
  userId: null,
  contactEmail: null,
  status: 'open',
  rating: null,
  gameId: null,
  playMode: null,
  createdAt: new Date('2026-10-07T19:00:00.000Z'),
  updatedAt: new Date('2026-10-07T19:00:00.000Z'),
  user: null,
  ...extra,
})

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'modo', role: 'moderator' })
  feedbackDb.findMany.mockResolvedValue([])
  feedbackDb.count.mockResolvedValue(0)
  queryRawMock.mockResolvedValue([])
})

describe('GET /api/admin/feedback — boîte de tri', () => {
  it('liste et compteurs passent TOUS par le filtre de la boîte', async () => {
    await list('?status=active&q=bouton')

    const where = feedbackDb.findMany.mock.calls[0][0].where
    expect(where.AND[0]).toEqual(FEEDBACK_INBOX_WHERE)
    expect(where.AND[1]).toEqual({ status: { not: 'resolved' } })
    expect(where.AND[2]).toHaveProperty('OR')
    expect(feedbackDb.count.mock.calls.map((call) => call[0])).toEqual([
      { where },
      { where: { AND: [FEEDBACK_INBOX_WHERE, { status: { not: 'resolved' } }] } },
      { where: { AND: [FEEDBACK_INBOX_WHERE, { status: 'resolved' }] } },
    ])
  })

  it('sans filtre : la boîte seule, et jamais les captures', async () => {
    await list()

    const args = feedbackDb.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ AND: [FEEDBACK_INBOX_WHERE, {}, {}] })
    expect(args.select).not.toHaveProperty('screenshots')
    expect(args.select).toMatchObject({ rating: true, gameId: true, playMode: true })
  })

  it('chaque item porte note, jeu et mode — null hors avis de 1re partie', async () => {
    feedbackDb.findMany.mockResolvedValue([
      row({ id: 'f1', type: 'first-game', message: 'Top', rating: 5, gameId: 'quiz', playMode: 'online' }),
      row({ id: 'f2' }),
    ])
    feedbackDb.count.mockResolvedValue(2)

    const body = await (await list()).json()

    expect(body.feedback[0]).toMatchObject({
      id: 'f1',
      type: 'first-game',
      typeLabel: 'Avis 1re partie',
      rating: 5,
      gameId: 'quiz',
      playMode: 'online',
    })
    expect(body.feedback[1]).toMatchObject({
      id: 'f2',
      typeLabel: 'Bug',
      rating: null,
      gameId: null,
      playMode: null,
    })
  })

  it('joueur sans grade : 403, aucune lecture', async () => {
    userMock.mockResolvedValue({ id: 'joueur', role: 'user' })

    const res = await list()

    expect(res.status).toBe(403)
    expect(feedbackDb.findMany).not.toHaveBeenCalled()
  })
})
