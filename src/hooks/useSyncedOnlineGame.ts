'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { OnlineGameSync } from '@/lib/online-sync-types'
import type { BaseOnlineSyncedState } from '@/lib/online-sync-types'

type SyncedState = BaseOnlineSyncedState & Record<string, unknown>

/** Moteur sync réutilisable pour les jeux tour par tour */
export function useSyncedOnlineGame<TState extends SyncedState>({
  onlineSync,
  applyRemoteState,
  buildState,
  isBlockingRemote,
}: {
  onlineSync?: OnlineGameSync<TState>
  applyRemoteState: (state: TState) => void
  buildState: (extra?: Partial<TState>) => TState | null
  isBlockingRemote?: () => boolean
}) {
  const lastVersionRef = useRef(0)
  const pushingRef = useRef(false)
  const isOnline = Boolean(onlineSync)
  const isMyTurn = onlineSync?.canInteract ?? true

  const pushState = useCallback(
    async (extra?: Partial<TState>) => {
      if (!onlineSync) return false
      const state = buildState(extra)
      if (!state) return false
      pushingRef.current = true
      try {
        const json = JSON.stringify({
          ...state,
          version: onlineSync.stateVersion + 1,
          pushedByUserId: onlineSync.myUserId,
        })
        const ok = await onlineSync.pushState(json)
        if (ok) lastVersionRef.current = onlineSync.stateVersion + 1
        return ok
      } finally {
        pushingRef.current = false
      }
    },
    [onlineSync, buildState]
  )

  useEffect(() => {
    if (!onlineSync?.remoteState?.gameStarted) return
    if (pushingRef.current) return
    if (onlineSync.stateVersion <= lastVersionRef.current) return
    if (isMyTurn && isBlockingRemote?.()) return

    applyRemoteState(onlineSync.remoteState)
    lastVersionRef.current = onlineSync.stateVersion
  }, [
    onlineSync?.stateVersion,
    onlineSync?.remoteState,
    isMyTurn,
    applyRemoteState,
    isBlockingRemote,
  ])

  return { isOnline, isMyTurn, pushState, pushingRef, lastVersionRef }
}
