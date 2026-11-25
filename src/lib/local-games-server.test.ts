import { beforeEach, describe, expect, it, vi } from 'vitest'

// Base simulée : on vérifie l'écriture demandée (jour de Paris, compteur
// visé, reprise sur conflit), pas le SQL de Prisma.
const { localGameDailyDb } = vi.hoisted(() => ({
  localGameDailyDb: { upsert: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { localGameDaily: localGameDailyDb } }))

import { GAMES } from './games'
import { parseLocalDrinksReport, parseLocalGameReport, recordLocalGameEvent } from './local-games-server'

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

describe('parseLocalDrinksReport', () => {
  it('garde un relevé de gorgées d’un jeu local, bornes comprises, sans recopier un champ en trop', () => {
    expect(parseLocalDrinksReport({ gameId: LOCAL_ID, event: 'drinks', drinks: 12, plays: 4 })).toEqual({
      gameId: LOCAL_ID,
      event: 'drinks',
      drinks: 12,
      plays: 4,
    })
    expect(parseLocalDrinksReport({ gameId: HIDDEN_LOCAL_ID, event: 'drinks', drinks: 0, plays: 1 })).toEqual({
      gameId: HIDDEN_LOCAL_ID,
      event: 'drinks',
      drinks: 0,
      plays: 1,
    })
    // 15 participations, 20 gorgées chacune : le plus gros relevé d'une partie.
    expect(parseLocalDrinksReport({ gameId: LOCAL_ID, event: 'drinks', drinks: 300, plays: 15 })).toEqual({
      gameId: LOCAL_ID,
      event: 'drinks',
      drinks: 300,
      plays: 15,
    })
    expect(
      parseLocalDrinksReport({ gameId: LOCAL_ID, event: 'drinks', drinks: 3, plays: 2, pseudo: 'Suzon', players: ['a'] })
    ).toEqual({ gameId: LOCAL_ID, event: 'drinks', drinks: 3, plays: 2 })
  })

  it('garde une correction : des gorgées sans participation, de 1 à 300', () => {
    for (const drinks of [1, 300]) {
      expect(parseLocalDrinksReport({ gameId: LOCAL_ID, event: 'drinks', drinks, plays: 0 })).toEqual({
        gameId: LOCAL_ID,
        event: 'drinks',
        drinks,
        plays: 0,
      })
    }
  })

  it('refuse hors bornes ou hors forme, sans écrêter', () => {
    const base = { gameId: LOCAL_ID, event: 'drinks', drinks: 5, plays: 2 }
    for (const body of [
      // Ni participation ni gorgée : pas un relevé.
      { ...base, plays: 0, drinks: 0 },
      { ...base, plays: 0, drinks: 301 },
      { ...base, plays: -1 },
      { ...base, plays: 16 },
      { ...base, plays: 1.5 },
      { ...base, plays: '2' },
      { ...base, plays: undefined },
      { ...base, drinks: -1 },
      { ...base, drinks: 2.5 },
      { ...base, drinks: '5' },
      { ...base, drinks: Number.NaN },
      { ...base, drinks: undefined },
      { ...base, drinks: 41 },
      { ...base, plays: 15, drinks: 301 },
      { ...base, gameId: ONLINE_ONLY_ID },
      { ...base, gameId: 'jeu-inconnu' },
      { ...base, event: 'start' },
      { ...base, event: 'DRINKS' },
      [base],
      null,
      'drinks',
    ]) {
      expect(parseLocalDrinksReport(body)).toBeNull()
    }
  })

  it('un lancement ou une fin n’est pas un relevé, et un relevé n’est pas un lancement', () => {
    expect(parseLocalDrinksReport({ gameId: LOCAL_ID, event: 'start' })).toBeNull()
    expect(parseLocalGameReport({ gameId: LOCAL_ID, event: 'drinks', drinks: 5, plays: 2 })).toBeNull()
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
