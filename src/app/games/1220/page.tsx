"use client"

import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getColorFromClass } from "@/lib/playerUtils"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import Game from "./components/game"

export default function Game1220Page() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  if (selectedPlayers.length >= 2) {
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
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-teal-600 to-indigo-700 text-3xl shadow-xl">
            🎲
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">1220</h1>
            <p className="text-sm text-white/40">D12 + D20 · Paris · 2+ joueurs</p>
          </div>
          <Link href="/jeux" className="ml-auto rounded-xl border border-white/10 bg-white/[0.05] p-2.5 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label="Retour aux jeux">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {/* Joueurs */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Joueurs — {selectedPlayers.length}
          </p>
          {selectedPlayers.length === 0 ? (
            <p className="text-sm italic text-white/30">Aucun joueur sélectionné</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedPlayers.map(p => {
                const bg = getColorFromClass(p.preferences?.color ?? "")
                return (
                  <div key={p.id} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                    <Avatar className="h-6 w-6 border border-white/20" style={{ backgroundColor: bg }}>
                      <AvatarFallback className="text-[10px] font-bold text-white" style={{ backgroundColor: bg }}>
                        {p.preferences?.icon || p.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                      {p.preferences?.avatar && <AvatarImage src={p.preferences.avatar} alt={p.name} />}
                    </Avatar>
                    <span className="text-sm font-medium text-white/80">{p.name}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Règles */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-2.5 text-sm text-white/55">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-400/70 mb-3">Règles</p>
          <p>🎲 Deux dés : un <strong className="text-white/80">D12</strong> (ambré) et un <strong className="text-white/80">D20</strong> (cyan). La <strong className="text-white/80">somme</strong> va de 2 à 32.</p>
          <p>⚙️ Avant la partie, chaque joueur choisit une <strong className="text-white/80">parité</strong>, une <strong className="text-white/80">plage</strong>, un <strong className="text-white/80">chiffre fait boire</strong> et un <strong className="text-white/80">chiffre donne à boire</strong>.</p>
          <p>🍺 Si la somme correspond à ton chiffre <em>fait boire</em> → tu bois.</p>
          <p>🎁 Si la somme correspond à ton chiffre <em>donne à boire</em> → tu distribues des gorgées.</p>
          <p>⚡ Si ton chiffre sort sur un dé sans que la somme corresponde → les dons sont <strong className="text-white/80">divisés par 2</strong>.</p>
        </div>

        {/* Not enough players */}
        <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 px-5 py-4 text-center text-sm text-teal-200/80">
          Sélectionnez au moins 2 joueurs sur la page Joueurs.
        </div>
        <Link href="/joueurs" className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Sélectionner des joueurs
        </Link>
      </div>
    </div>
  )
}
