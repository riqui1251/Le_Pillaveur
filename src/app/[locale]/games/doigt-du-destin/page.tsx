"use client"

import Game from './components/game'

/**
 * Outil instantané : l'arène se monte directement, sans pré-partie ni table de
 * joueurs — les doigts posés sur l'écran sont les joueurs. Pas d'écran de fin
 * (id listé dans LOCAL_GAMES_WITHOUT_END_SCREEN), pas de statistiques.
 */
export default function DoigtDuDestinPage() {
  return <Game />
}
