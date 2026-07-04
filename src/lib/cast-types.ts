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

/** Course PMU : 4 chevaux courent jusqu'à `finish`. */
export type PmuCastState = {
  castKind: 'pmu'
  phase: 'waiting' | 'racing' | 'finished'
  finish: number
  horses: {
    key: string
    name: string
    emoji: string
    colorFrom: string
    colorTo: string
    /** Noms des parieurs sur ce cheval. */
    players: string[]
    /** Position 0..finish (instantané ; positions live via les trames pendant la course). */
    position: number
  }[]
  winnerKey: string | null
}

/** Positions live des chevaux pendant la course (canal éphémère, ~12/s). */
export type PmuCastFrame = {
  positions: Record<string, number>
}

export type CastState = PlinkoCastState | PmuCastState
export type CastFrame = PlinkoCastFrame | PmuCastFrame
