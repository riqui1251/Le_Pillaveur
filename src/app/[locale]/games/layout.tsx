"use client"

import { useEffect } from "react"
import { useRequireSelectedPlayers } from "@/hooks/useRequireSelectedPlayers"
import { VoiceDock } from "@/components/voice/VoiceDock"

/** Verrou d'écran du navigateur — typé ici, l'API n'est pas dans tous les lib.dom. */
type WakeLockSentinelLike = {
  release: () => Promise<void>
  addEventListener?: (type: "release", listener: () => void) => void
}

/**
 * Empêche l'écran de s'éteindre pendant une partie.
 *
 * Le téléphone posé au milieu de la table se verrouille pendant qu'on discute,
 * et il faut l'empreinte de son propriétaire pour le rallumer : la partie
 * s'arrête. On tient donc un Screen Wake Lock tant qu'on est sur une page de
 * jeu — c'est l'interface standard du navigateur, aucune dépendance.
 *
 * Trois cas se gèrent seuls : API absente (webview, Safari ancien) ou demande
 * refusée (batterie faible, page non visible) → on ne fait rien, aucun jeu n'en
 * dépend ; page passée en arrière-plan → le navigateur relâche le verrou de
 * lui-même, on le redemande au retour ; sortie des pages de jeu → on relâche.
 */
function useKeepScreenAwake() {
  useEffect(() => {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> }
    }
    const wakeLock = nav.wakeLock
    if (!wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== "visible") return
      try {
        const next = await wakeLock.request("screen")
        if (cancelled) {
          void next.release().catch(() => {})
          return
        }
        sentinel = next
        // Le navigateur peut relâcher tout seul (écran verrouillé par
        // l'utilisateur, onglet caché) : on oublie la référence morte pour
        // pouvoir en redemander une au retour au premier plan.
        next.addEventListener?.("release", () => {
          if (sentinel === next) sentinel = null
        })
      } catch {
        // Refusé (batterie faible, permission, page cachée) : sans effet.
      }
    }

    const release = () => {
      const current = sentinel
      sentinel = null
      void current?.release().catch(() => {})
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire()
      else release()
    }

    void acquire()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      release()
    }
  }, [])
}

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useRequireSelectedPlayers("/joueurs", { skipWhenOnline: true })
  useKeepScreenAwake()

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 px-2 py-1 sm:px-4">
      {/* Coquille « Cartes sur Table » : le visiteur séduit par la vitrine
          (feutre, or, crème) tombait sur un plateau gris anthracite au moment
          décisif et croyait changer de site. Feutre profond, filet or et
          titrage Playfair — décor mesuré, lisibilité d'abord : le texte reste
          crème sur vert sombre, et rien de la mise en page des jeux ne bouge. */}
      <div className="flex min-h-0 w-full flex-1 flex-col space-y-3 rounded-md border border-gold/20 bg-felt-deep/70 p-2 text-cream shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)] [&_h1]:font-display sm:space-y-6 sm:rounded-xl sm:p-6">
        {children}
      </div>
      {/* Vocal de salle — apparaît dès qu'on est dans une salle en ligne,
          pour TOUS les jeux (actuels et futurs), lobby inclus. */}
      <VoiceDock />
    </div>
  )
}
