import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_INBOX_WHERE,
  FEEDBACK_TYPES,
  FIRST_GAME_FEEDBACK_TYPE,
  feedbackTypeLabel,
  isFeedbackType,
} from '@/lib/feedback'

/**
 * Le type « avis de 1re partie » vit à part : le POST générique /api/feedback
 * valide contre FEEDBACK_TYPES et ne doit pas pouvoir en fabriquer ; la boîte
 * de tri en écarte les notes sans commentaire ; le staff le lit sous un
 * libellé à lui.
 */

describe('FIRST_GAME_FEEDBACK_TYPE', () => {
  it('reste HORS de FEEDBACK_TYPES : le formulaire générique le refuse', () => {
    expect(FIRST_GAME_FEEDBACK_TYPE).toBe('first-game')
    expect(FEEDBACK_TYPES).not.toContain(FIRST_GAME_FEEDBACK_TYPE)
    expect(isFeedbackType(FIRST_GAME_FEEDBACK_TYPE)).toBe(false)
  })

  it('les trois types du formulaire restent acceptés', () => {
    for (const type of ['bug', 'improvement', 'comment']) expect(isFeedbackType(type)).toBe(true)
  })
})

describe('feedbackTypeLabel', () => {
  it('libellé staff de chaque type connu', () => {
    expect(feedbackTypeLabel('bug')).toBe('Bug')
    expect(feedbackTypeLabel('improvement')).toBe('Amélioration')
    expect(feedbackTypeLabel('comment')).toBe('Commentaire')
    expect(feedbackTypeLabel(FIRST_GAME_FEEDBACK_TYPE)).toBe('Avis 1re partie')
  })

  it('type inconnu (colonne brute) : renvoyé tel quel, jamais une exception', () => {
    expect(feedbackTypeLabel('ancien-type')).toBe('ancien-type')
  })
})

describe('FEEDBACK_INBOX_WHERE', () => {
  it('écarte exactement « 1re partie ET message vide » — rien d’autre', () => {
    expect(FEEDBACK_INBOX_WHERE).toEqual({ NOT: { type: 'first-game', message: '' } })
  })
})
