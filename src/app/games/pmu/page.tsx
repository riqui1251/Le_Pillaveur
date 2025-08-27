"use client"

import { useEffect, useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { Player } from '@/lib/players'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export default function PMUPage() {
  const { players } = usePlayers();
  const { selectedIds } = useSelectedPlayers();
  const [gameStarted, setGameStarted] = useState(false);
  const router = useRouter()
  const selectedPlayers: Player[] = players.filter(p => selectedIds.includes(p.id));

  useEffect(() => {
    if (selectedPlayers.length >= 2 && !gameStarted) {
      setGameStarted(true)
    }
  }, [selectedPlayers, gameStarted])

  const handleGameEnd = () => {
    // Retour au menu des jeux
    router.push('/jeux')
  };

  if (selectedPlayers.length >= 2 && gameStarted) {
    return (
      <div className="container mx-auto px-4 py-24 min-h-screen">
        <Game 
          players={selectedPlayers} 
          onGameEnd={handleGameEnd}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-24 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <Card className="bg-white/10 backdrop-blur-sm border-white/20">
          <div className="p-6">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                Course PMU
              </h1>
              <p className="text-gray-300 text-lg">
                Un jeu de paris hippiques entre amis ! 🏇
              </p>
            </div>

            <SelectedPlayersDisplay players={selectedPlayers} />

            <div className="mt-6 text-center">
              <Link 
                href="/"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                ← Retour à l&apos;accueil
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
} 