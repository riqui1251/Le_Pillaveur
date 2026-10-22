import type { Stroke } from '@/lib/crobard/engine'

/**
 * Brouillon du dessin d'une manche, avec son historique d'annulation.
 *
 * Le dessin du Téléphone reste LOCAL jusqu'à l'envoi : annuler le dernier
 * trait ne coûte aucune requête. Au doigt, c'est le geste le plus utile — il
 * n'existait pas, et la seule correction possible était de tout effacer.
 */

export type DrawHistory = {
  strokes: Stroke[]
  /** États précédents, le plus récent en dernier. */
  past: Stroke[][]
}

export type DrawHistoryAction =
  | { type: 'stroke'; stroke: Stroke }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'reset' }

/** Profondeur d'annulation : bien au-delà d'un dessin de 80 s, sans grossir sans fin. */
export const DRAW_HISTORY_LIMIT = 100

export const EMPTY_DRAW_HISTORY: DrawHistory = { strokes: [], past: [] }

export function drawHistoryReducer(history: DrawHistory, action: DrawHistoryAction): DrawHistory {
  switch (action.type) {
    case 'stroke':
      return {
        strokes: [...history.strokes, action.stroke],
        past: [...history.past, history.strokes].slice(-DRAW_HISTORY_LIMIT),
      }
    case 'undo': {
      if (history.past.length === 0) return history
      return { strokes: history.past[history.past.length - 1], past: history.past.slice(0, -1) }
    }
    // « Tout effacer » est déjà confirmé par la barre d'outils : feuille neuve.
    case 'clear':
    case 'reset':
      return EMPTY_DRAW_HISTORY
  }
}
