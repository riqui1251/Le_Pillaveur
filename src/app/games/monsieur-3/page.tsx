"use client"

import { useState } from 'react'
import Game from '@/app/games/monsieur-3/components/game'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerManager } from '@/components/PlayerManager'
import { usePlayers } from '@/hooks/usePlayers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User, Home } from 'lucide-react'
import Link from 'next/link'

export default function Monsieur3Page() {
  const { players } = usePlayers()
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('players')

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

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Monsieur 3</h1>
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
            
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
              <p className="text-sm">
                <strong>Règles du jeu :</strong> &quot;Monsieur 3&quot; est un jeu où le premier joueur qui fait un 3 devient Monsieur 3. 
                Il boit une gorgée chaque fois qu&apos;un dé affiche 3, que la somme des dés est égale à 3, ou quand un dé ou la somme vaut 5 ou 8. 
                Un joueur qui tire un double peut choisir un autre joueur pour un duel. La partie se termine après un tour complet.
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Game 
              players={players.filter(p => selectedPlayerIds.includes(p.id))}
              onGameEnd={handleGameEnd}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
} 