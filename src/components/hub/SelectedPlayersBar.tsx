"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowLeft, Users } from "lucide-react"
import { useActivePlayers } from "@/hooks/useActivePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { getColorFromClass } from "@/lib/playerUtils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

export function SelectedPlayersBar() {
  const { players, loading, isOnline } = useActivePlayers()
  const { selectedIds } = useSelectedPlayers()

  const selectedPlayers = useMemo(
    () => players.filter((p) => selectedIds.includes(p.id)),
    [players, selectedIds]
  )

  if (loading) return null

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Users className="h-4 w-4 text-amber-300" />
          <span>
            {selectedPlayers.length > 0
              ? `${selectedPlayers.length} joueur${selectedPlayers.length > 1 ? "s" : ""} prêt${selectedPlayers.length > 1 ? "s" : ""}`
              : "Aucun joueur sélectionné"}
          </span>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 border border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Link href="/joueurs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Modifier
          </Link>
        </Button>
      </div>

      {selectedPlayers.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {selectedPlayers.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5"
            >
              <Avatar
                className="h-7 w-7 border border-white/20"
                style={{ backgroundColor: getColorFromClass(player.preferences.color) }}
              >
                {player.preferences.avatar && (
                  <AvatarImage src={player.preferences.avatar} alt={player.name} />
                )}
                <AvatarFallback
                  className="text-[10px] font-bold"
                  style={{ backgroundColor: getColorFromClass(player.preferences.color) }}
                >
                  {player.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-white/90">{player.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-amber-200/70">
          {isOnline
            ? "Rejoignez une salle en ligne ou attendez que l'hôte lance la partie."
            : "Retournez sur la page Joueurs pour constituer votre équipe (minimum 2)."}
        </p>
      )}
    </div>
  )
}
