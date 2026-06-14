"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/navigation"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"

/** Redirige vers /joueurs si aucun joueur n'est sélectionné. */
export function useRequireSelectedPlayers(redirectTo = "/joueurs") {
  const router = useRouter()
  const { selectedIds } = useSelectedPlayers()
  const ready = selectedIds.length > 0

  useEffect(() => {
    if (!ready) {
      router.replace(redirectTo)
    }
  }, [ready, router, redirectTo])

  return { ready, selectedIds }
}
