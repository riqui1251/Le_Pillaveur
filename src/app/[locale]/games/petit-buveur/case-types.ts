import type { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import type { Case } from './case-config'

export interface GamePlayer extends Omit<BasePlayer, 'stats' | 'createdAt'> {
  position: number
  drinks: number
  protected: boolean
  /** Nombre de tours de joueur restants avant expiration (tour de table complet) */
  protectionTurnsLeft?: number
  cursed: number
  linkedTo?: string
  linkedTurns: number
  skipNextTurn?: boolean
  anchored?: boolean
  mirrorDrinkTargetId?: string
  mirrorDrinkTurns?: number
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
