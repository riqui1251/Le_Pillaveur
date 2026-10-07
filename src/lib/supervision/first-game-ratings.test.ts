import { describe, expect, it } from 'vitest'
import {
  distributionRows,
  filledStars,
  isFirstGamePlayMode,
  parseFirstGameFeedbackSummary,
  sortByGameVolume,
} from '@/lib/supervision/first-game-ratings'

const CREATED_AT = '2026-10-06T20:15:00.000Z'

function validBody() {
  return {
    summary: {
      total: 12,
      average: 4.25,
      last30d: { count: 5, average: 3.8 },
      distribution: { '1': 1, '2': 0, '3': 2, '4': 4, '5': 5 },
      byGame: [
        { gameId: 'quiz', count: 2, average: 5 },
        { gameId: 'petit-buveur', count: 7, average: 4.1 },
        { gameId: 'tabou', count: 3, average: 3.7 },
      ],
      recentComments: [
        { id: 'f1', rating: 5, gameId: 'quiz', playMode: 'online', comment: 'Top !', createdAt: CREATED_AT },
      ],
    },
  }
}

describe('parseFirstGameFeedbackSummary', () => {
  it('réponse conforme : recopiée, jeux classés par volume', () => {
    const summary = parseFirstGameFeedbackSummary(validBody())
    expect(summary).toEqual({
      total: 12,
      average: 4.25,
      last30d: { count: 5, average: 3.8 },
      distribution: { '1': 1, '2': 0, '3': 2, '4': 4, '5': 5 },
      byGame: [
        { gameId: 'petit-buveur', count: 7, average: 4.1 },
        { gameId: 'tabou', count: 3, average: 3.7 },
        { gameId: 'quiz', count: 2, average: 5 },
      ],
      recentComments: [
        { id: 'f1', rating: 5, gameId: 'quiz', playMode: 'online', comment: 'Top !', createdAt: CREATED_AT },
      ],
    })
  })

  it('réponse inexploitable (serveur antérieur, page d’erreur) : null, jamais un faux 0', () => {
    expect(parseFirstGameFeedbackSummary(null)).toBeNull()
    expect(parseFirstGameFeedbackSummary('<html>502</html>')).toBeNull()
    expect(parseFirstGameFeedbackSummary({ error: 'Accès refusé' })).toBeNull()
    expect(parseFirstGameFeedbackSummary({ summary: { average: 4 } })).toBeNull()
    expect(parseFirstGameFeedbackSummary({ summary: { total: Number.NaN } })).toBeNull()
  })

  it('aucun avis : moyennes nulles, répartition à 0, listes vides', () => {
    const summary = parseFirstGameFeedbackSummary({
      summary: {
        total: 0,
        average: null,
        last30d: { count: 0, average: null },
        distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        byGame: [],
        recentComments: [],
      },
    })
    expect(summary).toEqual({
      total: 0,
      average: null,
      last30d: { count: 0, average: null },
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      byGame: [],
      recentComments: [],
    })
  })

  it('champs manquants ou illisibles : complétés à 0 / null sans faire tomber le reste', () => {
    const summary = parseFirstGameFeedbackSummary({
      summary: { total: 3, average: 'quatre', distribution: { '5': 3, '4': -2, '2': Number.NaN } },
    })
    expect(summary).toEqual({
      total: 3,
      average: null,
      last30d: { count: 0, average: null },
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 3 },
      byGame: [],
      recentComments: [],
    })
  })

  it('moyenne hors échelle : bornée à 5', () => {
    const body = validBody()
    body.summary.average = 7
    expect(parseFirstGameFeedbackSummary(body)?.average).toBe(5)
  })

  it('écarte seules les rangées et commentaires mal formés', () => {
    const body = validBody() as { summary: Record<string, unknown> }
    body.summary.byGame = [
      { gameId: 'quiz', count: 2, average: 5 },
      { gameId: '', count: 4, average: 4 },
      { gameId: 'tabou', count: 0, average: 4 },
      { gameId: 'pendu', count: 3, average: null },
      'pmu',
    ]
    body.summary.recentComments = [
      { id: 'ok', rating: 4, gameId: null, playMode: null, comment: 'Bien', createdAt: CREATED_AT },
      { id: 'vide', rating: 4, gameId: 'quiz', playMode: 'local', comment: '   ', createdAt: CREATED_AT },
      { id: 'sans-date', rating: 4, gameId: 'quiz', playMode: 'local', comment: 'x', createdAt: 'hier' },
      { id: 'sans-note', rating: null, gameId: 'quiz', playMode: 'local', comment: 'x', createdAt: CREATED_AT },
      { rating: 3, comment: 'sans id', createdAt: CREATED_AT },
    ]
    const summary = parseFirstGameFeedbackSummary(body)
    expect(summary?.byGame).toEqual([{ gameId: 'quiz', count: 2, average: 5 }])
    expect(summary?.recentComments).toEqual([
      { id: 'ok', rating: 4, gameId: null, playMode: null, comment: 'Bien', createdAt: CREATED_AT },
    ])
  })
})

describe('sortByGameVolume', () => {
  it('volume d’abord : un 5/5 sur un seul avis ne passe pas devant trente avis', () => {
    const sorted = sortByGameVolume([
      { gameId: 'quiz', count: 1, average: 5 },
      { gameId: 'pmu', count: 30, average: 4.2 },
    ])
    expect(sorted.map((g) => g.gameId)).toEqual(['pmu', 'quiz'])
  })

  it('à volume égal : meilleure moyenne, puis identifiant (ordre stable)', () => {
    const sorted = sortByGameVolume([
      { gameId: 'tabou', count: 4, average: 3 },
      { gameId: 'quiz', count: 4, average: 4.5 },
      { gameId: 'bluff', count: 4, average: 3 },
    ])
    expect(sorted.map((g) => g.gameId)).toEqual(['quiz', 'bluff', 'tabou'])
  })

  it('ne modifie pas le tableau reçu', () => {
    const rows = [
      { gameId: 'a', count: 1, average: 4 },
      { gameId: 'b', count: 2, average: 4 },
    ]
    sortByGameVolume(rows)
    expect(rows.map((g) => g.gameId)).toEqual(['a', 'b'])
  })
})

describe('distributionRows', () => {
  it('5 étoiles en haut, 1 en bas, chaque note avec son effectif', () => {
    expect(distributionRows({ '1': 1, '2': 0, '3': 2, '4': 4, '5': 5 })).toEqual([
      { rating: 5, count: 5 },
      { rating: 4, count: 4 },
      { rating: 3, count: 2 },
      { rating: 2, count: 0 },
      { rating: 1, count: 1 },
    ])
  })
})

describe('filledStars', () => {
  it('arrondit à l’étoile la plus proche', () => {
    expect(filledStars(4.3)).toBe(4)
    expect(filledStars(4.5)).toBe(5)
    expect(filledStars(1)).toBe(1)
  })

  it('borne à 0..5 et ignore l’illisible', () => {
    expect(filledStars(9)).toBe(5)
    expect(filledStars(-1)).toBe(0)
    expect(filledStars(null)).toBe(0)
    expect(filledStars(undefined)).toBe(0)
    expect(filledStars(Number.NaN)).toBe(0)
  })
})

describe('isFirstGamePlayMode', () => {
  it('reconnaît les deux modes, rien d’autre', () => {
    expect(isFirstGamePlayMode('online')).toBe(true)
    expect(isFirstGamePlayMode('local')).toBe(true)
    expect(isFirstGamePlayMode('Online')).toBe(false)
    expect(isFirstGamePlayMode(null)).toBe(false)
  })
})
