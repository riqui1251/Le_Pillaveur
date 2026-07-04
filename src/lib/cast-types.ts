import type { SpecialPinType } from '@/lib/plinko-pins'

/**
 * Formats d'affichage poussés par un jeu LOCAL vers une TV (cast). Contiennent
 * UNIQUEMENT des données publiques d'affichage — aucun secret. `castKind`
 * discrimine le rendu côté TV.
 */

export type PlinkoCastState = {
  castKind: 'plinko'
  phase: 'ready' | 'dropping' | 'result' | 'finished'
  currentPlayerName: string | null
  /** Plateau courant (positions en %, comme sur mobile) — poussé au début de chaque tour. */
  board: {
    normalPins: { x: number; y: number }[]
    specialPins: { x: number; y: number; type: SpecialPinType }[]
    slots: number[]
  }
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

/**
 * Trame LÉGÈRE des positions de billes pendant un lancer — diffusée ~12/s par un
 * canal ÉPHÉMÈRE (bus mémoire, sans écriture DB) pour animer la chute sur la TV.
 */
export type PlinkoCastFrame = {
  balls: { x: number; y: number; color: 'red' | 'green' }[]
}

export type CastState = PlinkoCastState
