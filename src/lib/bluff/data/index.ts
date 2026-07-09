import { getQuizQuestions } from '@/lib/quiz/data'
import type { BluffPrompt } from '../engine'

/**
 * Contenu du Grand Bluff — mince projection du pool quiz déjà écrit
 * (`src/lib/quiz/data`) : question + vraie réponse + les 3 mauvais choix
 * ORIGINAUX (réutilisés comme leurres de secours en cas de collision bluff ↔
 * vraie réponse). Aucun contenu à écrire spécifiquement pour ce jeu.
 * ⚠️ SERVER-ONLY : contient les réponses.
 */
export function getBluffPrompts(lang: string | null | undefined): BluffPrompt[] {
  return getQuizQuestions(lang).map((q) => ({
    id: q.id,
    q: q.q,
    answer: q.choices[q.answer],
    decoys: q.choices.filter((_, i) => i !== q.answer),
  }))
}
