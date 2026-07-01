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
  const { user, loading } = useAuth()
  const isOnline = options?.skipWhenOnline && user?.playMode === "online"
  const { selectedIds } = useSelectedPlayers()
  const ready = isOnline || selectedIds.length > 0

  useEffect(() => {
    // Attendre le chargement de l'auth : sinon on redirige vers /joueurs avant
    // de savoir que le joueur est en mode en ligne (race au montage de la page).
    if (loading) return
    if (isOnline) return
    if (!ready) {
      router.replace(redirectTo)
    }
  }, [loading, isOnline, ready, router, redirectTo])

  return { ready, selectedIds, isOnline }
}
