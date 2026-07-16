/** Paramètres du lobby (choisis par l'hôte avant le lancement) */

export type RoomSettings = {

  difficulty?: 'facile' | 'normal' | 'difficile' | 'extreme'

  /** Langue de la salle (contenu localisé serveur — ex. mots de l'Imposteur). */
  lang?: 'fr' | 'en' | 'es' | 'it'

  /** Quiz : nombre de questions de la partie (10/15/20). */
  quizCount?: number

  /** Loup-Garou : durée du débat en minutes (1-5). */
  lgDebateMin?: number

  /** Loup-Garou : loup supplémentaire sur les petites tables (appliqué à 5 joueurs). */
  lgExtraWolf?: boolean

  /** Nombre de bots ajoutés par l'hôte (0 = aucun ; permet de lancer sous le minimum d'humains). */
  botsCount?: number

  plinkoDifficulty?: 'easy' | 'medium' | 'hard'

  hiLoMode?: 'standard' | 'traversee'

  /** Toucher-Coulé : format des équipes. */
  tcMode?: '1v1' | '2v2' | '3v3'

  /** Toucher-Coulé : choix d'équipe par membre (userId → équipe). */
  tcTeams?: Record<string, 'A' | 'B'>

  /** Toucher-Coulé : power-up "Bombe" (tir 2×2, un usage par joueur). */
  tcPowerups?: boolean

  /** L'Imposteur : nombre d'imposteurs choisi par l'hôte (défaut : dérivé du nombre de joueurs). */
  imposteurCount?: number

  /** Sans Filtre : nombre de manches de la partie (5/8/12). */
  sfRounds?: number

  /** Mots Codés : choix d'équipe par membre (A = Or, B = Rouge). */
  mcTeams?: Record<string, 'A' | 'B'>

  /** Le Menteur : variante Palifico (1 dé → les 1 perdent leur statut de joker, face verrouillée). */
  menteurPalifico?: boolean

  /** Le Menteur : variante Calza (parier « pile la quantité » pour regagner un dé). */
  menteurCalza?: boolean

  /** Le Grand Bluff : nombre de manches choisi par l'hôte (6/8/10). */
  bluffRounds?: number

  /** Qui est l'Espion ? : durée de discussion en minutes choisie par l'hôte (3/5/7). */
  espionDiscussionMin?: number

  /** Qui est l'Espion ? : nombre de manches à gagner choisi par l'hôte (3/5/7). */
  espionRoundsToWin?: number

  /** Tabou Vocal : choix d'équipe par membre (userId → équipe). */
  tabouTeams?: Record<string, 'A' | 'B'>

  /** Tabou Vocal : score cible choisi par l'hôte (15/20/25). */
  tabouTargetScore?: number

  /** Crobard : nombre de manches choisi par l'hôte (6/8/10). */
  crobardRounds?: number

}



export type SyncedWheelSegment = {

  id: string

  label: string

  value: number

}



/** Paramètres d'une rotation de roue — rejouée à l'identique chez tous les clients */

export type SyncedWheelSpinPlan = {

  nonce: number

  segmentIndex: number

  duration: number

  targetAngle: number

  overshootAngle: number

  accelAngle: number

}



export type SyncedCase = {

  type: string

  description: string

  effect: number

}



/** UI partagée — tous les joueurs voient la même chose */

export type SyncedViewState = {

  diceResult: number | null

  diceValue: number | null

  animatedDiceValue: number | null

  animatingPlayerId: string | null

  currentCase: SyncedCase | null

  pendingCase: SyncedCase | null

  pendingPosition: number | null

  pendingDuelNote: string | null

  showNotification: boolean

  showNextButton: boolean

  showTargetDialog: boolean

  showWheel: boolean

  wheelMode: 'drinks' | 'defis'

  wheelSegments: SyncedWheelSegment[]

  wheelSpinning: boolean

  wheelSpinPlan: SyncedWheelSpinPlan | null

  wheelResult: SyncedWheelSegment | null

  showDuelDialog: boolean

  duelPhase: 'pick' | 'wheel'

  duelBoardPosition: number | null

  duelOpponentId: string | null

  duelWheelSegments: SyncedWheelSegment[]

  duelWheelSpinning: boolean

  duelWheelSpinPlan: SyncedWheelSpinPlan | null

  duelWheelResult: SyncedWheelSegment | null

  showChanceDialog: boolean

  showExchangeDialog: boolean

  showChainDialog: boolean

  showTeleportDialog: boolean

  showVoteDialog: boolean

  showDeHonteDialog: boolean

  deHonteResult: number | null

  deHonteRolling: boolean

  deHonteDisplayValue: number

  showPileFaceDialog: boolean

  pileFaceTargetId: string | null

  showVictoryScreen: boolean

  isProcessingTurn: boolean

  isDiceRolling: boolean

}



