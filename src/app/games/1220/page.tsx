"use client"

import { useState, useEffect } from "react"
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getColorFromClass } from "@/lib/playerUtils"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import Game from "./components/game"
import { useIsOnlineMode } from "@/components/online/OnlineGameGate"
import { OnlineLobbyPanel } from "@/components/online/OnlineLobbyPanel"
import { useOnlineGameSync } from "@/hooks/useOnlineGameSync"
import type { Game1220SyncedState } from "@/lib/online-game-state"

export default function Game1220Page() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()
  const isOnline = useIsOnlineMode()
  const [gameStarted, setGameStarted] = useState(false)

  const { isPlayingOnline, onlinePlayers, onlineSync, handleLeaveToMenu } =
    useOnlineGameSync<Game1220SyncedState>({ gameId: "1220" })

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const activePlayers = isOnline ? onlinePlayers : selectedPlayers

  useEffect(() => {
    if (isPlayingOnline && !gameStarted) setGameStarted(true)
    if (!isPlayingOnline && gameStarted && isOnline) setGameStarted(false)
  }, [isPlayingOnline, gameStarted, isOnline])

  if (gameStarted || (isOnline && isPlayingOnline)) {
    return (
      <Game
        key={onlineSync ? `${onlineSync.roomId}-${onlineSync.stateVersion}` : "local"}
        players={activePlayers}
        onGameEnd={() => {
          if (isOnline) void handleLeaveToMenu()
          else router.push("/jeux")
        }}
        onlineSync={onlineSync}
      />
    )
  }

  if (selectedPlayers.length >= 2 && !isOnline) {
    return <Game players={selectedPlayers} onGameEnd={() => router.push("/jeux")} />
  }

  return (
    <div className="min-h-screen bg-[#07060b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#07060b]" />
        <div className="absolute -top-32 right-1/4 h-[28rem] w-[28rem] rounded-full bg-teal-600/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[24rem] w-[24rem] rounded-full bg-indigo-600/10 blur-[100px]" />
      </div>

      <div className="mx-auto max-w-md px-4 py-8 space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-teal-600 to-indigo-700 text-3xl shadow-xl">
            🎲
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">1220</h1>
            <p className="text-sm text-white/40">D12 + D20 · Paris · 2+ joueurs</p>
          </div>
          <Link href="/jeux" className="ml-auto rounded-xl border border-white/10 bg-white/[0.05] p-2.5 text-white/50 transition hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {isOnline && <OnlineLobbyPanel gameId="1220" />}

        {!isOnline && (
          <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 px-5 py-4 text-center text-sm text-teal-200/80">
            Sélectionnez au moins 2 joueurs sur la page Joueurs.
          </div>
        )}

        {isOnline && (
          <p className="text-center text-sm text-white/40">
            Rejoignez le lobby, configurez vos paris, puis l&apos;hôte lance la partie.
          </p>
        )}
      </div>
    </div>
  )
}
