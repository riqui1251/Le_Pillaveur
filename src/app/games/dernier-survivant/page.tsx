"use client"

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerManager } from '@/components/PlayerManager'
import { usePlayers } from '@/hooks/usePlayers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User, Home } from 'lucide-react'
import Link from 'next/link'

export default function DernierSurvivantPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { players } = usePlayers() // Sera utilisé quand le jeu sera implémenté
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
        <h1 className="text-3xl font-bold">Dernier Survivant</h1>
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
                <strong>Règles du jeu :</strong> Le Dernier Survivant est un jeu où les joueurs s&apos;affrontent jusqu&apos;à ce qu&apos;il n&apos;en reste plus qu&apos;un ! 
                Les détails complets du jeu seront implémentés prochainement.
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Card className="p-4">
              <h2 className="text-xl font-semibold mb-4">Jeu en développement</h2>
              <p>Ce jeu est actuellement en développement. Revenez bientôt pour jouer !</p>
              <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                <p className="text-sm">
                  Joueurs sélectionnés : {selectedPlayerIds.length}
                </p>
              </div>
              <Button 
                onClick={handleGameEnd}
                className="mt-4"
              >
                Retour à la sélection des joueurs
              </Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
} 