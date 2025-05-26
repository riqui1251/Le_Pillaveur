"use client"

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer } from '@/lib/players'
import { usePlayers } from '@/hooks/usePlayers'

// Ajouter un style CSS pour les différentes animations de dégradé
const specialPlayerNameStyle = `
  @keyframes gradientFlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  @keyframes pulseAnimation {
    0% { opacity: 0.5; }
    50% { opacity: 1; }
    100% { opacity: 0.5; }
  }
  
  .pulse-animation {
    animation: pulseAnimation 2s infinite;
  }
  
  /* Effet rouge */
  .special-player-name-red {
    background: linear-gradient(90deg, #ff0000, #ff6b6b, #ff0000);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 0, 0, 0.3);
  }
  
  /* Effet bleu */
  .special-player-name-blue {
    background: linear-gradient(90deg, #0066ff, #00ccff, #0066ff);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(0, 102, 255, 0.3);
  }
  
  /* Effet arc-en-ciel */
  .special-player-name-rainbow {
    background: linear-gradient(90deg, #ff0000, #ffa500, #ffff00, #00ff00, #0000ff, #4b0082, #ee82ee, #ff0000);
    background-size: 400% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 6s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
  }
  
  /* Effet or */
  .special-player-name-gold {
    background: linear-gradient(90deg, #ffd700, #ffcc00, #ffdb58, #ffd700);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
  }
  
  /* Effet feu */
  .special-player-name-fire {
    background: linear-gradient(90deg, #ff4500, #ff8c00, #ff4500);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 2s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 8px rgba(255, 69, 0, 0.7);
  }
  
  /* Effet néon */
  .special-player-name-neon {
    background: linear-gradient(90deg, #00ff00, #66ff66, #00ff00);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(0, 255, 0, 0.8);
  }
  
  /* Pour la rétrocompatibilité */
  .special-player-name {
    background: linear-gradient(90deg, #ff0000, #ff6b6b, #ff0000);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 0, 0, 0.3);
  }
`

interface Horse {
  name: string
  position: number
  color: string
  players: BasePlayer[]
}

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
}

