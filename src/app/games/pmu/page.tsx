"use client"

import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { Player } from '@/lib/players'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function PMUPage() {
  const { players } = usePlayers();
  const { selectedIds } = useSelectedPlayers();
  const router = useRouter()
  const selectedPlayers: Player[] = players.filter(p => selectedIds.includes(p.id));

  const handleGameEnd = () => {
    router.push('/jeux')
  };

  // En jeu : le GameShell (dans Game) fournit l'en-tête, le retour et la barre d'action.
  if (selectedPlayers.length >= 2) {
    return (
      <Game 
        players={selectedPlayers} 
        onGameEnd={handleGameEnd}
      />
    )
  }

  // Écran de configuration
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">Course PMU</h1>
        <Link href="/jeux">
          <Button variant="outline" size="icon" aria-label="Retour aux jeux">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Card className="p-6">
        <p className="mb-4 text-center text-muted-foreground">
          Un jeu de paris hippiques entre amis ! 🏇
        </p>
        <SelectedPlayersDisplay players={selectedPlayers} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Sélectionnez au moins 2 joueurs sur la page Joueurs pour commencer.
        </p>
      </Card>
    </div>
  )
} 