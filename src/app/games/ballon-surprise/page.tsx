'use client';

import React from 'react';
// Importer les composants nécessaires ici (sélection joueurs, sélection ballons, course, etc.)
import { PlayerManager } from '@/components/PlayerManager';
import BalloonSelection from './components/BalloonSelection';
import BalloonRace from './components/BalloonRace';
import { Button } from '@/components/ui/button';
import { usePlayers } from '@/hooks/usePlayers'; // Importer le hook usePlayers
import { Player } from '@/lib/players'; // Importer le type Player

export default function BallonSurprisePage() {
  const { players: allPlayers } = usePlayers(); // Récupérer tous les joueurs
  // Gérer l'état du jeu (quelle étape afficher)
  const [gameStep, setGameStep] = React.useState('playerSelection'); // playerSelection, balloonSelection, race, results

  // Gérer les joueurs sélectionnés
  const [selectedPlayers, setSelectedPlayers] = React.useState<Player[]>([]); // Stocker les objets Player

  // Gérer les choix des ballons par joueur
  const [playerChoices, setPlayerChoices] = React.useState<{ [playerId: string]: string }>({}); // { playerId: balloonColor }

  // Gérer les résultats de la course
  const [raceResult, setRaceResult] = React.useState<{ winnerColor: string; sips: number } | null>(null);

  const handlePlayersSelected = (playerIds: string[]) => {
    // Trouver les objets Player correspondants aux IDs
    const selected = playerIds.map(id => allPlayers.find(p => p.id === id)).filter(p => p !== undefined) as Player[];
    setSelectedPlayers(selected);
    setGameStep('balloonSelection');
    // Réinitialiser les choix précédents si on re-sélectionne les joueurs
    setPlayerChoices({}); 
    setRaceResult(null);
  };

  const handleBalloonsSelected = (choices: { [playerId: string]: string }) => {
    setPlayerChoices(choices);
    setGameStep('race');
  };

  const handleRaceFinish = (winnerColor: string, sips: number) => {
    setRaceResult({ winnerColor, sips });
    setGameStep('results');
  };

  // Trouver le joueur gagnant (objet Player)
  const winnerPlayer = React.useMemo(() => {
    if (!raceResult) return null;
    const winnerId = Object.keys(playerChoices).find(playerId => playerChoices[playerId] === raceResult.winnerColor);
    return selectedPlayers.find(p => p.id === winnerId) || null;
  }, [raceResult, playerChoices, selectedPlayers]);

  const handleReplay = () => {
    setGameStep('playerSelection');
    setSelectedPlayers([]); // Réinitialiser les joueurs sélectionnés
    setPlayerChoices({});
    setRaceResult(null);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Ballon Surprise</h1>

      {gameStep === 'playerSelection' && (
        <PlayerManager 
          onPlayersSelected={handlePlayersSelected} 
          maxPlayers={99}
          hideRemoveButtons={true}
        />
      )}

      {gameStep === 'balloonSelection' && (
        <BalloonSelection players={selectedPlayers} onBalloonsSelected={handleBalloonsSelected} />
      )}

      {gameStep === 'race' && (
        <BalloonRace playerChoices={playerChoices} onRaceFinish={handleRaceFinish} />
      )}

      {gameStep === 'results' && raceResult && (
        <div className="text-center p-6 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">Course Terminée !</h2>
          <p className="text-xl mb-2">
            Le ballon <span className={`font-semibold text-${raceResult.winnerColor}-400`}>{raceResult.winnerColor.toUpperCase()}</span> a gagné !
          </p>
          {winnerPlayer ? (
            <p className="text-lg mb-4">
              Félicitations à <span className="font-bold">{winnerPlayer.name}</span> ! Tu dois distribuer <span className="font-bold text-xl text-amber-500">{raceResult.sips}</span> gorgées.
            </p>
          ) : (
            <p className="text-lg mb-4">
              Personne n&apos;avait choisi le ballon {raceResult.winnerColor}. Pas de chance ! La maison distribue <span className="font-bold text-xl text-amber-500">{raceResult.sips}</span> gorgées (ou pas, selon vos règles).
            </p>
          )}
          
          {/* TODO: Ajouter la logique/composant de distribution des gorgées ici */}
          <Button onClick={handleReplay} className="mt-4">
            Rejouer
          </Button>
        </div>
      )}

      {/* Message temporaire - ajusté */}
      {gameStep !== 'playerSelection' && gameStep !== 'results' && gameStep !== 'balloonSelection' && (
        <p>Étape : {gameStep}</p>
      )}

    </div>
  );
} 