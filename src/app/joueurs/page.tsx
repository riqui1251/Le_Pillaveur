"use client"

import { useRouter } from "next/navigation"
import { PlayerManager } from "@/components/PlayerManager"
import { HubShell } from "@/components/hub/HubShell"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"

export default function JoueursPage() {
  const router = useRouter()
  const { select } = useSelectedPlayers()

  return (
    <HubShell
      step="joueurs"
      title="Qui joue ce soir ?"
      subtitle="Ajoutez vos amis, sélectionnez l'équipe et passez à l'étape suivante pour choisir le jeu."
    >
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
    </HubShell>
  )
}
