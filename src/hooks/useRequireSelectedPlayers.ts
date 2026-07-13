"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"
import { LOCAL_PLAY_COOKIE } from "@/lib/auth-cookies"

type Options = {
  /** Ne redirige pas vers /joueurs quand le mode en ligne est actif. */
  skipWhenOnline?: boolean
}

/** Le visiteur a activé le mode local (cookie posé au choix du mode). */
function hasChosenLocalMode(): boolean {
  if (typeof document === "undefined") return false
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${LOCAL_PLAY_COOKIE}=1`))
}

/** Redirige vers /joueurs si aucun joueur n'est sélectionné (mode local uniquement). */
export function useRequireSelectedPlayers(redirectTo = "/joueurs", options?: Options) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const isOnline = options?.skipWhenOnline && user?.playMode === "online"
  const { selectedIds } = useSelectedPlayers()
  const ready = isOnline || selectedIds.length > 0
  // Visiteur sans mode choisi (ni compte ni mode local) : il regarde la
  // vitrine — Googlebot inclus, sinon tout le catalogue finirait redirigé
  // vers la page compte (noindex). En état (et pas calculé au rendu) pour
  // rester identique au HTML serveur à l'hydratation.
  const [browsing, setBrowsing] = useState(false)

  useEffect(() => {
    // Attendre le chargement de l'auth : sinon on redirige vers /joueurs avant
    // de savoir que le joueur est en mode en ligne (race au montage de la page).
    if (loading) return
    const visitor = !user && !hasChosenLocalMode()
    setBrowsing(visitor)
    if (isOnline) return
    if (visitor) return
    if (!ready) {
      router.replace(redirectTo)
    }
  }, [loading, isOnline, ready, router, redirectTo, user])

  return { ready, selectedIds, isOnline, browsing }
}
