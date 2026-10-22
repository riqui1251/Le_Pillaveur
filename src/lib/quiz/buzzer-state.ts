import type { QuizPhase } from './engine'

/**
 * État d'affichage d'un buzzer du Grand Pillaveur en ligne.
 * - `open` : on peut encore répondre ;
 * - `sending` : touché, réponse du serveur attendue ;
 * - `chosen` / `locked` : ma réponse est partie, les autres cases s'éteignent ;
 * - `correct` / `wrongMine` / `wrong` : reveal (bonne réponse, mon mauvais
 *   choix, les autres mauvaises réponses, atténuées).
 */
export type QuizBuzzerState = 'open' | 'sending' | 'chosen' | 'locked' | 'correct' | 'wrongMine' | 'wrong'

export type QuizBuzzerInput = {
  phase: QuizPhase
  /** Mon choix enregistré par le serveur (phase question). */
  myChoice: number | null
  /** Case touchée dont la réponse du serveur n'est pas encore arrivée. */
  pendingChoice: number | null
  /** Reveal : bonne réponse publique. */
  answer?: number | null
  /**
   * Reveal : mon choix, lu dans le résultat public de la question. Le moteur
   * vide les réponses en entrant au reveal (myChoice y repasse à null).
   */
  revealChoice?: number | null
}

export function quizBuzzerState(idx: number, input: QuizBuzzerInput): QuizBuzzerState {
  if (input.phase === 'reveal') {
    if (idx === input.answer) return 'correct'
    return idx === input.revealChoice ? 'wrongMine' : 'wrong'
  }
  if (input.phase !== 'question') return 'locked'
  if (input.myChoice !== null) return idx === input.myChoice ? 'chosen' : 'locked'
  if (input.pendingChoice !== null) return idx === input.pendingChoice ? 'sending' : 'locked'
  return 'open'
}
