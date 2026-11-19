export type EspionPanelMode = 'question' | 'accusation' | 'ask' | 'accuse' | 'guess' | 'speak' | 'idle'

export interface EspionPanelState {
  isSpy: boolean
  hasBot: boolean
  questionForMe: boolean
  accusation: boolean
  askable: boolean
  askOpen: boolean
  myHand: boolean
  askDismissed: boolean
  showAccuseGrid: boolean
  showGuessGrid: boolean
  speakMode: boolean
}

/**
 * Volet d'action affiché, par priorité. Pendant une accusation, l'espion garde
 * sa grille des lieux : le moteur accepte sa devinette jusqu'au bout, et un
 * espion démasqué doit pouvoir tenter sa chance avant que la fenêtre se ferme.
 */
export function espionPanelMode(s: EspionPanelState): EspionPanelMode {
  if (s.questionForMe) return 'question'
  if (s.accusation) return s.isSpy && s.showGuessGrid ? 'guess' : 'accusation'
  if (s.askable && (s.askOpen || (s.myHand && !s.askDismissed))) return 'ask'
  if (s.showAccuseGrid) return 'accuse'
  if (s.showGuessGrid && s.isSpy) return 'guess'
  if (s.speakMode && s.hasBot) return 'speak'
  return 'idle'
}

/** Le bouton « Je devine le lieu » est-il offert dans ce volet ? */
export function espionOffersGuess(mode: EspionPanelMode, isSpy: boolean): boolean {
  return isSpy && (mode === 'idle' || mode === 'accusation')
}
