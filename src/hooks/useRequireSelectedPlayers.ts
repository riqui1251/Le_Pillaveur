"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/navigation"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"

type Options = {
  /** Ne redirige pas vers /joueurs quand le mode en ligne est actif. */
  skipWhenOnline?: boolean
}

/** Redirige vers /joueurs si aucun joueur n'est sélectionné (mode local uniquement). */
export function useRequireSelectedPlayers(redirectTo = "/joueurs", options?: Options) {
  const router = useRouter()
  const { user } = useAuth()
  const { selectedIds } = useSelectedPlayers()
  const isOnline = options?.skipWhenOnline && user?.playMode === "online"
  const ready = isOnline || selectedIds.length > 0

  useEffect(() => {
    if (isOnline) return
    if (!ready) {
      router.replace(redirectTo)
    }
  }, [isOnline, ready, router, redirectTo])

  return { ready, selectedIds, isOnline }
}
