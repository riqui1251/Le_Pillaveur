"use client"

import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Player } from '@/lib/players'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PMUPage() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()
  const selectedPlayers: Player[] = players.filter(p => selectedIds.includes(p.id))

  if (selectedPlayers.length >= 2) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={() => router.push('/jeux')}
      />
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07060b] px-4 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-[110px]" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-violet-700/25 blur-[100px]" />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-600 to-violet-700 text-4xl shadow-2xl">
          🏇
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-white">Course PMU</h1>
          <p className="mt-2 text-sm text-white/55">
            Assignez vos chevaux et que le meilleur gagne !
          </p>
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
