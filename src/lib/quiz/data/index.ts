import type { QuizQuestion } from '../engine'
import { QUIZ_QUESTIONS_FR } from './fr'
import { QUIZ_QUESTIONS_EN } from './en'
import { QUIZ_QUESTIONS_ES } from './es'
import { QUIZ_QUESTIONS_IT } from './it'

export type QuizLang = 'fr' | 'en' | 'es' | 'it'

const QUESTIONS_BY_LANG: Record<QuizLang, QuizQuestion[]> = {
  fr: QUIZ_QUESTIONS_FR,
  en: QUIZ_QUESTIONS_EN,
  es: QUIZ_QUESTIONS_ES,
  it: QUIZ_QUESTIONS_IT,
}

/**
 * Questions dans la langue de la SALLE (posée à sa création).
 * ⚠️ SERVER-ONLY : contient les réponses.
 */
export function getQuizQuestions(lang: string | null | undefined): QuizQuestion[] {
  return QUESTIONS_BY_LANG[(lang ?? 'fr') as QuizLang] ?? QUESTIONS_BY_LANG.fr
}
