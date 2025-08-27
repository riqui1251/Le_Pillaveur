"use client"

import { useState } from 'react'
import Game from './components/game'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { usePlayers } from "@/hooks/usePlayers"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { User, Home } from 'lucide-react'
import Link from 'next/link'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

export default function PyramidePage() {
  const { players } = usePlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [pyramidHeight, setPyramidHeight] = useState(5)
  const [gameMode, setGameMode] = useState<'fun' | 'classic'>('fun')
  const [deckCount, setDeckCount] = useState<1 | 2>(1)
  const [cardsToSelect, setCardsToSelect] = useState<4 | 5>(4)
  const { selectedIds } = useSelectedPlayers()
  const [activeTab, setActiveTab] = useState('players')

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

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
        <h1 className="text-3xl font-bold">Pyramide</h1>
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
          <Card className="p-4 bg-gradient-to-br from-amber-900/80 to-yellow-800/80 border-amber-700">
            <h2 className="text-xl font-semibold mb-4 text-amber-100">Configuration de la partie</h2>
            
            <div className="space-y-6">
              <Tabs defaultValue="fun" onValueChange={(value) => setGameMode(value as 'fun' | 'classic')}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="fun">Mode Cartes</TabsTrigger>
                  <TabsTrigger value="classic">Mode Sans Cartes</TabsTrigger>
                </TabsList>
                
                <TabsContent value="fun">
                  <div className="text-amber-200 text-sm mb-4">
                    Le jeu original avec une pyramide aléatoire.
                  </div>
                </TabsContent>
                
                <TabsContent value="classic">
                  <div className="space-y-4">
                    <div className="text-amber-200 text-sm mb-4">
                      Mode classique où les joueurs sélectionnent leurs cartes avant de créer la pyramide.
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-amber-100">Nombre de paquets de cartes:</Label>
                      <RadioGroup defaultValue="1" className="flex space-x-4" onValueChange={(value) => setDeckCount(parseInt(value) as 1 | 2)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="1" id="deck-1" />
                          <Label htmlFor="deck-1" className="text-amber-200">52 cartes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="2" id="deck-2" />
                          <Label htmlFor="deck-2" className="text-amber-200">104 cartes</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-amber-100">Cartes à sélectionner par joueur:</Label>
                      <RadioGroup defaultValue="4" className="flex space-x-4" onValueChange={(value) => setCardsToSelect(parseInt(value) as 4 | 5)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="4" id="cards-4" />
                          <Label htmlFor="cards-4" className="text-amber-200">4 cartes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="5" id="cards-5" />
                          <Label htmlFor="cards-5" className="text-amber-200">5 cartes</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div>
                <h3 className="text-lg font-medium mb-3 text-amber-100">Hauteur de la pyramide:</h3>
                <div className="space-y-6">
                  <div className="flex justify-between">
                    <span className="text-amber-200">3</span>
                    <span className="text-amber-200 font-bold">{pyramidHeight}</span>
                    <span className="text-amber-200">9</span>
                  </div>
                  <Slider
                    value={[pyramidHeight]}
                    min={3}
                    max={9}
                    step={1}
                    onValueChange={(values) => setPyramidHeight(values[0])}
                    className="w-full"
                  />
                  <div className="text-center text-sm text-amber-200/70">
                    Nombre total de cartes: {(pyramidHeight * (pyramidHeight + 1)) / 2}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <SelectedPlayersDisplay players={selectedPlayers} />
          
          <Button 
            className="mt-4 w-full" 
            disabled={selectedPlayers.length < 2} 
            onClick={() => { setGameStarted(true); setActiveTab('game') }}
          >
            Commencer la partie
          </Button>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Game 
              players={selectedPlayers}
              pyramidHeight={pyramidHeight}
              onGameEnd={handleGameEnd}
              gameMode={gameMode}
              deckCount={deckCount}
              cardsToSelect={cardsToSelect}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
} 