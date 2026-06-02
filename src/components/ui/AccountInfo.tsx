/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect } from 'react';
import { Trash2, User, Settings, Shield, Calendar, Gamepad2, BarChart3, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlayers } from '@/hooks/usePlayers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils';
import { Player } from '@/lib/players';
import { getSafeStorage } from '@/lib/storage';



interface AccountInfoProps {
  onLogout: () => void;
}

export function AccountInfo({ onLogout }: AccountInfoProps) {
  const { 
    players, 
    loading, 
    removePlayer 
  } = usePlayers();
  
  const [totalGames, setTotalGames] = useState(0);
  const [totalDrinks, setTotalDrinks] = useState(0);

  // Calculer le nombre total de parties jouées et de gorgées bues
  useEffect(() => {
    // Charger les statistiques
    const storage = getSafeStorage();
    const storedGames = storage?.getItem('games') ?? null;
    const games = storedGames ? JSON.parse(storedGames) : [];
    
    // Si games n'existe pas, calculer à partir des statistiques des joueurs
    if (games.length === 0 && players.length > 0) {
      const totalGamesPlayed = players.reduce((total, player) => {
        return total + (player.stats.gamesPlayed || 0);
      }, 0);
      setTotalGames(totalGamesPlayed);
    } else {
      setTotalGames(games.length);
    }

    // Calculer le total des gorgées bues
    const totalDrinksCount = players.reduce((total, player) => {
      return total + (player.stats.totalDrinks || 0);
    }, 0);
    setTotalDrinks(totalDrinksCount);
  }, [players]);

  // Formatage de date pour l'affichage
  const formatDate = (timestamp: number) => {
    if (!timestamp) return "Jamais";
    const date = new Date(timestamp);
    return date.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Obtenir le nom du jeu favori
  const getFavoriteGameName = (gameId?: string) => {
    if (!gameId) return 'Aucun';
    
    const gameNames: {[key: string]: string} = {
      'hi-lo': 'Hi/Lo',
      'petit-buveur': 'Le Petit Buveur',
      'pmu': 'PMU',
      'roulette': 'Roulette'
    };
    
    return gameNames[gameId] || gameId;
  };



  if (loading) {
    return <div className="flex justify-center items-center p-6">Chargement...</div>;
  }

  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">Gestion du compte</h1>
        <Button 
          variant="outline"
          onClick={onLogout}
          className="border-red-500 text-red-500 hover:bg-red-500/10"
        >
          Se déconnecter
        </Button>
      </div>
      
      <Separator />
      
      {/* Section des statistiques globales */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-gray-900 to-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-400" />
            Statistiques globales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800/50 p-4 rounded-lg text-center">
              <h3 className="text-3xl font-bold text-purple-400">{players.length}</h3>
              <p className="text-gray-400">Joueurs</p>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-lg text-center">
              <h3 className="text-3xl font-bold text-blue-400">{totalGames}</h3>
              <p className="text-gray-400">Parties jouées</p>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-lg text-center">
              <h3 className="text-3xl font-bold text-amber-400">{totalDrinks}</h3>
              <p className="text-gray-400">Gorgées bues</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Section de gestion des joueurs */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-gray-900 to-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-400" />
            Gestion des joueurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {players.length === 0 ? (
              <div className="bg-gray-800/50 p-6 rounded-lg text-center">
                <p className="text-gray-400">Aucun joueur enregistré</p>
              </div>
            ) : (
              players.map(player => (
                <div 
                  key={player.id}
                  className="flex items-center justify-between p-4 rounded-lg transition-all duration-300 hover:scale-[1.01]"
                  style={{ 
                    backgroundColor: player.preferences.color,
                    boxShadow: isSpecialPlayer(player) ? `0 0 15px ${player.preferences.color}` : 'none'
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg">
                      {player.preferences.icon || player.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className={getSpecialEffectClass(player) || 'player-name-default'}>
                        {player.name}
                      </span>
                      <div className="flex items-center gap-2 text-xs opacity-80">
                        <span>{player.stats.gamesPlayed} parties</span>
                        <span>•</span>
                        <span>{player.stats.wins} victoires</span>
                        {player.stats.favoriteGame && (
                          <>
                            <span>•</span>
                            <span className="flex items-center">
                              <Gamepad2 className="h-3 w-3 mr-1" />
                              {getFavoriteGameName(player.stats.favoriteGame)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {player.stats.lastPlayed && (
                      <Badge variant="outline" className="bg-black/20 text-white border-none">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(player.stats.lastPlayed).toLocaleDateString('fr-FR')}
                      </Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removePlayer(player.id)}
                      className="hover:bg-white/10 text-white"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Section des paramètres du compte */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-gray-900 to-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-green-400" />
            Paramètres du compte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-800/50 p-4 rounded-lg">
            <p className="text-gray-400">Les données sont stockées localement sur votre appareil.</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Section de synchronisation */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-gray-900 to-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            Synchronisation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-800/50 p-4 rounded-lg flex items-center">
            <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center mr-2">
              <span className="text-black font-bold">!</span>
            </div>
            <p className="text-gray-400">La synchronisation entre appareils n'est pas encore disponible.</p>
          </div>
        </CardContent>
      </Card>


    </div>
  );
} 