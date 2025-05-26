"use client"

import { useState } from 'react'
import { PlayerManager } from '@/components/PlayerManager'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { User, Shield, Lock, AlertCircle, Home } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

// Types de difficulté disponibles
type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

// Noms des difficultés pour l'affichage
const difficultyNames: Record<Difficulty, string> = {
  facile: '🌱 Facile',
  normal: '🌟 Normal',
  difficile: '🔥 Difficile',
  extreme: '💀 Extrême'
}

export default function PetitBuveurPage() {
  const [gameStarted, setGameStarted] = useState(false)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [activeTab, setActiveTab] = useState('players')
  const { players } = usePlayers()

  const handlePlayersSelected = (playerIds: string[]) => {
    setSelectedPlayerIds(playerIds)
    setGameStarted(true)
  }

  const handleGameEnd = () => {
    setGameStarted(false)
    setSelectedPlayerIds([])
  }

  return (
    <div className="container mx-auto p-4">
      {gameStarted ? (
        <div className="space-y-4">
          <Button 
            variant="outline" 
            onClick={handleGameEnd}
            className="flex items-center gap-2 mb-4"
          >
            <Home className="h-4 w-4" />
            Retour
          </Button>
          <Game 
            players={players.filter(p => selectedPlayerIds.includes(p.id))} 
            onGameEnd={handleGameEnd}
            difficulty={difficulty}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">🍻 Le Petit Buveur</h1>
            <p className="text-muted-foreground text-center mb-6">
              Un jeu de plateau où l&apos;objectif est d&apos;arriver au bout sans être trop saoul !
            </p>
            
            <Link href="/" className="mx-auto mb-4">
              <Button variant="outline" className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Retour à l&apos;accueil
              </Button>
            </Link>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 md:grid-cols-3 mb-4">
              <TabsTrigger value="players" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="hidden md:inline">Joueurs</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden md:inline">Paramètres</span>
              </TabsTrigger>
              <TabsTrigger value="account" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                <span className="hidden md:inline">Compte</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="players" className="w-full">
              <div className="card p-4 mb-4">
                <PlayerManager 
                  onPlayersSelected={handlePlayersSelected}
                  minPlayers={2}
                  maxPlayers={8}
                  hideRemoveButtons={true}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-4">
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-4">Difficulté</h2>
                <div className="mb-4">
                  <Select
                    value={difficulty}
                    onValueChange={(value) => setDifficulty(value as Difficulty)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner la difficulté" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facile">{difficultyNames.facile}</SelectItem>
                      <SelectItem value="normal">{difficultyNames.normal}</SelectItem>
                      <SelectItem value="difficile">{difficultyNames.difficile}</SelectItem>
                      <SelectItem value="extreme">{difficultyNames.extreme}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2"><strong>Description des difficultés :</strong></p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Facile :</strong> Moins de gorgées à boire. Idéal pour les débutants.</li>
                    <li><strong>Normal :</strong> Équilibré, pour une soirée agréable sans excès.</li>
                    <li><strong>Difficile :</strong> Plus de gorgées et de défis. Pour les joueurs expérimentés.</li>
                    <li><strong>Extrême :</strong> Beaucoup de gorgées et possibilité de cul sec. Réservé aux experts !</li>
                  </ul>
                </div>
              </Card>
              
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-4">Règles du jeu</h2>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>1. Chaque joueur lance le dé à son tour et avance d&apos;autant de cases.</p>
                  <p>2. Selon la case, le joueur doit boire un certain nombre de gorgées ou relever un défi.</p>
                  <p>3. Les cases spéciales peuvent faire avancer, reculer ou faire boire tous les joueurs.</p>
                  <p>4. Le premier joueur à atteindre la fin du plateau gagne la partie.</p>
                  <p className="font-semibold mt-2">Note : À consommer avec modération. L&apos;abus d&apos;alcool est dangereux pour la santé.</p>
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="account" className="space-y-4">
              <Card className="p-4">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold mb-4">Zone réservée</h2>
                  <div className="flex items-center space-x-4">
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                    <p className="text-sm text-muted-foreground">Cette section est réservée à l&apos;administrateur.</p>
                  </div>
                  
                  <div className="mt-4">
                    <Input
                      type="password"
                      placeholder="Mot de passe"
                      className="mb-2"
                    />
                    <Button variant="default" className="w-full">
                      Accéder
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
} 