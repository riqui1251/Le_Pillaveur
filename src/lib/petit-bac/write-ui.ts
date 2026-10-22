/**
 * ÉCRAN D'ÉCRITURE du Petit Bac en ligne — logique pure, testée à part :
 * la touche Entrée du clavier virtuel et la place que ce clavier mange.
 */

export type PbcEnterAction =
  | { type: 'focus'; index: number }
  | { type: 'stop' }
  | { type: 'stay' }
  | { type: 'blur' }

/**
 * Entrée dans la case `index`. iOS affiche « suivant » mais ne déplace pas
 * le focus seul : on passe à la case suivante. Au dernier champ, STOP si la
 * copie est recevable ; sinon retour à la première case encore à remplir, et
 * le clavier se ferme si tout est rempli mais le STOP encore verrouillé (le
 * compte à rebours du bouton redevient visible).
 */
export function pbcEnterAction(
  index: number,
  valid: readonly boolean[],
  canStop: boolean
): PbcEnterAction {
  if (index < valid.length - 1) return { type: 'focus', index: index + 1 }
  if (canStop) return { type: 'stop' }
  const missing = valid.findIndex((ok) => !ok)
  if (missing === -1) return { type: 'blur' }
  return missing === index ? { type: 'stay' } : { type: 'focus', index: missing }
}

/**
 * Sous ce seuil, l'écart entre la scène et la fenêtre visible n'est pas un
 * clavier : barres du navigateur qui se replient, arrondis de zoom.
 */
export const PBC_KEYBOARD_MIN_PX = 80

export type PbcViewportMetrics = {
  /** Haut de la scène de jeu (`getBoundingClientRect().top`, fenêtre de mise en page). */
  stageTop: number
  /** Bas de la scène : `fixed; bottom: 0`, donc le bas de la fenêtre de mise en page. */
  stageBottom: number
  /** `visualViewport.offsetTop` : défilement de la fenêtre visible dans la mise en page. */
  viewportTop: number
  /** `visualViewport.height`. */
  viewportHeight: number
  /** `visualViewport.scale` (zoom au pincement). */
  scale: number
}

export type PbcKeyboardInset = {
  /** Hauteur à remonter pour qu'une barre `fixed; bottom: 0` sorte de sous le clavier. */
  bottom: number
  /** Décalage `top` de l'en-tête collant quand la fenêtre visible a glissé vers le bas. */
  top: number
}

export const PBC_NO_KEYBOARD: PbcKeyboardInset = { bottom: 0, top: 0 }

/**
 * Place mangée par le clavier virtuel. Safari iOS et Chrome Android ne
 * rétrécissent que la fenêtre VISIBLE : une barre `fixed; bottom: 0` reste
 * sous le clavier, et la page glisse vers le haut pour montrer le champ,
 * emportant l'en-tête collant. Dans la coque Android (adjustResize), la scène
 * rétrécit avec la fenêtre : l'écart est nul et rien ne bouge. Zoom au
 * pincement : on ne touche à rien, le joueur regarde ailleurs.
 */
export function pbcKeyboardInset(m: PbcViewportMetrics): PbcKeyboardInset {
  if (m.scale > 1.01) return PBC_NO_KEYBOARD
  const bottom = Math.round(m.stageBottom - (m.viewportTop + m.viewportHeight))
  if (bottom < PBC_KEYBOARD_MIN_PX) return PBC_NO_KEYBOARD
  return { bottom, top: Math.max(0, Math.round(m.viewportTop - m.stageTop)) }
}