export function emptySyncedView(): SyncedViewState {

  return {

    diceResult: null,

    diceValue: null,

    animatedDiceValue: null,

    animatingPlayerId: null,

    currentCase: null,

    pendingCase: null,

    pendingPosition: null,

    pendingDuelNote: null,

    showNotification: false,

    showNextButton: false,

    showTargetDialog: false,

    showWheel: false,

    wheelMode: 'drinks',

    wheelSegments: [],

    wheelSpinning: false,

    wheelSpinPlan: null,

    wheelResult: null,

    showDuelDialog: false,

    duelPhase: 'pick',

    duelBoardPosition: null,

    duelOpponentId: null,

    duelWheelSegments: [],

    duelWheelSpinning: false,

    duelWheelSpinPlan: null,

    duelWheelResult: null,

    showChanceDialog: false,

    showExchangeDialog: false,

    showChainDialog: false,

    showTeleportDialog: false,

    showVoteDialog: false,

    showDeHonteDialog: false,

    deHonteResult: null,

    deHonteRolling: false,

    deHonteDisplayValue: 1,

    showPileFaceDialog: false,

    pileFaceTargetId: null,

    showVictoryScreen: false,

    isProcessingTurn: false,

    isDiceRolling: false,

  }

}



/** État synchronisé — Petit Buveur */

export type PetitBuveurSyncedState = {

  version: number

  memberUserIds: string[]

  players: unknown[]

  currentPlayer: number

  turnCount: number

  gameDifficulty: string

  lastCase: unknown | null

  gameStarted: boolean

  winner: unknown | null

  /** userIds ayant voté « Rejouer » en fin de partie */
  rematchVotes?: string[]

  view: SyncedViewState

}



export function parseRoomSettings(json: string | null | undefined): RoomSettings {

  if (!json) return { difficulty: 'normal' }

  try {

    const p = JSON.parse(json) as RoomSettings

    return { difficulty: p.difficulty ?? 'normal', ...p }

  } catch {

    return { difficulty: 'normal' }

  }

}



export function parsePetitBuveurState(json: string | null | undefined): PetitBuveurSyncedState | null {

  if (!json) return null

  try {

    const raw = JSON.parse(json) as PetitBuveurSyncedState

    return {

      ...raw,

      view: raw.view ?? emptySyncedView(),

      rematchVotes: raw.rematchVotes ?? [],

    }

  } catch {

    return null

  }

}



// ─── Types partagés cartes ───────────────────────────────────────────────────

export type SerializedCard = {
  value: string
  suit: string
  color: 'red' | 'black'
}



// ─── Purple ──────────────────────────────────────────────────────────────────
// ⚠️ Fichier CLIENT (useOnlineRoom) : forme jumelle (pas d'import) de
// `src/lib/purple/engine.ts`, seule source de vérité côté serveur.

export type PurplePlayer = { id: string; name: string; isBot: boolean; leftAt: number | null }

export type PurpleSyncedState = {
  version: number
  players: PurplePlayer[]
  currentPlayer: number
  phase: 'playing' | 'finished'
  drinkCounter: number
  deck: SerializedCard[]
  gameResults: Record<string, number>
  drawnCards: SerializedCard[]
  lastBet: string | null
  isCorrect: boolean | null
  canContinue: boolean
  pendingReveal: boolean
  amountToDrink: number
  cardHistory: SerializedCard[]
  totalCardsDrawn: number
  rematchVotes?: string[]
}

export function parsePurpleState(json: string | null | undefined): PurpleSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as PurpleSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}



// ─── 1220 ────────────────────────────────────────────────────────────────────
// ⚠️ Fichier CLIENT (useOnlineRoom) : forme jumelle (pas d'import) de
// `src/lib/1220/engine.ts`, seule source de vérité côté serveur.

