"use client"

import { useMemo } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { membersToPlayers } from '@/lib/online-players'
import type { Player } from '@/lib/players'

/** Joueurs actifs selon le mode : roster local synchronisé ou membres de la salle en ligne. */
export function useActivePlayers() {
  const { user, loading: authLoading } = useAuth()
  const { players, loading: localLoading } = usePlayers()
  const { room, loading: roomLoading } = useOnlineRoom()

  const isOnline = user?.playMode === 'online'
  const loading = authLoading || (isOnline ? roomLoading : localLoading)

  const activePlayers: Player[] = useMemo(() => {
    if (isOnline && room) return membersToPlayers(room.members)
    return players
  }, [isOnline, room, players])

  return {
    players: activePlayers,
    loading,
    isOnline,
    room,
  }
}
