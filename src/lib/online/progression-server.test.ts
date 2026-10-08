import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * buildProgression : la série rendue au client est TOUJOURS hebdomadaire —
 * une ancienne valeur quotidienne de la colonne est convertie ici, jamais
 * recopiée (la bannière de fin la comparerait à la semaine en cours).
 */

const { userFindUnique, grantFindMany } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  grantFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    cosmeticGrant: { findMany: grantFindMany },
  },
}))

import { buildProgression } from './progression-server'

const USER = { id: 'u1', role: 'user', onlineXp: 120 }

beforeEach(() => {
  vi.resetAllMocks()
  grantFindMany.mockResolvedValue([])
})

describe('buildProgression — série hebdomadaire', () => {
  it('une clé de semaine passe telle quelle', async () => {
    userFindUnique.mockResolvedValue({ streakCount: 4, streakLastDay: '2026-W41' })
    const p = await buildProgression(USER)
    expect(p.streakCount).toBe(4)
    expect(p.streakLastDay).toBe('2026-W41')
    expect(p.xp).toBe(120)
  })

  it('ancien jour : converti en semaine, compte de jours ramené aux semaines couvertes', async () => {
    // Du dimanche 04/10 au mardi 06/10/2026 : deux semaines ISO (W40, W41).
    userFindUnique.mockResolvedValue({ streakCount: 3, streakLastDay: '2026-10-06' })
    const p = await buildProgression(USER)
    expect(p.streakCount).toBe(2)
    expect(p.streakLastDay).toBe('2026-W41')
  })

  it('compte introuvable ou jamais crédité : 0 et null', async () => {
    userFindUnique.mockResolvedValue(null)
    const p = await buildProgression(USER)
    expect(p.streakCount).toBe(0)
    expect(p.streakLastDay).toBeNull()
  })
})
