"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { getColorFromClass } from '@/lib/playerUtils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Game from './components/game'

export type GameMode = 'standard' | 'traversee'

export default function PurplePage() {
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const canStart = selectedPlayers.length >= 2

  if (gameStarted && canStart) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
        gameMode="standard"
      />
    )
  }

  if (!canStart) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07060b] px-4 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[110px]" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-purple-700/25 blur-[100px]" />
        </div>
        <div className="relative flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600 to-purple-700 text-4xl shadow-2xl">
            🃏
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white">Purple</h1>
            <p className="mt-2 text-sm text-white/55">Parie sur la couleur, accumule ou bois</p>
          </div>
          <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/80">
            Aucun joueur sélectionné. Retournez sur la page Joueurs pour constituer votre équipe (minimum 2).
          </div>
          <Link
            href="/joueurs"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Sélectionner des joueurs
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07060b] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-purple-700/25 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm space-y-6">
        {/* En-tête */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-600 to-purple-700 text-3xl shadow-xl">
            🃏
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Purple</h1>
            <p className="mt-1 text-sm text-white/50">Parie sur la couleur, accumule ou bois</p>
          </div>
        </div>

        {/* Joueurs */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/35">
            Joueurs — {selectedPlayers.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedPlayers.map(p => {
              const bg = getColorFromClass(p.preferences.color)
              return (
                <div key={p.id} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                  <Avatar className="h-6 w-6 border border-white/20" style={{ backgroundColor: bg }}>
                    <AvatarFallback className="text-[10px] font-bold text-white" style={{ backgroundColor: bg }}>
                      {p.preferences.icon || p.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium text-white/80">{p.name}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Règles */}
        <div className="rounded-2xl border border-violet-800/20 bg-violet-950/30 p-4 text-sm text-white/55 space-y-1.5">
          <p className="font-semibold text-violet-300 text-xs uppercase tracking-widest mb-2">Comment jouer</p>
          <p>Parie sur la couleur de la prochaine carte : <span className="text-red-400">Rouge</span>, <span className="text-white/70">Noir</span> ou <span className="text-violet-400">Purple</span> (rouge + noir).</p>
          <p>Si tu as raison, le compteur monte. Si tu as tort, tu bois le compteur + les gorgées du pari raté.</p>
          <p>Le <span className="text-violet-300">Double Purple</span> est le pari le plus risqué — 4 cartes alternées.</p>
        </div>

        {/* Bouton lancer */}
        <button
          onClick={() => setGameStarted(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:from-violet-500 hover:to-purple-600 active:scale-[0.98]"
        >
          Commencer la partie
        </button>

        <Link
          href="/jeux"
          className="flex items-center justify-center gap-2 text-sm text-white/35 transition-colors hover:text-white/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux jeux
        </Link>
      </div>
    </main>
  )
}
