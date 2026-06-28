/** Paramètres du lobby (choisis par l'hôte avant le lancement) */

export type RoomSettings = {

  difficulty?: 'facile' | 'normal' | 'difficile' | 'extreme'

  plinkoDifficulty?: 'easy' | 'medium' | 'hard'

  hiLoMode?: 'standard' | 'traversee'

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

export type PurpleSyncedState = {
  version: number
  memberUserIds: string[]
  gameStarted: boolean
  currentPlayer: number
  drinkCounter: number
  deck: SerializedCard[]
  gameResults: Record<string, number>
  drawnCards: SerializedCard[]
  lastBet: string | null
  isCorrect: boolean | null
  isRevealing: boolean
  canContinue: boolean
  showResult: boolean
  amountToDrink: number
  cardHistory: SerializedCard[]
  totalCardsDrawn: number
  rematchVotes?: string[]
  gameEnded?: boolean
  pushedByUserId?: string
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

export type Serialized1220Config = {
  playerId: string
  name: string
  parity: 'pair' | 'impair'
  band: '2-10' | '11-20' | '21-30'
  drinkNumber: number
  giveNumber: number
}

export type Serialized1220History = {
  d12: number
  d20: number
  results: { playerId: string; name: string; text: string[] }[]
}

export type Game1220SyncedState = {
  version: number
  memberUserIds: string[]
  gameStarted: boolean
  currentPlayer: number
  phase: 'setup' | 'play'
  draft: Record<string, { parity: 'pair' | 'impair'; band: '2-10' | '11-20' | '21-30'; drinkNumber: number; giveNumber: number }>
  setupReady: string[]
  configs: Serialized1220Config[] | null
  d12: number
  d20: number
  rolling: boolean
  history: Serialized1220History[]
  rematchVotes?: string[]
  pushedByUserId?: string
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



// ─── Parseur & fin de partie génériques ──────────────────────────────────────

export type AnyOnlineGameState =
  | PetitBuveurSyncedState
  | PurpleSyncedState
  | Game1220SyncedState
  | HiLoSyncedState
  | Monsieur3SyncedState
  | PmuSyncedState
  | PlinkoSyncedState

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
    default:
      return null
  }
}

export function isOnlineGameFinished(gameId: string, state: AnyOnlineGameState): boolean {
  switch (gameId) {
    case 'petit-buveur':
      return Boolean((state as PetitBuveurSyncedState).winner)
    case 'purple':
      return Boolean((state as PurpleSyncedState).gameEnded)
    case '1220':
      return false
    case 'hi-lo':
      return Boolean((state as HiLoSyncedState).gameOver)
    case 'monsieur-3':
      return (state as Monsieur3SyncedState).gamePhase === 'end' || (state as Monsieur3SyncedState).victoryScreen
    case 'pmu':
      return (state as PmuSyncedState).phase === 'results'
    case 'plinko':
      return Boolean((state as PlinkoSyncedState).gameOver)
    default:
      return false
  }
}


