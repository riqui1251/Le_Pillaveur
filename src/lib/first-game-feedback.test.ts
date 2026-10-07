import { describe, expect, it } from 'vitest'
import {
  FIRST_GAME_COMMENT_MAX,
  FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS,
  FIRST_GAME_FEEDBACK_WINDOW_MS,
  isFirstGameFeedbackEligible,
  isLocalFirstGameFeedbackEligible,
  parseFirstGameFeedback,
  sanitizeFeedbackPageUrl,
} from '@/lib/first-game-feedback'
import { GAMES } from '@/lib/games'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const NOW = new Date('2026-10-07T21:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)

/** Compte créé il y a 2 h, 1re partie terminée il y a 1 h, jamais sollicité. */
const ELIGIBLE = {
  askedAt: null,
  firstGameUnlockedAt: ago(HOUR_MS),
  createdAt: ago(2 * HOUR_MS),
  now: NOW,
}

describe('isFirstGameFeedbackEligible', () => {
  it('nouveau compte, 1re partie toute fraîche, jamais sollicité : la carte est due', () => {
    expect(isFirstGameFeedbackEligible(ELIGIBLE)).toBe(true)
  })

  it('déjà noté OU refusé (askedAt posé) : plus jamais', () => {
    expect(isFirstGameFeedbackEligible({ ...ELIGIBLE, askedAt: ago(30 * 60 * 1000) })).toBe(false)
  })

  it('aucune partie en ligne terminée (pas de succès first_game) : rien', () => {
    expect(isFirstGameFeedbackEligible({ ...ELIGIBLE, firstGameUnlockedAt: null })).toBe(false)
  })

  it('fenêtre de 24 h après le succès, bornes comprises', () => {
    const at = (ms: number) =>
      isFirstGameFeedbackEligible({ ...ELIGIBLE, firstGameUnlockedAt: ago(ms), createdAt: ago(ms + HOUR_MS) })
    expect(at(FIRST_GAME_FEEDBACK_WINDOW_MS)).toBe(true)
    expect(at(FIRST_GAME_FEEDBACK_WINDOW_MS + 1)).toBe(false)
    expect(at(3 * DAY_MS)).toBe(false)
  })

  it('succès daté dans le futur (horloge recalée) : compté comme récent', () => {
    expect(
      isFirstGameFeedbackEligible({ ...ELIGIBLE, firstGameUnlockedAt: new Date(NOW.getTime() + 5000) })
    ).toBe(true)
  })

  it('ancien compte qui reçoit first_game tardivement : pas un premier contact', () => {
    const unlocked = ago(HOUR_MS)
    const createdAt = (ageMs: number) => new Date(unlocked.getTime() - ageMs)
    expect(
      isFirstGameFeedbackEligible({
        ...ELIGIBLE,
        firstGameUnlockedAt: unlocked,
        createdAt: createdAt(FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS),
      })
    ).toBe(true)
    expect(
      isFirstGameFeedbackEligible({
        ...ELIGIBLE,
        firstGameUnlockedAt: unlocked,
        createdAt: createdAt(FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS + 1),
      })
    ).toBe(false)
    // Compte de juin, module des succès livré le 31/08 : 1re partie en octobre.
    expect(
      isFirstGameFeedbackEligible({ ...ELIGIBLE, createdAt: new Date('2026-06-01T10:00:00.000Z') })
    ).toBe(false)
  })

  it('date invalide : jamais éligible', () => {
    expect(isFirstGameFeedbackEligible({ ...ELIGIBLE, createdAt: new Date('nope') })).toBe(false)
    expect(isFirstGameFeedbackEligible({ ...ELIGIBLE, firstGameUnlockedAt: new Date('nope') })).toBe(false)
  })
})

describe('isLocalFirstGameFeedbackEligible', () => {
  const LOCAL = { askedAt: null, createdAt: ago(2 * HOUR_MS), now: NOW }

  it('compte récent jamais sollicité : la carte peut sortir en local', () => {
    expect(isLocalFirstGameFeedbackEligible(LOCAL)).toBe(true)
  })

  it('déjà noté ou refusé, en ligne comme en local : plus jamais', () => {
    expect(isLocalFirstGameFeedbackEligible({ ...LOCAL, askedAt: ago(DAY_MS) })).toBe(false)
  })

  it('habitué sur un téléphone neuf : compte de plus de 30 jours, pas un premier contact', () => {
    expect(isLocalFirstGameFeedbackEligible({ ...LOCAL, createdAt: ago(FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS) })).toBe(true)
    expect(
      isLocalFirstGameFeedbackEligible({ ...LOCAL, createdAt: ago(FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS + 1) })
    ).toBe(false)
    expect(isLocalFirstGameFeedbackEligible({ ...LOCAL, createdAt: new Date('2026-07-01T10:00:00.000Z') })).toBe(false)
  })

  it('date invalide : jamais éligible', () => {
    expect(isLocalFirstGameFeedbackEligible({ ...LOCAL, createdAt: new Date('nope') })).toBe(false)
  })
})

const GAME_ID = GAMES[0].id
const RATE = { action: 'rate', rating: 4, gameId: GAME_ID, playMode: 'online' }

describe('parseFirstGameFeedback — note', () => {
  it('note minimale : commentaire vide, sans pageUrl', () => {
    expect(parseFirstGameFeedback(RATE)).toEqual({
      action: 'rate',
      rating: 4,
      comment: '',
      gameId: GAME_ID,
      playMode: 'online',
      pageUrl: null,
    })
  })

  it('commentaire nettoyé (espaces) et TRONQUÉ à 1000, pas refusé', () => {
    expect(parseFirstGameFeedback({ ...RATE, comment: '  Super soirée  ' })).toMatchObject({
      comment: 'Super soirée',
    })
    const long = parseFirstGameFeedback({ ...RATE, comment: 'a'.repeat(FIRST_GAME_COMMENT_MAX + 500) })
    expect(long && long.action === 'rate' && long.comment.length).toBe(FIRST_GAME_COMMENT_MAX)
    expect(parseFirstGameFeedback({ ...RATE, comment: null })).toMatchObject({ comment: '' })
  })

  it.each([[0], [6], [3.5], ['4'], [null], [undefined], [Number.NaN]])('note %j : refusée', (rating) => {
    expect(parseFirstGameFeedback({ ...RATE, rating })).toBeNull()
  })

  it('bornes 1 et 5 acceptées', () => {
    expect(parseFirstGameFeedback({ ...RATE, rating: 1 })).not.toBeNull()
    expect(parseFirstGameFeedback({ ...RATE, rating: 5 })).not.toBeNull()
  })

  it.each([['jeu-invente'], [''], [undefined], [42]])('jeu %j : refusé (fausserait le résumé par jeu)', (gameId) => {
    expect(parseFirstGameFeedback({ ...RATE, gameId })).toBeNull()
  })

  it('chaque jeu de GAMES est accepté', () => {
    for (const game of GAMES) expect(parseFirstGameFeedback({ ...RATE, gameId: game.id })).not.toBeNull()
  })

  it('commentaire non textuel : refusé', () => {
    expect(parseFirstGameFeedback({ ...RATE, comment: { texte: 'x' } })).toBeNull()
  })

  it('mode local accepté, mode inconnu refusé', () => {
    expect(parseFirstGameFeedback({ ...RATE, playMode: 'local' })).toMatchObject({ playMode: 'local' })
    expect(parseFirstGameFeedback({ ...RATE, playMode: 'tv' })).toBeNull()
    expect(parseFirstGameFeedback({ ...RATE, playMode: undefined })).toBeNull()
  })

  it('pageUrl : chemin gardé, query et hash coupés', () => {
    expect(
      parseFirstGameFeedback({ ...RATE, pageUrl: 'https://lepillaveur.fr/fr/online/ABCD?token=x#y' })
    ).toMatchObject({ pageUrl: 'https://lepillaveur.fr/fr/online/ABCD' })
  })
})

describe('parseFirstGameFeedback — refus et corps invalides', () => {
  it('« Plus tard » : seul le mode compte, le jeu est ignoré quel qu’il soit', () => {
    expect(parseFirstGameFeedback({ action: 'dismiss', playMode: 'local' })).toEqual({
      action: 'dismiss',
      playMode: 'local',
    })
    expect(parseFirstGameFeedback({ action: 'dismiss', gameId: 'jeu-invente', playMode: 'online' })).toEqual({
      action: 'dismiss',
      playMode: 'online',
    })
    expect(parseFirstGameFeedback({ action: 'dismiss' })).toBeNull()
  })

  it.each([[null], ['rate'], [[RATE]], [{ ...RATE, action: 'delete' }], [{ ...RATE, action: undefined }]])(
    'corps %j : refusé',
    (body) => {
      expect(parseFirstGameFeedback(body)).toBeNull()
    }
  )
})

describe('sanitizeFeedbackPageUrl', () => {
  it('coupe query et hash, borne à 500, ignore le non-textuel et le vide', () => {
    expect(sanitizeFeedbackPageUrl('/fr/jeux/quiz?ref=x')).toBe('/fr/jeux/quiz')
    expect(sanitizeFeedbackPageUrl('/fr/jeux/quiz#regles')).toBe('/fr/jeux/quiz')
    expect(sanitizeFeedbackPageUrl(`/${'a'.repeat(800)}`)).toHaveLength(500)
    expect(sanitizeFeedbackPageUrl('?seulement=query')).toBeNull()
    expect(sanitizeFeedbackPageUrl('')).toBeNull()
    expect(sanitizeFeedbackPageUrl(12)).toBeNull()
    expect(sanitizeFeedbackPageUrl(undefined)).toBeNull()
  })
})
