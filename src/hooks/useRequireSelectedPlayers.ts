"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"

/** Redirige vers /joueurs si aucun joueur n'est sélectionné. */
export function useRequireSelectedPlayers() {
  const router = useRouter()
  const { selectedIds } = useSelectedPlayers()

  useEffect(() => {
    if (selectedIds.length === 0) {
      router.replace("/joueurs")
    }
  }, [selectedIds, router])
}
