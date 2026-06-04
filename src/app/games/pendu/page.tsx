"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { User, Home, Settings } from 'lucide-react'
import Link from 'next/link'
import Game from './components/game'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

// Types de difficulté
export type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'


const difficultyDescriptions: Record<Difficulty, { name: string; description: string; emoji: string }> = {
  facile: {
    name: 'Facile',
    description: '8 erreurs max, mots courts, peu de gorgées',
    emoji: '🌱'
  },
  normal: {
    name: 'Normal',
    description: '6 erreurs max, mots moyens, gorgées modérées',
    emoji: '⭐'
  },
  difficile: {
    name: 'Difficile', 
    description: '5 erreurs max, mots longs, plus de gorgées',
    emoji: '🔥'
  },
  extreme: {
    name: 'Extrême',
    description: '4 erreurs max, mots très difficiles, beaucoup de gorgées',
    emoji: '💀'
  }
}

export default function PenduPage() {
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('players')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    setGameStarted(false)
    setActiveTab('players')
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  const handleDifficultyChange = (value: Difficulty) => {
    setDifficulty(value)
  }

  const startGame = () => {
    setGameStarted(true)
    setActiveTab('game')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-blue-900 to-indigo-900 text-white">
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              Le Pendu des Gorgées
            </h1>
            <p className="text-purple-200">Devinez le mot avant d&apos;être pendu !</p>
          </div>
          <Link href="/">
            <Button variant="outline" size="icon" className="border-white/20 text-white hover:bg-white/10">
              <Home className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2 bg-white/10">
            <TabsTrigger value="players" className="data-[state=active]:bg-white/20">
              <User className="mr-2 h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="game" disabled={!gameStarted} className="data-[state=active]:bg-white/20">
              🎯 Jeu
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-6 mt-6">
            {/* Sélection des joueurs */}
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <User className="mr-2" />
                Joueurs sélectionnés
              </h3>
              <SelectedPlayersDisplay players={selectedPlayers} />
              {selectedPlayers.length < 2 && (
                <p className="text-amber-300 text-sm mt-2">
                  ⚠️ Sélectionnez au moins 2 joueurs pour commencer la partie
                </p>
              )}
            </Card>


            {/* Configuration de la difficulté */}
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <Settings className="mr-2" />
                Difficulté
              </h3>
              
              <div className="space-y-4">
                <Select value={difficulty} onValueChange={handleDifficultyChange}>
                  <SelectTrigger className="w-full bg-white/5 border-white/20 text-white">
                    <SelectValue placeholder="Sélectionner la difficulté" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-white/20">
                    {Object.entries(difficultyDescriptions).map(([key, config]) => (
                      <SelectItem key={key} value={key} className="text-white hover:bg-white/10">
                        <div className="flex items-center space-x-2">
                          <span>{config.emoji}</span>
                          <span>{config.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Description de la difficulté sélectionnée */}
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-2xl">{difficultyDescriptions[difficulty].emoji}</span>
                    <h4 className="text-lg font-semibold">{difficultyDescriptions[difficulty].name}</h4>
                  </div>
                  <p className="text-purple-200">{difficultyDescriptions[difficulty].description}</p>
                </div>
              </div>
            </Card>

            {/* Règles du jeu */}
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
              <h3 className="text-xl font-semibold mb-4">📋 Règles du jeu</h3>
              <div className="space-y-3 text-purple-200">
                <div className="flex items-start space-x-2">
                  <span className="text-yellow-400 font-bold">1.</span>
                  <p>Chaque joueur joue à tour de rôle pour deviner un mot mystère</p>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-yellow-400 font-bold">2.</span>
                  <p>Proposez des lettres une par une pour découvrir le mot</p>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400 font-bold">3.</span>
                  <p>💡 Utilisez des indices (coût: -10 secondes) pour révéler des lettres</p>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-purple-400 font-bold">4.</span>
                  <p>🎨 Changez le style du pendu pendant la partie</p>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-red-400 font-bold">5.</span>
                  <p>⏰ Attention au minuteur ! Temps écoulé = défaite</p>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-400 font-bold">6.</span>
                  <p>Le joueur avec le plus de points à la fin gagne !</p>
                </div>
              </div>
            </Card>

            {/* Bouton de démarrage */}
            <div className="text-center">
              <Button 
                onClick={startGame}
                disabled={selectedPlayers.length < 2}
                size="lg"
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold px-8 py-3 text-lg disabled:opacity-50"
              >
                🎯 Commencer la partie
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="game">
            {gameStarted && (
              <Game 
                players={selectedPlayers}
                onGameEnd={handleGameEnd}
                difficulty={difficulty}
                updatePlayerStats={updatePlayerStats}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
