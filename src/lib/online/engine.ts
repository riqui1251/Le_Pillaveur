export type OnlineLobbyStatus = 'waiting' | 'active' | 'finished'
export type OnlineVisibility = 'public' | 'private'
export type OnlineDifficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

export interface OnlinePlayerState {
  id: string
  name: string
  isBot: boolean
  connected: boolean
  position: number
  drinks: number
}

export interface PendingChallenge {
  playerId: string
  text: string
  penaltyDrinks: number
}

export interface OnlineGameState {
  currentPlayerId: string
  turnNumber: number
  lastRollAt: number
  pendingChallenge: PendingChallenge | null
  players: OnlinePlayerState[]
  log: string[]
}

const SPAM_COOLDOWN_MS = 1200
const BOARD_SIZE = 24

export function createInitialGameState(players: OnlinePlayerState[]): OnlineGameState {
  return {
    currentPlayerId: players[0]?.id ?? '',
    turnNumber: 1,
    lastRollAt: 0,
    pendingChallenge: null,
    players,
    log: [],
  }
}

function nextPlayerId(players: OnlinePlayerState[], currentPlayerId: string): string {
  if (players.length === 0) return ''
  const idx = players.findIndex((p) => p.id === currentPlayerId)
  const start = idx >= 0 ? idx : 0
  for (let i = 1; i <= players.length; i += 1) {
    const p = players[(start + i) % players.length]
    if (p.connected || p.isBot) return p.id
  }
  return players[start].id
}

export function applyRoll(
  state: OnlineGameState,
  actorPlayerId: string,
  nowMs: number,
  diceValue: number,
  challengeText?: string
): OnlineGameState {
  if (state.currentPlayerId !== actorPlayerId) {
    throw new Error('NOT_YOUR_TURN')
  }
  if (state.pendingChallenge) {
    throw new Error('CHALLENGE_PENDING')
  }
  if (nowMs - state.lastRollAt < SPAM_COOLDOWN_MS) {
    throw new Error('SPAM_ROLL')
  }
  const safeDice = Math.max(1, Math.min(6, Math.floor(diceValue)))
  const players = state.players.map((p) =>
    p.id === actorPlayerId ? { ...p, position: (p.position + safeDice) % BOARD_SIZE } : p
  )
  const nextState: OnlineGameState = {
    ...state,
    players,
    lastRollAt: nowMs,
    log: [...state.log.slice(-24), `${actorPlayerId} a lance ${safeDice}`],
  }
  if (challengeText) {
    nextState.pendingChallenge = {
      playerId: actorPlayerId,
      text: challengeText,
      penaltyDrinks: 2,
    }
    return nextState
  }
  const nextId = nextPlayerId(players, actorPlayerId)
  return {
    ...nextState,
    currentPlayerId: nextId,
    turnNumber: state.turnNumber + (nextId === players[0]?.id ? 1 : 0),
  }
}

export function resolveChallenge(
  state: OnlineGameState,
  actorPlayerId: string,
  completed: boolean
): OnlineGameState {
  if (!state.pendingChallenge || state.pendingChallenge.playerId !== actorPlayerId) {
    throw new Error('NO_PENDING_CHALLENGE')
  }
  const players = state.players.map((p) => {
    if (p.id !== actorPlayerId) return p
    if (completed) return p
    return { ...p, drinks: p.drinks + state.pendingChallenge!.penaltyDrinks }
  })
  const nextId = nextPlayerId(players, actorPlayerId)
  return {
    ...state,
    players,
    pendingChallenge: null,
    currentPlayerId: nextId,
    turnNumber: state.turnNumber + (nextId === players[0]?.id ? 1 : 0),
    log: [
      ...state.log.slice(-24),
      completed ? `${actorPlayerId} a reussi le defi` : `${actorPlayerId} boit la penalite`,
    ],
  }
}

export function replaceDisconnectedByBot(state: OnlineGameState, playerId: string): OnlineGameState {
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, isBot: true, connected: true, name: `${p.name} (BOT)` } : p
  )
  return { ...state, players }
}
