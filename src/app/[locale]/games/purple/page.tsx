"use client"

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useAuth } from '@/components/providers/AuthProvider'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { GameShowcase } from '@/components/online/GameShowcase'
import { LocalGamePrelobby } from '@/components/game/LocalGamePrelobby'

// Les deux moteurs — le jeu local (un téléphone qui tourne autour de la
// table) et sa version en ligne (lobby, briefing, bibliothèque d'animation) —
// sont chargés À LA DEMANDE selon le mode : la page livrait les deux et n'en
// montrait qu'un. Pas de `ssr: false` : le serveur ne rend ni l'un ni l'autre
// (session inconnue, aucun joueur en mémoire), et le même squelette — en-tête
// du catalogue, zone qui pulse — tient la place le temps que le morceau arrive.
const PurpleOnline = dynamic(
  () => import('@/components/online/PurpleOnline').then((m) => m.PurpleOnline),
  { loading: () => <OnlineGameSkeleton gameId="purple" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="purple" />,
})

export type GameMode = 'standard' | 'traversee'

export default function PurplePage() {
  const { user, loading } = useAuth()
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const canStart = selectedPlayers.length >= 2

  // Compte pas encore connu : la vitrine du jeu, bouton principal désactivé —
  // c'est le HTML rendu au build, celui que lit Googlebot (l'écran local, lui,
  // attend ses joueurs). Un compte en ligne ne voit plus l'écran local le
  // temps que la session réponde.
  if (loading) {
    return <GameShowcase gameId="purple" pending />
  }

  // Mode en ligne : lobby + partie serveur-autoritaire (indépendant du flux local).
  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-[#07060b] sm:top-[3.75rem]">
        <PurpleOnline />
      </div>
    )
  }

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

  return (
    <LocalGamePrelobby gameId="purple" players={selectedPlayers} onStart={() => setGameStarted(true)} />
  )
}
