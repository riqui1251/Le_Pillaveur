"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import Link from 'next/link'
import Game from './components/game'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

// Types de mode de jeu
export type GameMode = 'standard' | 'traversee'

export default function PurplePage() {
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    setGameStarted(false)
  }

  // En jeu : le GameShell (dans Game) fournit l'en-tête, le retour et les actions.
  if (gameStarted && selectedPlayers.length >= 2) {
    return (
      <Game 
        players={selectedPlayers}
        onGameEnd={handleGameEnd}
        updatePlayerStats={updatePlayerStats}
        gameMode="standard"
      />
    )
  }

  // Écran de configuration
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">Purple</h1>
        <Link href="/jeux">
          <Button variant="outline" size="icon" aria-label="Retour aux jeux">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <SelectedPlayersDisplay players={selectedPlayers} />

      <Card className="p-4">
        <Button className="w-full" disabled={selectedPlayers.length < 2} onClick={() => setGameStarted(true)}>
          Commencer la partie
        </Button>
        {selectedPlayers.length < 2 && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Sélectionnez au moins 2 joueurs sur la page Joueurs.
          </p>
        )}
      </Card>
    </div>
  )
}