export type Serialized1220Choices = {
  parity: 'pair' | 'impair'
  band: '2-10' | '11-20' | '21-30'
  drinkNumber: number
  giveNumber: number
}

export type Serialized1220Config = Serialized1220Choices & { playerId: string; name: string }

export type Serialized1220RollResult = {
  playerId: string
  name: string
  drinkSips: number
  giveEffective: number
  /** Identifiants structurels ('band' | 'parity' | 'giveNum') — texte traduit côté client. */
  giveReasons: string[]
  partialHit: boolean
  partialNumbers: number[]
}

export type Serialized1220History = {
  d12: number
  d20: number
  results: Serialized1220RollResult[]
}

export type Game1220Player = { id: string; name: string; isBot: boolean; leftAt: number | null }

export type Game1220SyncedState = {
  version: number
  players: Game1220Player[]
  phase: 'setup' | 'play' | 'finished'
  draft: Record<string, Serialized1220Choices>
  setupReady: string[]
  configs: Serialized1220Config[] | null
  lastRoll: Serialized1220History | null
  history: Serialized1220History[]
  rematchVotes?: string[]
}

export function parse1220State(json: string | null | undefined): Game1220SyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Game1220SyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [], setupReady: raw.setupReady ?? [] }
  } catch {
    return null
  }
}



// ─── Hi-Lo ─────────────────────────────────────────────────────────────────

export type HiLoSyncedState = {
  version: number
  memberUserIds: string[]
  gameStarted: boolean
  currentPlayer: number
  gameMode: 'standard' | 'traversee'
  deck: SerializedCard[]
  currentCard: SerializedCard | null
  nextCard: SerializedCard | null
  drinkCounter: number
  gameOver: boolean
  showResult: boolean
  lastGuess: 'higher' | 'lower' | 'equal' | null
  isCorrect: boolean | null
  gameResults: Record<string, number>
  showGameOver: boolean
  showIncorrectDialog: boolean
  isFlipping: boolean
  isProcessing: boolean
  isUnguessedEqual: boolean
  activePlayerIds: string[]
  correctGuessesInRow: number
  targetGuesses: number
  rematchVotes?: string[]
  pushedByUserId?: string
}

export function parseHiLoState(json: string | null | undefined): HiLoSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as HiLoSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}



// ─── Monsieur 3 ──────────────────────────────────────────────────────────────

export type Monsieur3PlayerState = {
  id: string
  name: string
  isMonsieur3: boolean
  score: number
}

export type Monsieur3DiceRoll = { dice1: number; dice2: number }

export type Monsieur3SyncedState = {
  version: number
  memberUserIds: string[]
  gameStarted: boolean
  currentPlayer: number
  gamePhase: 'setup' | 'play' | 'end'
  players: Monsieur3PlayerState[]
  dice: Monsieur3DiceRoll
  rolling: boolean
  message: string
  rollHistory: { player: string; dice: Monsieur3DiceRoll; message: string }[]
  specialMessage: string | null
  canRoll: boolean
  setupRolls: { playerName: string; roll: number }[]
  monsieur3Found: boolean
  gameEnded: boolean
  monsieur3Index: number
  victoryScreen: boolean
  rematchVotes?: string[]
  pushedByUserId?: string
}

export function parseMonsieur3State(json: string | null | undefined): Monsieur3SyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Monsieur3SyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}



// ─── PMU ─────────────────────────────────────────────────────────────────────

export type PmuHorseState = {
  name: string
  emoji: string
  position: number
  colorFrom: string
  colorTo: string
  playerIds: string[]
}

export type PmuSyncedState = {
  version: number
  memberUserIds: string[]
  gameStarted: boolean
  currentPlayer: number
  phase: 'mode-select' | 'setup' | 'betting' | 'racing' | 'payout' | 'results'
  mode: 'libre' | 'paris'
  horses: PmuHorseState[]
  bets: Record<string, number>
  payoutTargets: Record<string, string>
  distSips: number
  winnerIndex: number | null
  raceSeed: number | null
  rematchVotes?: string[]
  pushedByUserId?: string
}

export function parsePmuState(json: string | null | undefined): PmuSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as PmuSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}



// ─── Plinko ──────────────────────────────────────────────────────────────────

export type PlinkoPinState = { x: number; y: number; row: number; type?: string; value?: number }

