import { describe, expect, it } from 'vitest'
import {
  distributionRows,
  filledStars,
  isFirstGamePlayMode,
  parseFirstGameFeedbackSummary,
  parseFirstGameReviewsPage,
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
    })
  })

  it('réponse inexploitable (serveur antérieur, page d’erreur) : null, jamais un faux 0', () => {
    expect(parseFirstGameFeedbackSummary(null)).toBeNull()
    expect(parseFirstGameFeedbackSummary('<html>502</html>')).toBeNull()
    expect(parseFirstGameFeedbackSummary({ error: 'Accès refusé' })).toBeNull()
    expect(parseFirstGameFeedbackSummary({ summary: { average: 4 } })).toBeNull()
    expect(parseFirstGameFeedbackSummary({ summary: { total: Number.NaN } })).toBeNull()
  })

  it('aucun avis : moyennes nulles, répartition à 0, liste vide', () => {
    const summary = parseFirstGameFeedbackSummary({
      summary: {
        total: 0,
        average: null,
        last30d: { count: 0, average: null },
        distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        byGame: [],
      },
    })
    expect(summary).toEqual({
      total: 0,
      average: null,
      last30d: { count: 0, average: null },
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      byGame: [],
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
    })
  })

  it('moyenne hors échelle : bornée à 5', () => {
    const body = validBody()
    body.summary.average = 7
    expect(parseFirstGameFeedbackSummary(body)?.average).toBe(5)
  })

  it('écarte seules les rangées mal formées', () => {
    const body = validBody() as { summary: Record<string, unknown> }
    body.summary.byGame = [
      { gameId: 'quiz', count: 2, average: 5 },
      { gameId: '', count: 4, average: 4 },
      { gameId: 'tabou', count: 0, average: 4 },
      { gameId: 'pendu', count: 3, average: null },
      'pmu',
    ]
    expect(parseFirstGameFeedbackSummary(body)?.byGame).toEqual([{ gameId: 'quiz', count: 2, average: 5 }])
  })
})

describe('parseFirstGameReviewsPage', () => {
  const alice = { kind: 'account', userId: 'u-alice', name: 'Alice', isGuest: false }

  it('réponse conforme : chaque avis recopié avec son auteur', () => {
    const page = parseFirstGameReviewsPage({
      reviews: [
        { id: 'a', rating: 5, gameId: 'quiz', playMode: 'online', comment: 'Top !', createdAt: CREATED_AT, author: alice },
        {
          id: 'b',
          rating: 2,
          gameId: 'tabou',
          playMode: 'online',
          comment: '',
          createdAt: CREATED_AT,
          author: { kind: 'account', userId: 'u-zed', name: 'Zed', isGuest: true },
        },
        { id: 'c', rating: 3, gameId: null, playMode: null, comment: '', createdAt: CREATED_AT, author: { kind: 'deleted' } },
        { id: 'd', rating: 1, gameId: 'pmu', playMode: 'local', comment: '', createdAt: CREATED_AT, author: { kind: 'anonymous' } },
      ],
      total: 14,
      page: 1,
      pageSize: 10,
    })
    expect(page).toEqual({
      total: 14,
      reviews: [
        { id: 'a', rating: 5, gameId: 'quiz', playMode: 'online', comment: 'Top !', createdAt: CREATED_AT, author: alice },
        {
          id: 'b',
          rating: 2,
          gameId: 'tabou',
          playMode: 'online',
          comment: '',
          createdAt: CREATED_AT,
          author: { kind: 'account', userId: 'u-zed', name: 'Zed', isGuest: true },
        },
        { id: 'c', rating: 3, gameId: null, playMode: null, comment: '', createdAt: CREATED_AT, author: { kind: 'deleted' } },
        { id: 'd', rating: 1, gameId: 'pmu', playMode: 'local', comment: '', createdAt: CREATED_AT, author: { kind: 'anonymous' } },
      ],
    })
  })

  it('réponse inexploitable (route absente, refus, page d’erreur) : null, jamais une liste vide', () => {
    expect(parseFirstGameReviewsPage(null)).toBeNull()
    expect(parseFirstGameReviewsPage('<html>502</html>')).toBeNull()
    expect(parseFirstGameReviewsPage({ error: 'forbidden', code: 'forbidden' })).toBeNull()
    expect(parseFirstGameReviewsPage({ reviews: [] })).toBeNull()
    expect(parseFirstGameReviewsPage({ reviews: 'aucun', total: 0 })).toBeNull()
  })

  it('écarte seuls les avis mal formés : note hors 1..5, date illisible, auteur inconnu', () => {
    const ok = { id: 'ok', rating: 4, gameId: 'quiz', playMode: 'local', comment: 'Bien', createdAt: CREATED_AT, author: alice }
    const page = parseFirstGameReviewsPage({
      total: 6,
      reviews: [
        ok,
        { ...ok, id: 'zero', rating: 0 },
        { ...ok, id: 'demi', rating: 3.5 },
        { ...ok, id: 'sans-date', createdAt: 'hier' },
        { ...ok, id: 'auteur-inconnu', author: { kind: 'robot' } },
        { ...ok, id: 'compte-sans-id', author: { kind: 'account', name: 'X' } },
        { ...ok, id: '' },
        'avis',
      ],
    })
    expect(page?.reviews.map((r) => r.id)).toEqual(['ok'])
    expect(page?.total).toBe(6)
  })

  it('commentaire absent : chaîne vide ; invité absent : faux', () => {
    const page = parseFirstGameReviewsPage({
      total: 1,
      reviews: [
        {
          id: 'x',
          rating: 5,
          gameId: 'quiz',
          playMode: 'online',
          createdAt: CREATED_AT,
          author: { kind: 'account', userId: 'u1', name: 'Bob' },
        },
      ],
    })
    expect(page?.reviews[0].comment).toBe('')
    expect(page?.reviews[0].author).toEqual({ kind: 'account', userId: 'u1', name: 'Bob', isGuest: false })
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
