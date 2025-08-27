"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { User, Home } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState('players')
  const [gameMode, setGameMode] = useState<GameMode>('standard')

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    setGameStarted(false)
    setActiveTab('players')
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  // Gestion du changement de mode de jeu
  const handleGameModeChange = (value: GameMode) => {
    setGameMode(value)
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Hi/Lo</h1>
        <Link href="/">
          <Button variant="outline" size="icon">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="players">
            <User className="mr-2 h-4 w-4" />
            Paramètres
          </TabsTrigger>
          <TabsTrigger value="game" disabled={!gameStarted}>
            Jeu
          </TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="space-y-4">
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
            <Button className="mt-4 w-full" disabled={selectedPlayers.length < 2} onClick={() => { setGameStarted(true); setActiveTab('game') }}>
              Commencer la partie
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Game 
              players={selectedPlayers}
              onGameEnd={handleGameEnd}
              updatePlayerStats={updatePlayerStats}
              gameMode={gameMode}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
} 