import { describe, expect, it } from 'vitest'
import { newSoireeId } from '@/lib/soiree/storage'
import { SOIREE_VOTE_COMMENT_MAX, parseSoireeVote, soireeVoteId } from './soiree-feedback'

/**
 * Votes du Mode Soirée : ce que la route accepte (portée, soirée, note 1..5,
 * manche et jeu connus, commentaire réservé à la soirée entière) et
 * l'identifiant qui tient « un vote par manche, un par soirée » en base.
 */

const SOIREE_ID = newSoireeId(1_790_000_000_000)
const ROUND = { scope: 'round', soireeId: SOIREE_ID, round: 2, gameId: 'hi-lo', rating: 4 }
const NIGHT = { scope: 'soiree', soireeId: SOIREE_ID, rating: 5 }

describe('parseSoireeVote', () => {
  it('manche : note, manche et jeu gardés ; chemin de page sans requête', () => {
    expect(parseSoireeVote({ ...ROUND, pageUrl: '/fr/soiree?fin=1' })).toEqual({
      scope: 'round',
      soireeId: SOIREE_ID,
      round: 2,
      gameId: 'hi-lo',
      rating: 4,
      pageUrl: '/fr/soiree',
    })
  })

  it('manche : un commentaire qui arrive est ignoré, jamais stocké', () => {
    const vote = parseSoireeVote({ ...ROUND, comment: 'tiens' })
    expect(vote && 'comment' in vote).toBe(false)
  })

  it('soirée : commentaire nettoyé et tronqué (pas refusé), vide par défaut', () => {
    expect(parseSoireeVote({ ...NIGHT, comment: '  Top soirée  ' })).toMatchObject({ scope: 'soiree', comment: 'Top soirée' })
    expect(parseSoireeVote(NIGHT)).toMatchObject({ comment: '', pageUrl: null })
    const long = parseSoireeVote({ ...NIGHT, comment: 'a'.repeat(SOIREE_VOTE_COMMENT_MAX + 50) })
    expect(long && long.scope === 'soiree' && long.comment.length).toBe(SOIREE_VOTE_COMMENT_MAX)
  })

  it('refuse ce qui fausserait le résumé', () => {
    for (const body of [
      null,
      'texte',
      [],
      { ...ROUND, scope: 'partie' },
      { ...ROUND, rating: 0 },
      { ...ROUND, rating: 6 },
      { ...ROUND, rating: 3.5 },
      { ...ROUND, rating: '4' },
      { ...ROUND, round: -1 },
      { ...ROUND, round: 1.5 },
      { ...ROUND, round: 100 },
      { ...ROUND, gameId: 'jeu-invente' },
      { ...ROUND, gameId: undefined },
      { ...ROUND, soireeId: 'Pas Une Soirée' },
      { ...ROUND, soireeId: undefined },
      { ...NIGHT, comment: 42 },
    ]) {
      expect(parseSoireeVote(body), JSON.stringify(body)).toBeNull()
    }
  })
})

describe('soireeVoteId', () => {
  it('un par manche, un pour la soirée, stable d’un envoi à l’autre', () => {
    expect(soireeVoteId({ scope: 'round', soireeId: SOIREE_ID, round: 2 })).toBe(`soiree-${SOIREE_ID}-m2`)
    expect(soireeVoteId({ scope: 'round', soireeId: SOIREE_ID, round: 3 })).not.toBe(soireeVoteId({ scope: 'round', soireeId: SOIREE_ID, round: 2 }))
    expect(soireeVoteId({ scope: 'soiree', soireeId: SOIREE_ID })).toBe(`soiree-${SOIREE_ID}-fin`)
  })

  it('les identifiants de soirée tirés par l’appareil sont tous acceptés', () => {
    for (let i = 0; i < 200; i++) {
      expect(parseSoireeVote({ ...NIGHT, soireeId: newSoireeId() })).not.toBeNull()
    }
  })
})
