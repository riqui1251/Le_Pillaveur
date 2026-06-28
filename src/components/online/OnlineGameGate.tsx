"use client"

import type { ReactNode } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { membersToPlayers } from '@/lib/online-players'
import type { Player } from '@/lib/players'
import { GameOnlineLobby } from './GameOnlineLobby'

interface OnlineGameGateProps {
  gameId: string
  children: (players: Player[]) => ReactNode
}

/**
 * En mode en ligne : affiche le lobby jusqu'au lancement, puis passe les joueurs connectés.
 * En mode local : rend null (la page gère le flux local elle-même).
 */
export function OnlineGameGate({ gameId, children }: OnlineGameGateProps) {
  const { user } = useAuth()
  const { room } = useOnlineRoom()

  if (user?.playMode !== 'online') return null

  const isPlaying = room?.status === 'playing' && room.gameId === gameId

  if (!isPlaying) {
    return <GameOnlineLobby gameId={gameId} />
  }

  return <>{children(membersToPlayers(room.members))}</>
}

export function useIsOnlineMode(): boolean {
  const { user } = useAuth()
  return user?.playMode === 'online'
}
