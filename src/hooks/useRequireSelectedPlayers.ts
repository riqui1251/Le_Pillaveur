"use client"

import { useEffect } from "react"
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

  useEffect(() => {
    // Attendre le chargement de l'auth : sinon on redirige vers /joueurs avant
    // de savoir que le joueur est en mode en ligne (race au montage de la page).
    if (loading) return
    // Visiteur sans mode choisi (ni compte ni mode local) : il regarde la
    // vitrine — Googlebot inclus, sinon tout le catalogue finirait redirigé
    // vers la page compte (noindex). Ce hook ne sert plus qu'à cette
    // redirection : rien ne doit conditionner un RENDU à son résultat, sous
    // peine de servir un HTML vide tant que l'auth n'a pas répondu.
    const visitor = !user && !hasChosenLocalMode()
    if (isOnline) return
    if (visitor) return
    if (!ready) {
      router.replace(redirectTo)
    }
  }, [loading, isOnline, ready, router, redirectTo, user])

  return { ready, selectedIds, isOnline }
}