export type PlinkoTurnResult = {
  redSips: number
  greenSips: number
  extraSips: number | null
}

export type PlinkoSyncedState = {
  version: number
  memberUserIds: string[]
  gameStarted: boolean
  currentPlayer: number
  difficulty: 'easy' | 'medium' | 'hard'
  isCumulativeMode: boolean
  pinPositions: PlinkoPinState[]
  slotSipValues: number[]
  specialPins: PlinkoPinState[]
  currentPlayerIndex: number
  isAnimating: boolean
  turnResult: PlinkoTurnResult | null
  playerResults: Record<string, { drinks: number; given: number }>
  roundDrinksCount: number
  gameOver: boolean
  resultDisplayPhase: 'tournees' | 'details' | 'final' | null
  boardSeed: number | null
  rematchVotes?: string[]
  pushedByUserId?: string
}

export function parsePlinkoState(json: string | null | undefined): PlinkoSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as PlinkoSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [], playerResults: raw.playerResults ?? {} }
  } catch {
    return null
  }
}



// ─── Toucher-Coulé ───────────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/toucher-coule). */
export type ToucherCouleSyncedState = {
  version: number
  phase: 'placement' | 'battle' | 'finished'
  winner: 'A' | 'B' | null
  rematchVotes?: string[]
}

export function parseToucherCouleState(json: string | null | undefined): ToucherCouleSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as ToucherCouleSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Le Menteur ──────────────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/menteur). */
export type MenteurSyncedState = {
  version: number
  phase: 'bidding' | 'reveal' | 'finished'
  winnerId: string | null
  rematchVotes?: string[]
}

export function parseMenteurSyncedState(json: string | null | undefined): MenteurSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as MenteurSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── L'Imposteur ─────────────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/imposteur). */
export type ImposteurSyncedState = {
  version: number
  phase: 'countdown' | 'clue' | 'vote' | 'reveal' | 'finished'
  winnerTeam: 'civil' | 'imposteur' | null
  rematchVotes?: string[]
}

export function parseImposteurSyncedState(
  json: string | null | undefined
): ImposteurSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as ImposteurSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Le Grand Pillaveur (quiz) ───────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/quiz). */
export type QuizSyncedState = {
  version: number
  phase: 'countdown' | 'question' | 'reveal' | 'finished'
  rematchVotes?: string[]
}

export function parseQuizSyncedState(json: string | null | undefined): QuizSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as QuizSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Loup-Garou ──────────────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/loup-garou). */
export type LoupGarouSyncedState = {
  version: number
  phase: string
  winnerTeam: 'village' | 'loups' | null
  rematchVotes?: string[]
}

export function parseLoupGarouSyncedState(
  json: string | null | undefined
): LoupGarouSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as LoupGarouSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Le Grand Bluff ──────────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/bluff). */
export type BluffSyncedState = {
  version: number
  phase: 'countdown' | 'submit' | 'vote' | 'reveal' | 'finished'
  winnerId: string | null
  rematchVotes?: string[]
}

export function parseBluffSyncedState(json: string | null | undefined): BluffSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as BluffSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Qui est l'Espion ? ──────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/espion). */
export type EspionSyncedState = {
  version: number
  phase: 'countdown' | 'discussion' | 'reveal' | 'finished'
  winnerTeam: 'spy' | 'crew' | null
  rematchVotes?: string[]
}

export function parseEspionSyncedState(json: string | null | undefined): EspionSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as EspionSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Tabou Vocal ─────────────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/tabou). */
export type TabouSyncedState = {
  version: number
  phase: 'countdown' | 'describing' | 'roundEnd' | 'finished'
  winnerTeam: 'A' | 'B' | null
  rematchVotes?: string[]
}

export function parseTabouSyncedState(json: string | null | undefined): TabouSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as TabouSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Crobard ─────────────────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/crobard). */
export type CrobardSyncedState = {
  version: number
  phase: 'countdown' | 'choosing' | 'drawing' | 'roundEnd' | 'finished'
  winnerId: string | null
  rematchVotes?: string[]
}

export function parseCrobardSyncedState(json: string | null | undefined): CrobardSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as CrobardSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Téléphone Dessiné ───────────────────────────────────────────────────────

