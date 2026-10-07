import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/first-game-feedback — résumé des avis de 1re partie. Vraie
 * route, vraie garde et vrais rôles ; session et résumé simulés : même accès
 * que la lecture des retours (modérateur+), aucune lecture pour les autres.
 */

const { userMock, summarizeMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  summarizeMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/first-game-feedback-server', () => ({ summarizeFirstGameFeedback: summarizeMock }))

import { GET } from './route'

const SUMMARY = {
  total: 2,
  average: 4.5,
  last30d: { count: 2, average: 4.5 },
  distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
  byGame: [{ gameId: 'quiz', count: 2, average: 4.5 }],
  recentComments: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  summarizeMock.mockResolvedValue(SUMMARY)
})

describe('GET /api/admin/first-game-feedback', () => {
  it.each([['moderator'], ['admin'], ['superadmin'], ['fondateur']])('%s : résumé servi', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ summary: SUMMARY })
  })

  it.each([['user'], [null]])('%s : 403, sans la moindre lecture', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)

    const res = await GET()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Accès refusé' })
    expect(summarizeMock).not.toHaveBeenCalled()
  })
})
