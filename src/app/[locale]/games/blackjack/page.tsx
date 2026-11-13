"use client"

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useAuth } from '@/components/providers/AuthProvider'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { OnlineGameStage } from '@/components/online/OnlineGameStage'
import { GameShowcase } from '@/components/online/GameShowcase'
import { LocalGamePrelobby } from '@/components/game/LocalGamePrelobby'

// Comme Purple : jeu local et version en ligne chargés à la demande selon le mode.
const BlackjackOnline = dynamic(
  () => import('@/components/online/BlackjackOnline').then((m) => m.BlackjackOnline),
  { loading: () => <OnlineGameSkeleton gameId="blackjack" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="blackjack" />,
})

export default function BlackjackPage() {
  const { user, loading } = useAuth()
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)

  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id))
  const canStart = selectedPlayers.length >= 1

  if (loading) {
    return <GameShowcase gameId="blackjack" pending />
  }

  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <BlackjackOnline />
      </OnlineGameStage>
    )
  }

  if (gameStarted && canStart) {
    return (
      <Game players={selectedPlayers} onGameEnd={() => setGameStarted(false)} updatePlayerStats={updatePlayerStats} />
    )
  }

  return (
    <LocalGamePrelobby gameId="blackjack" players={selectedPlayers} onStart={() => setGameStarted(true)} />
  )
}