/** État minimal côté parsing générique (l'état complet vit dans lib/telephone-dessine). */
export type TelephoneSyncedState = {
  version: number
  phase: 'countdown' | 'contributing' | 'reveal' | 'finished'
  rematchVotes?: string[]
}

export function parseTelephoneSyncedState(json: string | null | undefined): TelephoneSyncedState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as TelephoneSyncedState
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

// ─── Parseur & fin de partie génériques ──────────────────────────────────────

export type AnyOnlineGameState =
  | PetitBuveurSyncedState
  | PurpleSyncedState
  | Game1220SyncedState
  | HiLoSyncedState
  | Monsieur3SyncedState
  | PmuSyncedState
  | PlinkoSyncedState
  | ToucherCouleSyncedState
  | MenteurSyncedState
  | ImposteurSyncedState
  | QuizSyncedState
  | LoupGarouSyncedState
  | BluffSyncedState
  | EspionSyncedState
  | TabouSyncedState
  | CrobardSyncedState
  | TelephoneSyncedState

export function parseOnlineGameState<T = AnyOnlineGameState>(
  gameId: string,
  json: string | null | undefined
): T | null {
  switch (gameId) {
    case 'petit-buveur':
      return parsePetitBuveurState(json) as T | null
    case 'purple':
      return parsePurpleState(json) as T | null
    case '1220':
      return parse1220State(json) as T | null
    case 'hi-lo':
      return parseHiLoState(json) as T | null
    case 'monsieur-3':
      return parseMonsieur3State(json) as T | null
    case 'pmu':
      return parsePmuState(json) as T | null
    case 'plinko':
      return parsePlinkoState(json) as T | null
    case 'toucher-coule':
      return parseToucherCouleState(json) as T | null
    case 'menteur':
      return parseMenteurSyncedState(json) as T | null
    case 'imposteur':
      return parseImposteurSyncedState(json) as T | null
    case 'quiz':
      return parseQuizSyncedState(json) as T | null
    case 'loup-garou':
      return parseLoupGarouSyncedState(json) as T | null
    case 'bluff':
      return parseBluffSyncedState(json) as T | null
    case 'espion':
      return parseEspionSyncedState(json) as T | null
    case 'tabou':
      return parseTabouSyncedState(json) as T | null
    case 'crobard':
      return parseCrobardSyncedState(json) as T | null
    case 'telephone-dessine':
      return parseTelephoneSyncedState(json) as T | null
    // ⚠️ Fichier importé côté CLIENT (useOnlineRoom) : ne PAS déléguer au
    // registre d'adaptateurs ici (il embarquerait les moteurs serveur dans
    // les bundles). Nouveau jeu → ajouter un mini-parseur minimal ci-dessus.
    default:
      return null
  }
}

export function isOnlineGameFinished(gameId: string, state: AnyOnlineGameState): boolean {
  switch (gameId) {
    case 'petit-buveur':
      return Boolean((state as PetitBuveurSyncedState).winner)
    case 'purple':
      return (state as PurpleSyncedState).phase === 'finished'
    case '1220':
      return (state as Game1220SyncedState).phase === 'finished'
    case 'hi-lo':
      return Boolean((state as HiLoSyncedState).gameOver)
    case 'monsieur-3':
      return (state as Monsieur3SyncedState).gamePhase === 'end' || (state as Monsieur3SyncedState).victoryScreen
    case 'pmu':
      return (state as PmuSyncedState).phase === 'results'
    case 'plinko':
      return Boolean((state as PlinkoSyncedState).gameOver)
    case 'toucher-coule':
      return Boolean((state as ToucherCouleSyncedState).winner)
    case 'menteur':
      return (state as MenteurSyncedState).phase === 'finished'
    case 'imposteur':
      return (state as ImposteurSyncedState).phase === 'finished'
    case 'quiz':
      return (state as QuizSyncedState).phase === 'finished'
    case 'loup-garou':
      return (state as LoupGarouSyncedState).phase === 'finished'
    case 'bluff':
      return (state as BluffSyncedState).phase === 'finished'
    case 'espion':
      return (state as EspionSyncedState).phase === 'finished'
    case 'tabou':
      return (state as TabouSyncedState).phase === 'finished'
    case 'crobard':
      return (state as CrobardSyncedState).phase === 'finished'
    case 'telephone-dessine':
      return (state as TelephoneSyncedState).phase === 'finished'
    default:
      return false
  }
}


