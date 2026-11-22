import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * « Parties jouées » de la Supervision (cumul depuis toujours). Une partie en
 * ligne classée laisse une ligne par compte humain, et une salle rejouée
 * garde son identifiant : le décompte doit rendre UNE partie par table et par
 * fin, ni une par joueur, ni une par salle.
 */

const { statsMock, userMock, resultMock } = vi.hoisted(() => ({
  statsMock: { groupBy: vi.fn() },
  userMock: { findMany: vi.fn() },
  resultMock: { groupBy: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { stats: statsMock, user: userMock, onlineMatchResult: resultMock },
}))

import { SAME_MATCH_WINDOW_MS, type MatchEnd } from '@/lib/online/match-history'
import { countOnlineGames, getGlobalGamePlayStats } from '@/lib/game-stats-server'

const MIN = 60 * 1000
const START = Date.parse('2026-11-21T20:00:00.000Z')

/** Ligne de résultat : salle, jeu, fin à `minutes` du début de la soirée (+ écart en ms). */
function row(roomId: string, gameId: string, minutes: number, extraMs = 0): MatchEnd {
  return { roomId, gameId, finishedAt: new Date(START + minutes * MIN + extraMs) }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('countOnlineGames', () => {
  it('une table de 4 : quatre lignes, UNE partie', () => {
    const rows = [row('r1', 'quiz', 20), row('r1', 'quiz', 20), row('r1', 'quiz', 20), row('r1', 'quiz', 20)]
    expect(countOnlineGames(rows)).toEqual(new Map([['quiz', 1]]))
  })

  it('trois manches enchaînées dans la même salle avec « Rejouer » : trois parties, pas une', () => {
    const rows = [0, 25, 50].flatMap((minutes) => [row('r1', 'quiz', minutes), row('r1', 'quiz', minutes)])
    expect(countOnlineGames(rows)).toEqual(new Map([['quiz', 3]]))
  })

  it('lignes d’une même partie écrites à quelques millisecondes d’écart : une seule partie', () => {
    const rows = [row('r1', 'quiz', 20), row('r1', 'quiz', 20, 40), row('r1', 'quiz', 20, 900)]
    expect(countOnlineGames(rows)).toEqual(new Map([['quiz', 1]]))
  })

  it('fenêtre : à 5 s pile c’est la même partie, une milliseconde de plus en fait deux', () => {
    expect(countOnlineGames([row('r1', 'quiz', 20), row('r1', 'quiz', 20, SAME_MATCH_WINDOW_MS)]).get('quiz')).toBe(1)
    expect(
      countOnlineGames([row('r1', 'quiz', 20), row('r1', 'quiz', 20, SAME_MATCH_WINDOW_MS + 1)]).get('quiz')
    ).toBe(2)
  })

  it('deux salles qui finissent au même instant : deux parties', () => {
    expect(countOnlineGames([row('r1', 'quiz', 20), row('r2', 'quiz', 20)])).toEqual(new Map([['quiz', 2]]))
  })

  it('une salle qui change de jeu : chaque jeu compte les siennes', () => {
    const rows = [row('r1', 'quiz', 20), row('r1', 'loup-garou', 60), row('r1', 'loup-garou', 110), row('r1', 'quiz', 140)]
    expect(countOnlineGames(rows)).toEqual(
      new Map([
        ['quiz', 2],
        ['loup-garou', 2],
      ])
    )
  })

  it('l’ordre des lignes ne compte pas, une date illisible est ignorée, aucune ligne : aucun jeu', () => {
    const rows = [row('r1', 'quiz', 50), row('r1', 'quiz', 0), row('r1', 'quiz', 25), row('r1', 'quiz', 0)]
    expect(countOnlineGames(rows).get('quiz')).toBe(3)
    expect(countOnlineGames([{ roomId: 'r1', gameId: 'quiz', finishedAt: new Date('x') }]).size).toBe(0)
    expect(countOnlineGames([]).size).toBe(0)
  })
})

describe('getGlobalGamePlayStats', () => {
  it('additionne parties locales synchronisées et parties en ligne, revanches comptées une à une', async () => {
    statsMock.groupBy.mockResolvedValue([])
    userMock.findMany.mockResolvedValue([
      { localPlayersJson: JSON.stringify([{ stats: { gameStats: { quiz: { gamesPlayed: 4 }, pmu: { gamesPlayed: 2 } } } }]) },
    ])
    // Ce que la base rend : un groupe par (jeu, salle, fin). Une soirée de
    // trois manches de Quiz dans la même salle, et une partie de Loup-Garou.
    resultMock.groupBy.mockResolvedValue([
      row('r1', 'quiz', 0),
      row('r1', 'quiz', 25),
      row('r1', 'quiz', 50),
      row('r2', 'loup-garou', 40),
    ])

    const stats = await getGlobalGamePlayStats()

    expect(resultMock.groupBy).toHaveBeenCalledWith({ by: ['gameId', 'roomId', 'finishedAt'] })
    const played = Object.fromEntries(stats.games.map((game) => [game.gameId, game.partiesPlayed]))
    expect(played).toEqual({ quiz: 7, pmu: 2, 'loup-garou': 1 })
    expect(stats.totalParties).toBe(10)
    // Le plus joué d'abord.
    expect(stats.games[0].gameId).toBe('quiz')
  })
})
