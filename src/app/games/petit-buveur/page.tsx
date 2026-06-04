"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { User, Shield, Home } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

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
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [activeTab, setActiveTab] = useState('players')
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    setGameStarted(false)
    setActiveTab('players')
  }

  // En jeu : le GameShell (dans Game) fournit l'en-tête, le retour et la barre d'action.
  if (gameStarted) {
    return (
      <Game 
        players={selectedPlayers} 
        onGameEnd={handleGameEnd}
        difficulty={difficulty}
      />
    )
  }

  return (
    <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">🍻 Le Petit Buveur</h1>
            <Link href="/jeux">
              <Button variant="outline" size="icon" aria-label="Retour aux jeux">
                <Home className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground">
            Un jeu de plateau où l&apos;objectif est d&apos;arriver au bout sans être trop saoul !
          </p>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="players" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>Joueurs</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>Paramètres</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="players" className="w-full">
              <Card className="p-4 mb-4">
                <SelectedPlayersDisplay players={selectedPlayers} />
                <Button className="mt-4 w-full" disabled={selectedPlayers.length < 2} onClick={() => setGameStarted(true)}>Commencer</Button>
                {selectedPlayers.length < 2 && (
                  <p className="mt-3 text-center text-sm text-muted-foreground">
                    Sélectionnez au moins 2 joueurs sur la page Joueurs.
                  </p>
                )}
              </Card>
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
          </Tabs>
    </div>
  )
} 