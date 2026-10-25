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
  scoreboard: {
    name: string
    totalRed: number
    totalGreen: number
    /** Tours joués (gorgées + pions spéciaux touchés), comme le détail de fin du téléphone. */
    turns?: { redSips: number; greenSips: number; powerups: SpecialPinType[] }[]
  }[]
  roundDrinks: number
  /** Index dans `scoreboard` du joueur au tour (les noms peuvent se répéter). */
  currentPlayerIndex?: number
  /** Mode cumulatif : nécessaire pour prévoir la valeur finale de chaque case. */
  cumulative?: boolean
  /** Effets touchés par chaque balle ce tour (bande « Boit | Donne » du téléphone) ; null au repos. */
  live?: PlinkoCastLive | null
  /** Case surlignée en or : celle de la DERNIÈRE balle bonus arrivée (ordre d'arrivée, pas de création). */
  extraSlot?: number | null
  /** Fin de partie : écran affiché par le téléphone, que la TV suit sans devancer les totaux. */
  results?: { phase: 'tournees' | 'details' | 'final'; playerIndex: number } | null
}

/** Miroir sérialisable de `LiveBalls` (src/app/[locale]/games/plinko/plinko-live.ts). */
export type PlinkoCastLiveBall = {
  id: string
  isMain: boolean
  category: 'red' | 'green'
  effects: {
    multiplierCount: number
    sipsToAdd: number
    sipsToSubtract: number
    effectsReset: boolean
    jackpotHit: boolean
    scoreSwap?: boolean
  }
  hits: { type: SpecialPinType; resolved?: SpecialPinType | null; doubled: boolean; inert?: boolean }[]
  landed: boolean
  slot: number | null
  finalSips: number | null
  landedBase: number | null
}

export type PlinkoCastLive = {
  red: PlinkoCastLiveBall
  green: PlinkoCastLiveBall
  extras: PlinkoCastLiveBall[]
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
    /** Mode paris : mise de chaque parieur, alignée sur `players`. */
    bets?: number[]
  }[]
  winnerKey: string | null
  mode?: 'libre' | 'paris'
  /** Écran du téléphone dans la phase : `waiting` = setup | betting, `finished` = payout | results. */
  stage?: 'setup' | 'betting' | 'payout' | 'results'
  /** Numéro de course : la TV ignore les trames d'une course précédente. */
  race?: number
  /** Mode libre : gorgées à distribuer, poussées quand le téléphone les affiche. */
  distSips?: number | null
  /** Mode paris : gains des parieurs gagnants ; `target` = cible choisie sur le téléphone (null tant qu'aucune). */
  payouts?: { name: string; sips: number; target: string | null }[]
  /** Mode paris, fin : aucun joueur ne peut recevoir de gorgées (tous sur le cheval gagnant). */
  noTargets?: boolean
}

