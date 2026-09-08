import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma et next/headers sont remplacés : on ne teste ici QUE la règle
// « le cookie porte le jeton brut, la base ne voit que son empreinte ».
const { sessionMock } = vi.hoisted(() => ({
  sessionMock: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { session: sessionMock } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { createSession, deleteSession, getUserFromSessionToken, hashToken } from '@/lib/auth-server'

describe('jetons de session hachés en base', () => {
  beforeEach(() => {
    sessionMock.create.mockReset()
    sessionMock.deleteMany.mockReset()
    sessionMock.findUnique.mockReset()
    sessionMock.findUnique.mockResolvedValue(null)
  })

  it('stocke l empreinte du jeton, jamais le jeton brut', async () => {
    const token = await createSession('user-1')
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const stored = sessionMock.create.mock.calls[0][0].data
    expect(stored.token).toBe(hashToken(token))
    expect(stored.token).not.toBe(token)
    expect(stored.userId).toBe('user-1')
  })

  it('recherche la session par empreinte', async () => {
    await getUserFromSessionToken('jeton-brut')
    expect(sessionMock.findUnique.mock.calls[0][0].where).toEqual({
      token: hashToken('jeton-brut'),
    })
  })

  it('supprime la session par empreinte', async () => {
    await deleteSession('jeton-brut')
    expect(sessionMock.deleteMany.mock.calls[0][0].where).toEqual({
      token: hashToken('jeton-brut'),
    })
  })

  it('ignore un cookie absent sans interroger la base', async () => {
    expect(await getUserFromSessionToken(undefined)).toBeNull()
    expect(sessionMock.findUnique).not.toHaveBeenCalled()
  })
})
