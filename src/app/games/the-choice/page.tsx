'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { usePlayers } from '@/hooks/usePlayers';
import { Player } from '@/lib/players';
import Game from './components/Game';
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers';

export default function TheChoicePage() {
  const { players: allPlayers } = usePlayers();
  const { selectedIds } = useSelectedPlayers();
  const [gameStep, setGameStep] = React.useState<'game' | 'results'>('game');
  const [selectedPlayers, setSelectedPlayers] = React.useState<Player[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gameResults, setGameResults] = React.useState<{ [playerId: string]: any } | null>(null);

  useEffect(() => {
    const selected = selectedIds.map(id => allPlayers.find(p => p.id === id)).filter(Boolean) as Player[];
    setSelectedPlayers(selected);
  }, [allPlayers, selectedIds]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleGameFinish = (results: { [playerId: string]: any }) => {
    setGameResults(results);
    setGameStep('results');
  };

  const handleReplay = () => {
    setGameStep('game');
    setGameResults(null);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">The Choice</h1>

      {gameStep === 'game' && (
        <Game 
          players={selectedPlayers} 
          onGameFinish={handleGameFinish}
        />
      )}

      {gameStep === 'results' && gameResults && (
        <div className="space-y-6">
          <div className="text-center p-6 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4">🎯 Partie terminée !</h2>
            <p className="text-lg mb-6">
              Tous les joueurs ont fait leurs choix !
            </p>
          </div>
          <div className="text-center">
            <Button onClick={handleReplay} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-lg">
              🎮 Rejouer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 