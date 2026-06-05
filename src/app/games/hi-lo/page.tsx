"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import Link from 'next/link'
import Game from './components/game'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

// Types de mode de jeu
export type GameMode = 'standard' | 'traversee'

export default function HiLoPage() {
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [gameMode, setGameMode] = useState<GameMode>('standard')

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    setGameStarted(false)
  }

  const handleGameModeChange = (value: GameMode) => {
    setGameMode(value)
  }

  // En jeu : le GameShell (dans Game) fournit l'en-tête, le retour et la barre d'action.
  if (gameStarted) {
    return (
      <Game 
        players={selectedPlayers}
        onGameEnd={handleGameEnd}
        updatePlayerStats={updatePlayerStats}
        gameMode={gameMode}
      />
    )
  }

  // Écran de configuration
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">Hi/Lo</h1>
        <Link href="/jeux">
          <Button variant="outline" size="icon" aria-label="Retour aux jeux">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <SelectedPlayersDisplay players={selectedPlayers} />

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-2">Mode de jeu</h3>
        <Select value={gameMode} onValueChange={handleGameModeChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sélectionner un mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="traversee">Traversée</SelectItem>
          </SelectContent>
        </Select>
        <Button className="mt-4 w-full" disabled={selectedPlayers.length < 2} onClick={() => setGameStarted(true)}>
          Commencer la partie
        </Button>
      </Card>
    </div>
  )
} 