/** Positions live des chevaux pendant la course (canal éphémère, ~12/s). */
export type PmuCastFrame = {
  positions: Record<string, number>
  race?: number
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
 *
 * Tout est poussé au moment où le téléphone l'affiche, jamais avant : la
 * valeur du dé quand il la montre, l'effet de la case quand sa fenêtre
 * s'ouvre (pas pendant le choix de cible ni le duel, qui la gardent cachée).
 * Les champs ajoutés après coup restent optionnels : une TV et un téléphone
 * de versions différentes continuent de se comprendre.
 */
export type PetitBuveurCastState = {
  castKind: 'petit-buveur'
  /** `icon` : celle du téléphone (emoji ou identifiant d'icône), sinon l'initiale. */
  players: { id: string; name: string; position: number; drinks: number; icon?: string }[]
  currentPlayer: number
  phase: 'playing' | 'finished'
  winner: string | null
  /**
   * Dernier lancer. `phase` 'rolling' tant que le dé roule sur le téléphone
   * (valeur 0 : pas encore lue), puis 'result' quand il montre la valeur (1..6).
   * Sans `phase` (ancien téléphone) : poussé au début du dé, valeur comprise.
   */
  dice?: { value: number; seq: number; phase?: 'rolling' | 'result' } | null
  /** Effet de la dernière case, une fois affiché par le téléphone. Absent tant qu'aucune case n'est tombée. */
  reveal?: PetitBuveurCastReveal | null
  /** Ambiance de la table qui diffuse : en Soft, la TV n'affiche aucune bière. */
  ambiance?: 'alcool' | 'soft'
  /** Tour de table affiché par le téléphone (« Tour N »). */
  turnCount?: number
  /** Difficulté de la partie (`Difficulty` du jeu), pour l'écran de fin. */
  difficulty?: string
  /** Liste « Effets en cours » du téléphone. */
  effects?: PetitBuveurCastEffect[]
  /** Fenêtre ouverte sur le téléphone avant l'effet de la case ; null sinon. */
  stage?: PetitBuveurCastStage | null
  /** Change quand le téléphone pose les pions sans les faire marcher (Rejouer, reprise). */
  snapKey?: number
}

export type PetitBuveurCastEffectKind = 'protection' | 'curse' | 'chain' | 'skip' | 'anchor' | 'mirror'

export type PetitBuveurCastEffect = {
  kind: PetitBuveurCastEffectKind
  playerId: string
  /** Partenaire d'une chaîne, cible d'un miroir. */
  partnerId?: string
  /** Tours restants, comme le téléphone les compte. */
  remaining: number
}

/** Gorgées bues et déplacement d'un joueur pendant l'effet de la case. */
export type PetitBuveurCastChange = { playerId: string; drinks: number; from: number; to: number }

/**
 * Effet de la case, poussé quand la fenêtre « Effet de la case » s'ouvre sur
 * le téléphone, mis à jour au verdict d'un défi (même `seq`), puis laissé tel
 * quel jusqu'au lancer suivant, comme l'« Action précédente » du téléphone.
 * Les textes sont ceux du téléphone, dans sa langue.
 */
export type PetitBuveurCastReveal = {
  /** `CaseType` du jeu. */
  caseType: string
  seq: number
  /** Texte de la case quand l'effet le reprend (défi, question). */
  detail?: string | null
  /** Le reste du texte de l'effet, paragraphe par paragraphe, sans le résumé des effets en cours. */
  lines?: string[]
  /** Case (1..30) où le lanceur est tombé ; null pour un tour passé. */
  caseNumber?: number | null
  /** Dé du lancer qui a mené à la case ; null pour un tour passé. */
  dice?: number | null
  targetId?: string | null
  changes?: PetitBuveurCastChange[]
  /** Défi ou question en cours : le téléphone attend le verdict (relevé ou bu). */
  verdictPending?: boolean
}

/**
 * Fenêtre ouverte sur le téléphone AVANT l'effet. `target` (« Qui cibler ? »)
 * et `duel` ne portent jamais la case tombée : le téléphone la garde cachée
 * jusqu'au choix. `result` : la ligne que le téléphone affiche une fois le
 * tirage arrêté (langue du téléphone), jamais pendant.
 */
export type PetitBuveurCastStage =
  | { kind: 'target' }
  | { kind: 'duel'; caseNumber: number; opponentId?: string | null; rolling?: boolean; result?: string | null }
  | {
      kind: 'case'
      /** `CaseType` du jeu. */
      caseType: string
      /** Valeur de la case (gorgées d'un vote, tours d'une chaîne). */
      effect?: number
      /** Joueur qui choisit pile ou face. */
      targetId?: string | null
      rolling?: boolean
      result?: string | null
      /** Dé de la honte : valeur tirée, une fois affichée. */
      die?: number | null
    }

export type CastState = PlinkoCastState | PmuCastState | PetitBuveurCastState
export type CastFrame = PlinkoCastFrame | PmuCastFrame

/**
 * Plafond du corps d'une écriture d'état de cast (création et mise à jour) :
 * l'état est écrit tel quel en base puis relu par chaque sondage public de la
 * TV. Quelques kilo-octets en pratique ; 256 Ko laissent une marge confortable
 * à l'état le plus bavard.
 */
export const MAX_CAST_BODY_BYTES = 256 * 1024

/**
 * Plafond d'une trame : quelques positions de billes ou de chevaux, une
 * centaine d'octets en pratique. 16 Ko tiennent des centaines de billes.
 */
export const MAX_CAST_FRAME_BYTES = 16 * 1024