export default function Game({ players: initialPlayers, onGameEnd }: GameProps) {
  const [horses, setHorses] = useState<Horse[]>([
    { name: '🐎 Tonnerre', position: 0, color: 'bg-red-500', players: [] },
    { name: '🐎 Éclair', position: 0, color: 'bg-blue-500', players: [] },
    { name: '🐎 Tempête', position: 0, color: 'bg-green-500', players: [] },
    { name: '🐎 Ouragan', position: 0, color: 'bg-yellow-500', players: [] },
  ])
  const [gameStarted, setGameStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState<Horse | null>(null)
  const [interval, setIntervalId] = useState<NodeJS.Timeout | null>(null)
  const finishLine = 100
  const { updatePlayerStats } = usePlayers();
  const [selectedPlayer, setSelectedPlayer] = useState<BasePlayer | null>(null);
  
  // Référence aux joueurs initiaux pour les utiliser dans tout le composant
  const initialPlayersRef = useRef(initialPlayers);

  // Fonction pour vérifier si un joueur est assigné à un cheval
  const isPlayerAssigned = (player: BasePlayer) => {
    return horses.some(horse => horse.players.some(p => p.id === player.id))
  }

  // Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l&apos;effet spécial activé)
  const isSpecialPlayer = (player: BasePlayer): boolean => {
    // Si le joueur a explicitement activé l&apos;effet spécial dans ses préférences
    if (player.preferences?.specialEffect) {
      return true;
    }
    
    // Sinon, vérifier si c&apos;est un des noms spéciaux par défaut
    const name = player.name?.toLowerCase();
    return name === 'sim' || name === 'riqui';
  }

  // Fonction pour obtenir la classe CSS de l'effet spécial
  const getSpecialEffectClass = (player: BasePlayer): string => {
    // Si le joueur a un effet spécial spécifique
    if (player.preferences?.specialEffect) {
      const effect = player.preferences.specialEffect as 'red' | 'blue' | 'rainbow' | 'gold' | 'fire' | 'neon';
      return `special-player-name-${effect}`;
    }
    
    // Pour les joueurs spéciaux par défaut (Sim ou Riqui)
    const name = player.name?.toLowerCase();
    if (name === 'sim' || name === 'riqui') {
      return 'special-player-name-red'; // Effet par défaut pour Sim et Riqui
    }
    
    return '';
  }

  const addPlayerToHorse = (horseIndex: number, player: BasePlayer) => {
    if (!player || typeof horseIndex !== 'number' || horseIndex < 0 || horseIndex >= horses.length) {
      console.error('Paramètres invalides pour addPlayerToHorse:', { horseIndex, player });
      return;
    }

    console.log('Ajout du joueur au cheval:', player.name, 'Index du cheval:', horseIndex);
    
    setHorses(prevHorses => {
      try {
        // Vérifier si le joueur est déjà assigné à un cheval
        const playerCurrentHorse = prevHorses.find(h => h.players.some(p => p.id === player.id));
        if (playerCurrentHorse) {
          console.log('Le joueur est déjà assigné à un cheval, on le déplace');
          // Si oui, le retirer de ce cheval
          const updatedHorses = prevHorses.map(h => ({
            ...h,
            players: h.players.filter(p => p.id !== player.id)
          }));
          // Et l&apos;ajouter au nouveau cheval
          updatedHorses[horseIndex].players.push(player);
          return updatedHorses;
        } else {
          console.log('Le joueur n&apos;était pas assigné, on l&apos;ajoute au cheval');
          // Si non, l&apos;ajouter simplement au cheval sélectionné
          return prevHorses.map((horse, index) => 
            index === horseIndex
              ? { ...horse, players: [...horse.players, player] }
              : horse
          );
        }
      } catch (error) {
        console.error('Erreur lors de l&apos;ajout du joueur au cheval:', error);
        return prevHorses; // En cas d&apos;erreur, ne pas changer l&apos;état
      }
    });
  }

  const removePlayerFromHorse = (horseIndex: number, playerToRemove: BasePlayer) => {
    if (!playerToRemove || typeof horseIndex !== 'number' || horseIndex < 0 || horseIndex >= horses.length) {
      console.error('Paramètres invalides pour removePlayerFromHorse:', { horseIndex, playerToRemove });
      return;
    }

    console.log('Retrait du joueur du cheval:', playerToRemove.name, 'Index du cheval:', horseIndex);
    
    setHorses(prevHorses => prevHorses.map((horse, index) => {
      if (index === horseIndex) {
        return {
          ...horse,
          players: horse.players.filter(player => player.id !== playerToRemove.id)
        }
      }
      return horse
    }))
  }

  // Modifier ces fonctions pour gérer la sélection des joueurs de manière uniforme
  const handlePlayerSelect = (player: BasePlayer) => {
    // Utiliser la même logique pour mobile et ordinateur
    setSelectedPlayer(prev => prev?.id === player.id ? null : player);
  };

  const handleHorseSelect = (horseIndex: number) => {
    if (selectedPlayer) {
      const player = selectedPlayer;
      
      // Vérifier si le joueur est déjà assigné à un autre cheval
      const horseWithPlayer = horses.findIndex(h => 
        h.players.some(p => p.id === player.id)
      );
      
      // Si le joueur est déjà assigné, le retirer de ce cheval
      if (horseWithPlayer !== -1) {
        removePlayerFromHorse(horseWithPlayer, player);
      }
      
      // Ajouter le joueur au cheval sélectionné
      addPlayerToHorse(horseIndex, player);
      
      // Réinitialiser le joueur sélectionné
      setSelectedPlayer(null);
    }
  };

  const resetGame = () => {
    if (interval) {
      clearInterval(interval)
      setIntervalId(null) // Réinitialiser l'ID de l'intervalle
    }
    setHorses(prevHorses => prevHorses.map(horse => ({ ...horse, position: 0 })))
    setGameStarted(false)
    setGameOver(false)
    setWinner(null)
  }

  const startRace = () => {
    // Vérifier si une course est déjà en cours
    if (interval) {
      clearInterval(interval)
      setIntervalId(null)
    }
    
    setGameStarted(true)
    
    const raceInterval = setInterval(() => {
      setHorses(prevHorses => {
        const updatedHorses = prevHorses.map(horse => ({
          ...horse,
          position: horse.position + Math.random() * 2
        }))

        const winner = updatedHorses.find(horse => horse.position >= finishLine)
        if (winner) {
          clearInterval(raceInterval)
          setIntervalId(null) // Réinitialiser l'ID de l'intervalle quand la course est terminée
          setGameOver(true)
          setWinner(winner)
          
          // Mettre à jour les statistiques des joueurs gagnants
          if (winner.players.length > 0) {
            winner.players.forEach(player => {
              updatePlayerStats(player.id, 'pmu', { wins: 1 });
            });
          }
          
          // Mettre à jour les statistiques de tous les joueurs participants
          initialPlayersRef.current.forEach(player => {
            // Si le joueur n'est pas dans l'équipe gagnante, on met à jour ses stats sans victoire
            if (!winner.players.some(p => p.id === player.id)) {
              updatePlayerStats(player.id, 'pmu', { wins: 0 });
            }
          });
        }

        return updatedHorses
      })
    }, 50)

    setIntervalId(raceInterval)
  }

  useEffect(() => {
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [interval])

  if (!gameStarted) {
    const totalPlayers = horses.reduce((sum, horse) => sum + horse.players.length, 0)
    const unassignedPlayers = initialPlayersRef.current.filter(player => !isPlayerAssigned(player))

    return (
      <div className="min-h-fit bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
        {/* Ajouter le style CSS pour l'animation */}
        <style jsx>{specialPlayerNameStyle}</style>
        
        <div className="max-w-4xl mx-auto bg-white/10 backdrop-blur-sm rounded-xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-4 relative">
            <div className="absolute left-0 top-0">
              <Button 
                onClick={onGameEnd}
                variant="ghost" 
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                ← Retour
              </Button>
            </div>
            <h2 className="text-3xl font-bold text-white">Course PMU</h2>
            <p className="text-lg text-gray-300">Choisissez votre cheval et que le meilleur gagne ! Les gagnants donnent le double des gorgées qu&apos;ils ont au préalable bu.</p>
          </div>

          {/* Instructions d'utilisation - uniformisées */}
          <div className="p-4 border border-white/20 rounded-lg bg-white/5 mb-4">
            <h3 className="font-medium mb-2 text-white">Comment jouer :</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-1">
              <li>Pour assigner un joueur à un cheval, <strong>sélectionnez d&apos;abord le joueur</strong> puis cliquez sur le cheval de votre choix</li>
              <li>Pour changer un joueur de cheval, sélectionnez-le puis cliquez sur un autre cheval</li>
              <li>Pour retirer un joueur d&apos;un cheval, cliquez sur le <strong>×</strong> à côté de son nom</li>
            </ul>
          </div>

          {/* Affichage des joueurs sélectionnés */}
          {unassignedPlayers.length > 0 && (
            <div className="sticky top-2 z-10 p-4 border border-white/20 rounded-lg bg-gradient-to-r from-slate-800/95 to-slate-900/95 backdrop-blur mb-4 shadow-lg">
              <h3 className="font-medium mb-3 text-white">Joueurs à assigner (cliquez pour sélectionner) :</h3>
              <div className="flex flex-wrap gap-2">
                {unassignedPlayers.map(player => (
                  <div
                    key={player.id}
                    className={`${player.preferences.color} p-3 rounded-lg flex items-center gap-2 cursor-pointer hover:brightness-110 transition-all shadow-md ${selectedPlayer?.id === player.id ? 'ring-2 ring-white pulse-animation' : ''}`}
                    onClick={() => handlePlayerSelect(player)}
                  >
                    <Avatar className={`h-8 w-8 border-2 ${isSpecialPlayer(player) ? 'border-red-500 shadow-lg shadow-red-500/50' : 'border-white/20'}`}>
                      <AvatarFallback className="text-white">
                        {player.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className={getSpecialEffectClass(player) || 'text-white font-medium'}>
                      {player.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {horses.map((horse, index) => (
              <div
                key={index}
                className={`p-4 border-2 border-dashed border-white/30 rounded-lg 
                  ${selectedPlayer ? 'hover:bg-white/20 active:bg-white/30 cursor-pointer' : 'bg-white/5'} 
                  ${selectedPlayer ? 'bg-white/10' : 'bg-white/5'}
                  transition-colors`}
                onClick={() => handleHorseSelect(index)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-4">
                    <div className={`w-6 h-6 rounded-full ${horse.color}`}></div>
                    <span className="text-lg font-medium text-white">{horse.name}</span>
                  </div>
                </div>
                
                {horse.players.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-sm text-gray-400">Joueurs :</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {horse.players.map(player => (
                        <div
                          key={player.id}
                          className={`${player.preferences.color} px-2 py-1 rounded flex items-center gap-2 cursor-pointer hover:brightness-110 transition-all`}
                          onClick={() => handlePlayerSelect(player)}
                        >
                          <Avatar className={`h-6 w-6 ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-sm shadow-red-500/50' : 'border border-white/20'}`}>
                            <AvatarFallback className="text-white text-xs">
                              {player.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className={getSpecialEffectClass(player) || 'text-white'}>
                            {player.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removePlayerFromHorse(index, player);
                            }}
                            className="text-white/70 hover:text-white ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 py-3 border border-dashed border-white/20 rounded bg-white/5 flex items-center justify-center pulse-animation">
                    <p className="text-gray-400 text-sm">
                      {selectedPlayer 
                        ? "Cliquez ici pour placer le joueur sélectionné" 
                        : "Sélectionnez d&apos;abord un joueur puis cliquez ici"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button 
            onClick={startRace} 
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-medium py-2"
            disabled={totalPlayers === 0}
          >
            {totalPlayers === 0 ? "Assignez des joueurs aux chevaux pour commencer" : "Démarrer la course"}
          </Button>
          
          {/* Si personne n'est encore assigné mais qu'il y a des joueurs */}
          {unassignedPlayers.length === 0 && totalPlayers > 0 && (
            <div className="mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-center">
              <p className="text-green-400">
                Tous les joueurs sont assignés ! Vous pouvez maintenant démarrer la course.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (gameOver && winner) {
    return (
      <div className="min-h-fit bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
        {/* Ajouter le style CSS pour l'animation */}
        <style jsx>{specialPlayerNameStyle}</style>
        
        <div className="max-w-4xl mx-auto bg-white/10 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center space-y-6">
          <h2 className="text-3xl font-bold text-white">Course terminée !</h2>
          <div className="text-xl">
            <p className="text-white">🏆 {winner.name} a gagné !</p>
            {winner.players.length > 0 && (
              <div className="mt-4">
                <p className="text-lg text-gray-300">
                  {winner.players.length === 1 ? 'Le gagnant' : 'Les gagnants'}{' '}
                  <span className="font-medium">
                    {winner.players.map((p, index) => (
                      <span key={p.id} className={getSpecialEffectClass(p) || 'text-white'}>
                        {p.name}{index < winner.players.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>{' '}
                  {`distribue${winner.players.length === 1 ? '' : 'nt'} le double de ${winner.players.length === 1 ? 'ses' : 'leurs'} gorgées !`}
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-center gap-4">
            <Button onClick={resetGame}>Nouvelle course</Button>
            <Button onClick={onGameEnd} variant="outline">Retour au menu</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-fit bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* Ajouter le style CSS pour l'animation */}
      <style jsx>{specialPlayerNameStyle}</style>
      
      <div className="max-w-4xl mx-auto bg-white/10 backdrop-blur-sm rounded-xl shadow-2xl p-8">
        <div className="relative h-80 border-r-4 border-dashed border-white/50">
          {/* Lignes de séparation avec clôtures */}
          {[0, 1, 2, 3, 4].map((line) => (
            <div
              key={line}
              className="absolute w-full"
              style={{ top: `${line * 25}%`, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
            >
              {/* Clôtures */}
              <div className="absolute inset-0 flex items-center justify-between px-2">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-3 h-6 relative"
                  >
                    <div className="absolute w-full h-1 bg-white/20 top-0"></div>
                    <div className="absolute w-1 h-full bg-white/20 left-0"></div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {horses.map((horse, index) => (
            <motion.div
              key={index}
              className="absolute w-full h-[25%] flex items-center"
              style={{ top: `${index * 25}%` }}
              animate={{ x: `${horse.position}%` }}
              transition={{ type: 'spring', damping: 20 }}
            >
              <div className="flex items-center space-x-2 pl-2">
                <div className={`w-4 h-4 rounded-full ${horse.color} shadow-lg`}></div>
                <span className="text-2xl text-white drop-shadow-lg">{horse.name}</span>
                {horse.players.length > 0 && (
                  <span className="text-sm text-gray-400">
                    (
                    {horse.players.map((p, idx) => (
                      <span key={p.id} className={getSpecialEffectClass(p) || ''}>
                        {p.name}{idx < horse.players.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    )
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
} 