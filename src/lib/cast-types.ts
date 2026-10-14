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

/**
 * Petit Buveur LOCAL : plateau 30 cases + pions. Tour par tour → pas de trame
 * (les positions changent au lancer, capturées par le payload principal).
 * Rendu par `TvPetitBuveur`, comme la partie en ligne.
 *
 * `dice` et `reveal` remplacent, pour le jeu local, le couple
 * `version`/`lastDice`/`lastCase` de l'état en ligne : la TV rejoue le dé à
 * chaque nouveau `dice.seq` et la carte de case à chaque nouveau `reveal.seq`
 * (après la fin du dé s'il est encore à l'écran). Les `seq` ne doivent jamais
 * revenir en arrière pendant une diffusion, sinon la TV ne rejoue rien.
 */
export type PetitBuveurCastState = {
  castKind: 'petit-buveur'
  players: { id: string; name: string; position: number; drinks: number }[]
  currentPlayer: number
  phase: 'playing' | 'finished'
  winner: string | null
  /** Dernier lancer (valeur 1..6). Absent tant que personne n'a lancé. */
  dice?: { value: number; seq: number } | null
  /** Dernière case révélée (`CaseType` du jeu). Absent tant qu'aucune case n'est tombée. */
  reveal?: { caseType: string; seq: number } | null
  /** Ambiance de la table qui diffuse : en Soft, la TV n'affiche aucune bière. */
  ambiance?: 'alcool' | 'soft'
}

export type CastState = PlinkoCastState | PmuCastState | PetitBuveurCastState
export type CastFrame = PlinkoCastFrame | PmuCastFrame
