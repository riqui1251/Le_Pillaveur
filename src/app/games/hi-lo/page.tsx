"use client"

import { useState } from 'react'
import { PlayerManager } from '@/components/PlayerManager'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { User, Home } from 'lucide-react'
import Link from 'next/link'
import Game from './components/game'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Types de mode de jeu
export type GameMode = 'standard' | 'traversee'

export default function HiLoPage() {
  const { players, updatePlayerStats } = usePlayers()
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('players')
  const [gameMode, setGameMode] = useState<GameMode>('standard')

  const handlePlayersSelected = (playerIds: string[]) => {
    setSelectedPlayerIds(playerIds)
    setGameStarted(true)
    setActiveTab('game')
  }

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
            Joueurs
          </TabsTrigger>
          <TabsTrigger value="game" disabled={!gameStarted}>
            Jeu
          </TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="space-y-4">
          <Card className="p-4">
            <h2 className="text-xl font-semibold mb-4">Sélectionnez les joueurs</h2>
            <PlayerManager 
              onPlayersSelected={handlePlayersSelected}
              minPlayers={2}
              maxPlayers={8}
              hideRemoveButtons={true}
            />
            
            <div className="mt-4">
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
              
              {gameMode === 'traversee' && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
                  <p className="text-sm">
                    <strong>Mode Traversée :</strong> Le but est d&apos;obtenir une série de bonnes réponses. 
                    L&apos;objectif est de 5 cartes de suite pour 2 joueurs et augmente de 2 par joueur supplémentaire.
                    Si un joueur devine &quot;égalité&quot; correctement, il sort de la partie. Si un joueur se trompe, 
                    tous boivent et la série repart à 1. La partie ne s&apos;arrête que quand l&apos;objectif est atteint !
                  </p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Game 
              players={players.filter(p => selectedPlayerIds.includes(p.id))}
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