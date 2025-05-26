"use client"

import { useState } from 'react'
import { PlayerManager } from '@/components/PlayerManager'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { Player } from '@/lib/players'

export default function PMUPage() {
  const { players } = usePlayers();
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [gameStarted, setGameStarted] = useState(false);

  const handlePlayersSelected = (playerIds: string[]) => {
    const selected = players.filter(p => playerIds.includes(p.id));
    setSelectedPlayers(selected);
    setGameStarted(true);
  };

  const handleGameEnd = () => {
    setGameStarted(false);
    setSelectedPlayers([]);
  };

  return (
    <div className="container mx-auto px-4 py-24 min-h-screen">
      {!gameStarted ? (
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

              <PlayerManager 
                onPlayersSelected={handlePlayersSelected}
                minPlayers={2}
                maxPlayers={8}
                hideRemoveButtons={true}
              />

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
      ) : (
        <Game 
          players={selectedPlayers} 
          onGameEnd={handleGameEnd}
        />
      )}
    </div>
  )
} 