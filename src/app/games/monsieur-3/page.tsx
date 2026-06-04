"use client"

import Game from '@/app/games/monsieur-3/components/game'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePlayers } from '@/hooks/usePlayers'
import { Home } from 'lucide-react'
import Link from 'next/link'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'
import { useRouter } from 'next/navigation'

export default function Monsieur3Page() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    router.push('/jeux')
  }

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
      <div className="flex justify-between items-center">
        <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">Monsieur 3</h1>
        <Link href="/jeux">
          <Button variant="outline" size="icon" aria-label="Retour aux jeux">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Card className="p-4">
        <SelectedPlayersDisplay players={selectedPlayers} />
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
          <p className="text-sm">
            <strong>Règles du jeu :</strong> &quot;Monsieur 3&quot; est un jeu où le premier joueur qui fait un 3 devient Monsieur 3. 
            Il boit une gorgée chaque fois qu&apos;un dé affiche 3, que la somme des dés est égale à 3, ou quand un dé ou la somme vaut 5 ou 8. 
            Un joueur qui tire un double peut choisir un autre joueur pour un duel. La partie se termine après un tour complet.
          </p>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Sélectionnez au moins 2 joueurs sur la page Joueurs pour commencer.
        </p>
      </Card>
    </div>
  )
} 