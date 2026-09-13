import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Liste des comptes de test (SiteSetting) : deux admins qui cochent deux
 * comptes en même temps gardent les deux coches, et `changed` ne ment jamais
 * sur une écriture perdue (le journal en dépend). La base est simulée.
 */
const { settingMock, userMock } = vi.hoisted(() => ({
  settingMock: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  userMock: { findMany: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { siteSetting: settingMock, user: userMock } }))

import { METRICS_EXCLUDED_USERS_KEY, setUserExcluded } from '@/lib/metrics-exclusions'

const row = (value: string) => ({ key: METRICS_EXCLUDED_USERS_KEY, value })

beforeEach(() => {
  vi.resetAllMocks()
  // Tous les comptes demandés existent.
  userMock.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.map((id) => ({ id }))
  )
})

describe('setUserExcluded', () => {
  it('écrit sous condition de la valeur lue, et relit si un autre admin a écrit entre-temps', async () => {
    settingMock.findUnique.mockResolvedValueOnce(row('[]')).mockResolvedValueOnce(row('["b"]'))
    // Première écriture refusée : la valeur n'est plus '[]'.
    settingMock.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    const result = await setUserExcluded('a', true)

    expect(settingMock.updateMany).toHaveBeenNthCalledWith(1, {
      where: { key: METRICS_EXCLUDED_USERS_KEY, value: '[]' },
      data: { value: '["a"]' },
    })
    // La coche de l'autre admin est gardée.
    expect(settingMock.updateMany).toHaveBeenNthCalledWith(2, {
      where: { key: METRICS_EXCLUDED_USERS_KEY, value: '["b"]' },
      data: { value: '["b","a"]' },
    })
    expect(result).toEqual({ changed: true, userIds: ['b', 'a'] })
  })

  it('crée la ligne absente, et relit si elle a été créée entre-temps', async () => {
    settingMock.findUnique
      .mockResolvedValueOnce(null)
      // Relecture après l'échec du create : la ligne existe désormais.
      .mockResolvedValueOnce(row('["b"]'))
      .mockResolvedValueOnce(row('["b"]'))
    settingMock.create.mockRejectedValueOnce(new Error('Unique constraint failed'))
    settingMock.updateMany.mockResolvedValueOnce({ count: 1 })

    const result = await setUserExcluded('a', true)

    expect(settingMock.create).toHaveBeenCalledWith({ data: { key: METRICS_EXCLUDED_USERS_KEY, value: '["a"]' } })
    expect(result).toEqual({ changed: true, userIds: ['b', 'a'] })
  })

  it('n’écrit rien quand l’état ne change pas', async () => {
    settingMock.findUnique.mockResolvedValue(row('["a"]'))

    expect(await setUserExcluded('a', true)).toEqual({ changed: false, userIds: ['a'] })
    expect(settingMock.updateMany).not.toHaveBeenCalled()
    expect(settingMock.create).not.toHaveBeenCalled()
  })

  it('abandonne après des écritures concurrentes répétées, sans prétendre avoir écrit', async () => {
    settingMock.findUnique.mockResolvedValue(row('[]'))
    settingMock.updateMany.mockResolvedValue({ count: 0 })

    await expect(setUserExcluded('a', true)).rejects.toThrow()
    expect(settingMock.updateMany).toHaveBeenCalledTimes(5)
  })
})
