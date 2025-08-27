"use client"

import { useEffect, useState } from 'react'
import Game from '@/app/games/monsieur-3/components/game'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePlayers } from '@/hooks/usePlayers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User, Home } from 'lucide-react'
import Link from 'next/link'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'
import { useRouter } from 'next/navigation'

export default function Monsieur3Page() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('players')
  const router = useRouter()

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  useEffect(() => {
    if (selectedPlayers.length >= 2 && !gameStarted) {
      setGameStarted(true)
      setActiveTab('game')
    }
  }, [selectedPlayers, gameStarted])

  const handleGameEnd = () => {
    router.push('/jeux')
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
            <SelectedPlayersDisplay players={selectedPlayers} />
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
              players={selectedPlayers}
              onGameEnd={handleGameEnd}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
} 