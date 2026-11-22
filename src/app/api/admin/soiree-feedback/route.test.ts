import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/soiree-feedback — résumé des votes du Mode Soirée. Vraie
 * route, vraie garde et vrais rôles ; session et résumé simulés : même accès
 * que la lecture des retours (modérateur+), aucune lecture pour les autres.
 */

const { userMock, summarizeMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  summarizeMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/soiree-feedback-server', () => ({ summarizeSoireeFeedback: summarizeMock }))

import { GET } from './route'

const SUMMARY = {
  total: 1,
  average: 5,
  last30d: { count: 1, average: 5 },
  distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
  byGame: [{ gameId: 'hi-lo', count: 2, average: 3.5 }],
  recentComments: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  summarizeMock.mockResolvedValue(SUMMARY)
})

describe('GET /api/admin/soiree-feedback', () => {
  it.each([['moderator'], ['admin'], ['superadmin'], ['fondateur']])('%s : résumé servi', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ summary: SUMMARY })
  })

  it.each([['user'], [null]])('%s : 403 avec un code, sans la moindre lecture', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)

    const res = await GET()

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
    expect(summarizeMock).not.toHaveBeenCalled()
  })
})
