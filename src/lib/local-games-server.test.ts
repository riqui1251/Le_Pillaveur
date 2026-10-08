import { beforeEach, describe, expect, it, vi } from 'vitest'

// Base simulée : on vérifie l'écriture demandée (jour de Paris, compteur
// visé, reprise sur conflit), pas le SQL de Prisma.
const { localGameDailyDb } = vi.hoisted(() => ({
  localGameDailyDb: { upsert: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { localGameDaily: localGameDailyDb } }))

import { GAMES } from './games'
import { parseLocalGameReport, recordLocalGameEvent } from './local-games-server'

const LOCAL_ID = GAMES.find((g) => !g.hidden && !g.onlineOnly)!.id
const HIDDEN_LOCAL_ID = GAMES.find((g) => g.hidden && !g.onlineOnly)!.id
const ONLINE_ONLY_ID = GAMES.find((g) => g.onlineOnly)!.id

/** Erreur d'unicité telle que Prisma la lève (seul `code` est lu). */
const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

beforeEach(() => {
  vi.resetAllMocks()
  localGameDailyDb.upsert.mockResolvedValue({})
})

describe('parseLocalGameReport', () => {
  it('garde un jeu local (masqué compris) et un événement connu, rien d’autre', () => {
    expect(parseLocalGameReport({ gameId: LOCAL_ID, event: 'start' })).toEqual({ gameId: LOCAL_ID, event: 'start' })
    expect(parseLocalGameReport({ gameId: HIDDEN_LOCAL_ID, event: 'end' })).toEqual({
      gameId: HIDDEN_LOCAL_ID,
      event: 'end',
    })
    // Un champ en trop n'est pas recopié.
    expect(parseLocalGameReport({ gameId: LOCAL_ID, event: 'end', pseudo: 'Suzon', userId: 'u1' })).toEqual({
      gameId: LOCAL_ID,
      event: 'end',
    })
  })

  it('refuse un jeu en ligne uniquement, un jeu inconnu, un événement inconnu ou un corps hors forme', () => {
    expect(parseLocalGameReport({ gameId: ONLINE_ONLY_ID, event: 'start' })).toBeNull()
    expect(parseLocalGameReport({ gameId: 'jeu-inconnu', event: 'start' })).toBeNull()
    expect(parseLocalGameReport({ gameId: LOCAL_ID, event: 'abandon' })).toBeNull()
    expect(parseLocalGameReport({ gameId: LOCAL_ID })).toBeNull()
    expect(parseLocalGameReport([LOCAL_ID, 'start'])).toBeNull()
    expect(parseLocalGameReport(null)).toBeNull()
    expect(parseLocalGameReport('start')).toBeNull()
  })
})

describe('recordLocalGameEvent', () => {
  it('un lancement : la ligne du jour de Paris est créée à 1 lancement, ou incrémentée', async () => {
    // 8/10 à 23 h 30 UTC = 9/10 à 1 h 30 à Paris (heure d'été).
    await recordLocalGameEvent({ gameId: LOCAL_ID, event: 'start' }, new Date('2026-10-08T23:30:00.000Z'))
    expect(localGameDailyDb.upsert).toHaveBeenCalledWith({
      where: { day_gameId: { day: '2026-10-09', gameId: LOCAL_ID } },
      create: { day: '2026-10-09', gameId: LOCAL_ID, starts: 1, ends: 0 },
      update: { starts: { increment: 1 } },
    })
  })

  it('une fin : seul le compteur des fins bouge', async () => {
    await recordLocalGameEvent({ gameId: LOCAL_ID, event: 'end' }, new Date('2026-10-25T22:30:00.000Z'))
    expect(localGameDailyDb.upsert).toHaveBeenCalledWith({
      where: { day_gameId: { day: '2026-10-25', gameId: LOCAL_ID } },
      create: { day: '2026-10-25', gameId: LOCAL_ID, starts: 0, ends: 1 },
      update: { ends: { increment: 1 } },
    })
  })

  it('deux premières parties simultanées : la perdante de la création repasse une fois', async () => {
    localGameDailyDb.upsert.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({})
    await expect(recordLocalGameEvent({ gameId: LOCAL_ID, event: 'start' })).resolves.toBeUndefined()
    expect(localGameDailyDb.upsert).toHaveBeenCalledTimes(2)
  })

  it('toute autre panne remonte à la route (qui répond sans détail)', async () => {
    localGameDailyDb.upsert.mockRejectedValue(new Error('database is locked'))
    await expect(recordLocalGameEvent({ gameId: LOCAL_ID, event: 'end' })).rejects.toThrow('database is locked')
    expect(localGameDailyDb.upsert).toHaveBeenCalledTimes(1)
  })
})
