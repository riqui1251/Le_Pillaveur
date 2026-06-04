import type { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import type { Case } from './case-config'

export interface GamePlayer extends Omit<BasePlayer, 'stats' | 'createdAt'> {
  position: number
  drinks: number
  protected: boolean
  /** Tour de table (turnCount) à partir duquel la protection expire */
  protectedUntilTurn?: number
  cursed: number
  linkedTo?: string
  linkedTurns: number
  skipNextTurn?: boolean
  anchored?: boolean
  mirrorDrinkTargetId?: string
  mirrorDrinkTurns?: number
  jokerCase?: Case | null
  stats?: {
    gamesPlayed: number
    wins: number
    totalDrinks: number
    favoriteGame?: string
    lastPlayed?: number
  }
  createdAt?: number
  color?: string
  preferences: PlayerPreferences
  id: string
}
