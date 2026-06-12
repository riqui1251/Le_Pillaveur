"use client"

import { useRouter } from "next/navigation"
import { PlayerManager } from "@/components/PlayerManager"
import { HubShell } from "@/components/hub/HubShell"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"
import { PlayModeSelector } from "@/components/auth/PlayModeSelector"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Globe } from "lucide-react"

export default function JoueursPage() {
  const router = useRouter()
  const { select } = useSelectedPlayers()
  const { user, loading } = useAuth()

  const isOnline = user?.playMode === "online"

  return (
    <HubShell
      step="joueurs"
      title="Qui joue ce soir ?"
      subtitle={
        isOnline
          ? "En mode en ligne, les joueurs sont les comptes connectés dans chaque lobby — rendez-vous dans Jeux."
          : "Ajoutez vos amis, sélectionnez l'équipe et passez à l'étape suivante pour choisir le jeu."
      }
    >
      {!loading && !user && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-sm text-amber-100/90">
            Connectez-vous pour synchroniser vos joueurs sur tous vos appareils ou jouer en ligne.
          </p>
          <Button asChild className="mt-3 bg-amber-500 text-black hover:bg-amber-400">
            <Link href="/compte">Se connecter / Créer un compte</Link>
          </Button>
        </div>
      )}

      {user && (
        <div className="mb-6">
          <PlayModeSelector />
        </div>
      )}

      {isOnline ? (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-8 text-center">
          <Globe className="mx-auto mb-3 h-10 w-10 text-violet-300" />
          <h2 className="text-lg font-semibold text-white">Mode en ligne actif</h2>
          <p className="mt-2 text-sm text-white/55">
            Consultez les lobbies ouverts ou créez-en un depuis la page d&apos;un jeu.
          </p>
          <Button asChild className="mt-4 bg-violet-600 text-white hover:bg-violet-500">
            <Link href="/jeux">Voir les jeux et lobbies</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm sm:p-6">
          <PlayerManager
            variant="hub"
            onPlayersSelected={(ids) => {
              select(ids)
              router.push("/jeux")
            }}
            minPlayers={2}
            hideRemoveButtons
          />
        </div>
      )}
    </HubShell>
  )
}
