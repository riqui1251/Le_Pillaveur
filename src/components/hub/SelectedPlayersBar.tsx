"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowLeft, Users } from "lucide-react"
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { PlayerIcon } from "@/components/ui/PlayerIcon"
import { PlayerName } from "@/components/ui/PlayerName"
import { Button } from "@/components/ui/button"

export function SelectedPlayersBar() {
  const { players, loading } = usePlayers()
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
            {selectedPlayers.length === 0 ? "Choisir les joueurs" : "Modifier"}
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
              <PlayerIcon player={player} size="sm" className="h-7 w-7 text-base" />
              <span className="text-sm font-medium">
                <PlayerName player={player} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Link
          href="/joueurs"
          className="block rounded-xl border border-dashed border-amber-400/25 bg-amber-500/5 px-4 py-3 text-center text-sm text-amber-200/80 transition-colors hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-100"
        >
          Touchez ici pour choisir vos joueurs (minimum 2).
        </Link>
      )}
    </div>
  )
}
