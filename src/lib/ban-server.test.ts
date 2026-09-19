import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma est remplacé : on teste la levée d'un ban temporaire échu, et surtout
// QUAND elle lit le compte — jamais quand l'appelant passe la ligne déjà lue
// (getSessionFromToken, à chaque appel API authentifié).
const { userMock } = vi.hoisted(() => ({
  userMock: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { user: userMock } }))

import { clearExpiredBanIfNeeded, getBanState, isUserCurrentlyBanned } from '@/lib/ban-server'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000

/** Colonnes remises à nul par la levée. */
const CLEARED = {
  banType: null,
  bannedUntil: null,
  banComment: null,
  bannedAt: null,
  bannedById: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  userMock.findUnique.mockReset()
  userMock.findUnique.mockResolvedValue(null)
  userMock.update.mockReset()
  userMock.update.mockResolvedValue({})
})

describe('clearExpiredBanIfNeeded : ligne déjà lue (session)', () => {
  it('ban temporaire échu : levé en base sans relire le compte', async () => {
    await clearExpiredBanIfNeeded({
      id: 'user-1',
      banType: 'temporary',
      bannedUntil: new Date(NOW.getTime() - HOUR_MS),
    })
    expect(userMock.findUnique).not.toHaveBeenCalled()
    expect(userMock.update).toHaveBeenCalledTimes(1)
    expect(userMock.update.mock.calls[0][0]).toEqual({ where: { id: 'user-1' }, data: CLEARED })
  })

  it('échéance pile maintenant : échue (même borne que getBanState)', async () => {
    const user = { id: 'user-1', banType: 'temporary', bannedUntil: new Date(NOW) }
    await clearExpiredBanIfNeeded(user)
    expect(userMock.update).toHaveBeenCalledTimes(1)
    expect(getBanState({ ...user, banComment: null, bannedAt: null }).banned).toBe(false)
  })

  it('ban temporaire encore en cours : aucune lecture, aucune écriture', async () => {
    await clearExpiredBanIfNeeded({
      id: 'user-1',
      banType: 'temporary',
      bannedUntil: new Date(NOW.getTime() + HOUR_MS),
    })
    expect(userMock.findUnique).not.toHaveBeenCalled()
    expect(userMock.update).not.toHaveBeenCalled()
  })

  it('ban permanent ou aucun ban : rien', async () => {
    await clearExpiredBanIfNeeded({ id: 'user-1', banType: 'permanent', bannedUntil: null })
    await clearExpiredBanIfNeeded({ id: 'user-1', banType: null, bannedUntil: null })
    expect(userMock.findUnique).not.toHaveBeenCalled()
    expect(userMock.update).not.toHaveBeenCalled()
  })
})

describe('clearExpiredBanIfNeeded : par id (connexion, isUserCurrentlyBanned)', () => {
  it('lit les deux colonnes utiles, puis lève un ban échu', async () => {
    userMock.findUnique.mockResolvedValue({
      banType: 'temporary',
      bannedUntil: new Date(NOW.getTime() - HOUR_MS),
    })
    await clearExpiredBanIfNeeded('user-1')
    expect(userMock.findUnique).toHaveBeenCalledTimes(1)
    expect(userMock.findUnique.mock.calls[0][0]).toEqual({
      where: { id: 'user-1' },
      select: { banType: true, bannedUntil: true },
    })
    expect(userMock.update.mock.calls[0][0]).toEqual({ where: { id: 'user-1' }, data: CLEARED })
  })

  it('compte inconnu : rien à écrire', async () => {
    await clearExpiredBanIfNeeded('inconnu')
    expect(userMock.update).not.toHaveBeenCalled()
  })

  it('isUserCurrentlyBanned : un ban échu est levé puis vu comme levé', async () => {
    userMock.findUnique.mockResolvedValue({
      id: 'user-1',
      banType: 'temporary',
      bannedUntil: new Date(NOW.getTime() - HOUR_MS),
      banComment: null,
      bannedAt: null,
    })
    expect(await isUserCurrentlyBanned('user-1')).toBe(false)
    expect(userMock.update).toHaveBeenCalledTimes(1)
  })

  it('isUserCurrentlyBanned : un ban en cours reste un ban', async () => {
    userMock.findUnique.mockResolvedValue({
      id: 'user-1',
      banType: 'temporary',
      bannedUntil: new Date(NOW.getTime() + HOUR_MS),
      banComment: null,
      bannedAt: null,
    })
    expect(await isUserCurrentlyBanned('user-1')).toBe(true)
    expect(userMock.update).not.toHaveBeenCalled()
  })
})
