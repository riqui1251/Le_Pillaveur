'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { membersToPlayers } from '@/lib/online-players'
import { parseOnlineGameState } from '@/lib/online-game-state'
import type { OnlineGameSync } from '@/lib/online-sync-types'
import type { Player } from '@/lib/players'

type Options<T> = {
  gameId: string
  isGameReady?: (state: T | null) => boolean
}

/** Hook page : lobby + construction de onlineSync pour un jeu */
export function useOnlineGameSync<T extends { gameStarted: boolean }>({
  gameId,
  isGameReady = (s) => Boolean(s?.gameStarted),
}: Options<T>) {
  const router = useRouter()
  const { user } = useAuth()
  const { room, pushGameState, voteRematch, leaveRoom } = useOnlineRoom()

  const inRoom = room?.gameId === gameId
  const isHost = room?.hostUserId === user?.id

  const onlinePlayers = useMemo(
    () => (inRoom && room ? membersToPlayers(room.members) : []),
    [inRoom, room]
  )

  const remoteState = useMemo(
    () => (inRoom ? parseOnlineGameState<T>(gameId, room?.gameStateJson) : null),
    [inRoom, gameId, room?.gameStateJson, room?.stateVersion]
  )

  const isPlayingOnline =
    Boolean(user) && inRoom && room?.status === 'playing' && isGameReady(remoteState)

  const canInteract = Boolean(user?.id && room?.currentTurnUserId === user.id)

  const handlePushState = useCallback(
    async (stateJson: string) => {
      if (!room) return false
      return pushGameState(stateJson, room.stateVersion)
    },
    [room, pushGameState]
  )

  const handleLeaveToMenu = useCallback(async () => {
    await leaveRoom()
    router.push('/jeux')
  }, [leaveRoom, router])

  const onlineSync: OnlineGameSync<T> | undefined =
    isPlayingOnline && room && user
      ? {
          roomId: room.id,
          myUserId: user.id,
          memberUserIds: room.members.map((m) => m.userId),
          canInteract,
          stateVersion: room.stateVersion,
          remoteState,
          pushState: handlePushState,
          voteRematch,
          leaveToMenu: handleLeaveToMenu,
          rematchVotes: (remoteState as { rematchVotes?: string[] } | null)?.rematchVotes ?? [],
          activePlayerName: room.members.find((m) => m.userId === room.currentTurnUserId)?.displayName,
        }
      : undefined

  return {
    room,
    user,
    isHost,
    inRoom,
    isPlayingOnline,
    onlinePlayers: onlinePlayers as Player[],
    onlineSync,
    remoteState,
    canInteract,
    handleLeaveToMenu,
  }
}
