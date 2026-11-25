import { beforeEach, describe, expect, it, vi } from 'vitest'

// Base simulée : on vérifie l'écriture demandée (jour de Paris, incréments,
// reprise sur conflit) et l'agrégat, pas le SQL de Prisma.
const { gameDrinkDailyDb } = vi.hoisted(() => ({
  gameDrinkDailyDb: { upsert: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { gameDrinkDaily: gameDrinkDailyDb } }))

import { gameDrinkRanking, recordGameDrinks } from './game-drinks-server'

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
// 10/10/2026 à 23 h 30 UTC = déjà le 11/10 à Paris.
const LATE = new Date('2026-10-10T23:30:00Z')

beforeEach(() => {
  vi.resetAllMocks()
  gameDrinkDailyDb.upsert.mockResolvedValue({})
  gameDrinkDailyDb.findMany.mockResolvedValue([])
})

describe('recordGameDrinks', () => {
  it('incrémente gorgées et participations sur le jour de Paris du relevé', async () => {
    await recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: 7, plays: 4 }, LATE)
    expect(gameDrinkDailyDb.upsert).toHaveBeenCalledWith({
      where: { day_gameId_mode: { day: '2026-10-11', gameId: 'purple', mode: 'local' } },
      create: { day: '2026-10-11', gameId: 'purple', mode: 'local', drinks: 7, plays: 4 },
      update: { drinks: { increment: 7 }, plays: { increment: 4 } },
    })
  })

  it('compte une partie à 0 gorgée : elle fait baisser la moyenne, elle existe', async () => {
    await recordGameDrinks({ gameId: 'quiz', mode: 'online', drinks: 0, plays: 3 }, LATE)
    expect(gameDrinkDailyDb.upsert).toHaveBeenCalledTimes(1)
  })

  it('ajoute une correction (gorgées sans participation) au jour, sans participation', async () => {
    await recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: 3, plays: 0 }, LATE)
    expect(gameDrinkDailyDb.upsert).toHaveBeenCalledWith({
      where: { day_gameId_mode: { day: '2026-10-11', gameId: 'purple', mode: 'local' } },
      create: { day: '2026-10-11', gameId: 'purple', mode: 'local', drinks: 3, plays: 0 },
      update: { drinks: { increment: 3 }, plays: { increment: 0 } },
    })
  })

  it('ignore un relevé vide, mal formé, d’un mode inconnu ou d’un jeu hors catalogue', async () => {
    await recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: 0, plays: 0 }, LATE)
    await recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: 3, plays: -1 }, LATE)
    await recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: -1, plays: 2 }, LATE)
    await recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: 1.5, plays: 2 }, LATE)
    await recordGameDrinks({ gameId: 'purple', mode: 'tv' as never, drinks: 1, plays: 2 }, LATE)
    await recordGameDrinks({ gameId: 'jeu-inconnu', mode: 'local', drinks: 1, plays: 2 }, LATE)
    expect(gameDrinkDailyDb.upsert).not.toHaveBeenCalled()
  })

  it('repasse une fois après une création concurrente (P2002), pas au-delà', async () => {
    gameDrinkDailyDb.upsert.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({})
    await recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: 2, plays: 2 }, LATE)
    expect(gameDrinkDailyDb.upsert).toHaveBeenCalledTimes(2)

    gameDrinkDailyDb.upsert.mockReset()
    gameDrinkDailyDb.upsert.mockRejectedValue(new Error('disque plein'))
    await expect(recordGameDrinks({ gameId: 'purple', mode: 'local', drinks: 2, plays: 2 }, LATE)).rejects.toThrow('disque plein')
    expect(gameDrinkDailyDb.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('gameDrinkRanking', () => {
  it('lit les 90 derniers jours de Paris, aujourd’hui compris', async () => {
    await gameDrinkRanking({ now: LATE })
    // 11/10/2026 - 89 jours = 14/07/2026.
    expect(gameDrinkDailyDb.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { day: { gte: '2026-07-14' } } }))
  })

  it('additionne local et en ligne par jeu, classe par gorgées par participation, écarte les jeux trop peu joués', async () => {
    gameDrinkDailyDb.findMany.mockResolvedValue([
      { gameId: 'purple', mode: 'local', drinks: 40, plays: 15 },
      // Une correction de l'entracte : des gorgées sans participation.
      { gameId: 'purple', mode: 'local', drinks: 5, plays: 0 },
      { gameId: 'purple', mode: 'online', drinks: 15, plays: 15 },
      { gameId: 'quiz', mode: 'online', drinks: 90, plays: 30 },
      // 29 participations : une de moins que le seuil.
      { gameId: '1220', mode: 'local', drinks: 290, plays: 29 },
      { gameId: 'jeu-retire', mode: 'local', drinks: 99, plays: 99 },
    ])
    const rows = await gameDrinkRanking({ now: LATE })
    expect(rows.map((r) => r.gameId)).toEqual(['quiz', 'purple'])
    expect(rows[0]).toMatchObject({ drinks: 90, plays: 30, perPlay: 3, localPlays: 0, onlinePlays: 30 })
    expect(rows[1]).toMatchObject({ drinks: 60, plays: 30, perPlay: 2, localPlays: 15, onlinePlays: 15 })
  })

  it('seuil de 30 participations : une poignée de relevés ne suffit pas à classer un jeu', async () => {
    gameDrinkDailyDb.findMany.mockResolvedValue([
      { gameId: 'purple', mode: 'local', drinks: 300, plays: 15 },
      { gameId: 'purple', mode: 'local', drinks: 280, plays: 14 },
      { gameId: 'purple', mode: 'local', drinks: 300, plays: 0 },
    ])
    expect(await gameDrinkRanking({ now: LATE })).toEqual([])
  })

  it('écarte un jeu qui n’a enregistré aucune gorgée : il ne les compte pas, il n’est pas sobre', async () => {
    gameDrinkDailyDb.findMany.mockResolvedValue([
      { gameId: 'coupe-du-roi', mode: 'local', drinks: 0, plays: 40 },
      { gameId: 'purple', mode: 'local', drinks: 30, plays: 30 },
    ])
    const rows = await gameDrinkRanking({ now: LATE })
    expect(rows.map((r) => r.gameId)).toEqual(['purple'])
  })

  it('départage à moyenne égale par le total de gorgées, puis par identifiant', async () => {
    gameDrinkDailyDb.findMany.mockResolvedValue([
      { gameId: 'purple', mode: 'local', drinks: 60, plays: 30 },
      { gameId: 'quiz', mode: 'online', drinks: 120, plays: 60 },
    ])
    const rows = await gameDrinkRanking({ now: LATE })
    expect(rows.map((r) => r.gameId)).toEqual(['quiz', 'purple'])
  })
})
