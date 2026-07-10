"use client"

import { OnlineRoomContext, useOnlineRoomState } from '@/hooks/useOnlineRoom'

/**
 * Source de vérité UNIQUE du salon en ligne : un seul polling, un seul flux
 * SSE, un seul état — partagés par le lobby, les 13 jeux, le VoiceDock et la
 * page /jeux via useOnlineRoom(). Monté globalement (sous AuthProvider) ;
 * inactif tant que l'utilisateur n'est pas en mode online.
 */
export function OnlineRoomProvider({ children }: { children: React.ReactNode }) {
  const state = useOnlineRoomState()
  return <OnlineRoomContext.Provider value={state}>{children}</OnlineRoomContext.Provider>
}
