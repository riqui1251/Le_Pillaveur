/**
 * Formats d'affichage poussés par un jeu LOCAL vers une TV (cast). Contiennent
 * UNIQUEMENT des données publiques d'affichage — aucun secret. `castKind`
 * discrimine le rendu côté TV.
 */

export type PlinkoCastState = {
  castKind: 'plinko'
  phase: 'ready' | 'dropping' | 'result' | 'finished'
  currentPlayerName: string | null
  /** Valeurs (gorgées) des 10 cases du bas. */
  slots: number[]
  /** Résultat du dernier lancer (cases d'arrivée + gorgées). */
  lastDrop: {
    playerName: string
    redSlot: number | null
    greenSlot: number | null
    redSips: number
    greenSips: number
  } | null
  scoreboard: { name: string; totalRed: number; totalGreen: number }[]
  roundDrinks: number
}

export type CastState = PlinkoCastState
