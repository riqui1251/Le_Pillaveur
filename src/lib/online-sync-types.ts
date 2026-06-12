/** Contrat partagé entre page.tsx et composants Game pour le multijoueur en ligne */

export type OnlineGameSync<TState = unknown> = {
  roomId: string
  myUserId: string
  memberUserIds: string[]
  canInteract: boolean
  stateVersion: number
  remoteState: TState | null
  pushState: (gameStateJson: string) => Promise<boolean>
  voteRematch?: () => Promise<unknown>
  leaveToMenu?: () => Promise<void>
  rematchVotes?: string[]
  activePlayerName?: string
}

export type BaseOnlineSyncedState = {
  version: number
  memberUserIds: string[]
  gameStarted: boolean
  currentPlayer: number
  rematchVotes?: string[]
  pushedByUserId?: string
}

export type { PurpleSyncedState, Game1220SyncedState, HiLoSyncedState, Monsieur3SyncedState, PmuSyncedState, PlinkoSyncedState } from '@/lib/online-game-state'
