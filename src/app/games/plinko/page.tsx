"use client"

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerManager } from '@/components/PlayerManager'
import { usePlayers } from '@/hooks/usePlayers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { User, Home } from 'lucide-react'
import Link from 'next/link'
import Game, { DifficultyLevel } from './components/game'

export default function PlinkoPage() {
  const { players } = usePlayers()
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('players')
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>('medium')
  const [isCumulativeModeEnabled, setIsCumulativeModeEnabled] = useState(false)
  const [gameKey, setGameKey] = useState(0)

  const handlePlayersSelected = (playerIds: string[]) => {
    if (!selectedDifficulty) {
        console.warn("Veuillez sélectionner une difficulté avant de commencer.");
        return;
    }
    setSelectedPlayerIds(playerIds)
    setGameStarted(true)
    setActiveTab('game')
  }

  const handleReturnToSelection = () => {
    setGameStarted(false)
    setActiveTab('players')
    setGameKey(prev => prev + 1)
  }

  const handleRestartGame = () => {
    setGameKey(prev => prev + 1)
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  const handleDifficultyChange = (value: DifficultyLevel) => {
    setSelectedDifficulty(value)
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Plinko</h1>
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
              maxPlayers={Infinity}
              hideRemoveButtons={true}
            />
            
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Difficulté</h3>
              <Select value={selectedDifficulty} onValueChange={handleDifficultyChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner une difficulté" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Facile (Gorgées 1-2)</SelectItem>
                  <SelectItem value="medium">Moyen (Gorgées 1-3)</SelectItem>
                  <SelectItem value="hard">Difficile (Gorgées 1-4)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 flex items-center space-x-2">
              <Checkbox 
                id="cumulative-mode"
                checked={isCumulativeModeEnabled}
                onCheckedChange={(checked: boolean | 'indeterminate') => setIsCumulativeModeEnabled(Boolean(checked))}
              />
              <Label 
                htmlFor="cumulative-mode"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Mode Cumulatif (les effets multiplicateurs et +/- s&apos;additionnent)
              </Label>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
              <p className="text-sm">
                <strong>Règles du jeu :</strong> Plinko est un jeu où une balle tombe à travers une grille d&apos;obstacles. 
                Chaque joueur mise un certain nombre de gorgées et choisit par quelle position lancer la balle.
                Le résultat final détermine combien de gorgées le joueur gagne ou doit distribuer.
                Plus la balle atterrit au centre, plus le multiplicateur est élevé !
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Game 
              key={gameKey}
              players={players.filter(p => selectedPlayerIds.includes(p.id))}
              onGameEnd={handleReturnToSelection}
              onRestartGame={handleRestartGame}
              difficulty={selectedDifficulty}
              isCumulativeMode={isCumulativeModeEnabled}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
} 