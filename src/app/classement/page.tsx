"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Trophy, Medal, Award, Star, Crown } from 'lucide-react'
import { Player } from '@/lib/players'
import useScreenSize from '@/hooks/useScreenSize'

// Ajouter un style CSS pour les différentes animations de dégradé
const specialPlayerNameStyle = `
  @keyframes gradientFlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
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

// Définition des jeux disponibles
interface Game {
  id: string;
  name: string;
  icon: string;
}

const gamesList: Game[] = [
  { id: 'petit-buveur', name: 'Le Petit Buveur', icon: '🍺' },
  { id: 'pmu', name: 'PMU', icon: '🏇' },
  { id: 'hi-lo', name: 'Hi/Lo', icon: '🃏' }
];

export default function ClassementPage() {
  const { players, topPlayers, mostActivePlayers } = usePlayers()
  const [activeTab, setActiveTab] = useState('global')
  const { isMobile } = useScreenSize();

  // Fonction pour obtenir les meilleurs joueurs par jeu
  const getTopPlayersByGame = (gameId: string, limit: number = 5) => {
    return [...players]
      .filter(player => player.stats.gameStats?.[gameId]?.wins)
      .sort((a, b) => (b.stats.gameStats?.[gameId]?.wins || 0) - (a.stats.gameStats?.[gameId]?.wins || 0))
      .slice(0, limit)
  }

  // Fonction pour obtenir la couleur de l'avatar
  const getColorFromClass = (colorClass: string): string => {
    const colorMap: Record<string, string> = {
      'red': '#ef4444',
      'blue': '#3b82f6',
      'green': '#22c55e',
      'yellow': '#eab308',
      'purple': '#a855f7',
      'pink': '#ec4899',
      'indigo': '#6366f1',
      'orange': '#f97316',
      'teal': '#14b8a6',
      'cyan': '#06b6d4',
    };
    return colorMap[colorClass] || '#9ca3af';
  }

  // Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l'effet spécial activé)
  const isSpecialPlayer = (player: Player): boolean => {
    if (!player) return false;
    return !!player.preferences.specialEffect;
  };

  // Fonction pour rendre un badge de position
  const renderPositionBadge = (position: number) => {
    if (position === 1) return <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 rounded-full p-1"><Crown className="h-5 w-5" /></div>;
    if (position === 2) return <div className="absolute -top-2 -right-2 bg-gray-300 text-gray-700 rounded-full p-1"><Award className="h-5 w-5" /></div>;
    if (position === 3) return <div className="absolute -top-2 -right-2 bg-amber-700 text-amber-100 rounded-full p-1"><Medal className="h-5 w-5" /></div>;
    
    return null;
  }

  // Fonction pour obtenir la classe CSS de l'effet spécial
  const getSpecialEffectClass = (player: Player): string => {
    if (!player?.preferences?.specialEffect) return '';
    
    return `special-player-name-${player.preferences.specialEffect}`;
  };

  // Fonction pour calculer le total des victoires d'un joueur
  const calculateTotalWins = (player: Player): number => {
    return player.stats.wins || 0;
  };

  // Fonction pour calculer le total des parties jouées d'un joueur
  const calculateTotalGamesPlayed = (player: Player): number => {
    return player.stats.gamesPlayed || 0;
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Ajouter le style CSS pour l'animation */}
      <style jsx>{specialPlayerNameStyle}</style>
      
      <h1 className="text-3xl font-bold text-center mb-8">Classement des Joueurs</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`${isMobile ? 'flex flex-wrap gap-1 mb-6' : 'grid grid-cols-5 mb-6'}`}>
          <TabsTrigger value="global" className={`flex items-center gap-1 ${isMobile ? 'flex-grow' : ''}`}>
            <Trophy className="h-4 w-4" />
            Global
          </TabsTrigger>
          {gamesList.map((game) => (
            <TabsTrigger 
              key={game.id} 
              value={game.id} 
              className={`flex items-center gap-1 ${isMobile ? 'flex-grow text-xs py-1 px-2' : ''}`}
            >
              <span>{game.icon}</span>
              {isMobile ? game.name.split(' ')[0] : game.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="global" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Meilleurs Joueurs
              </CardTitle>
              <CardDescription>
                Classement des joueurs avec le plus de victoires tous jeux confondus
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topPlayers.length > 0 ? (
                  topPlayers.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8">
                          {renderPositionBadge(index)}
                        </div>
                        <Avatar className={`${getColorFromClass(player.preferences.color)} h-10 w-10 ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                          {player.preferences.avatar ? (
                            <AvatarImage src={player.preferences.avatar} alt={player.name} />
                          ) : (
                            <AvatarFallback>{player.preferences.icon || player.name[0].toUpperCase()}</AvatarFallback>
                          )}
                        </Avatar>
                        <div>
                          <div className={getSpecialEffectClass(player) || 'font-medium'}>{player.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {calculateTotalWins(player)} victoires • {calculateTotalGamesPlayed(player)} parties
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Trophy className="h-5 w-5" />
                        <span className="font-bold">{calculateTotalWins(player)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-6 text-muted-foreground">
                    Aucun joueur n&apos;a encore remporté de victoire
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-blue-500" />
                Joueurs les Plus Actifs
              </CardTitle>
              <CardDescription>
                Classement des joueurs ayant participé au plus grand nombre de parties
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mostActivePlayers.length > 0 ? (
                  mostActivePlayers.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8">
                          {renderPositionBadge(index)}
                        </div>
                        <Avatar className={`${getColorFromClass(player.preferences.color)} h-10 w-10 ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                          {player.preferences.avatar ? (
                            <AvatarImage src={player.preferences.avatar} alt={player.name} />
                          ) : (
                            <AvatarFallback>{player.preferences.icon || player.name[0].toUpperCase()}</AvatarFallback>
                          )}
                        </Avatar>
                        <div>
                          <div className={getSpecialEffectClass(player) || 'font-medium'}>{player.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {calculateTotalGamesPlayed(player)} parties jouées
                            {player.stats.favoriteGame && ` • Jeu favori: ${
                              gamesList.find((g: Game) => g.id === player.stats.favoriteGame)?.name || player.stats.favoriteGame
                            }`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-blue-500">
                        <Star className="h-5 w-5" />
                        <span className="font-bold">{calculateTotalGamesPlayed(player)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-6 text-muted-foreground">
                    Aucun joueur n&apos;a encore participé à une partie
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {gamesList.map((game) => (
          <TabsContent key={game.id} value={game.id} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{game.icon}</span>
                  Meilleurs Joueurs - {game.name}
                </CardTitle>
                <CardDescription>
                  Classement des joueurs avec le plus de victoires à {game.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getTopPlayersByGame(game.id, 5).length > 0 ? (
                    getTopPlayersByGame(game.id, 5).map((player, index) => (
                      <div key={player.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8">
                            {renderPositionBadge(index)}
                          </div>
                          <Avatar className={`${getColorFromClass(player.preferences.color)} h-10 w-10 ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                            {player.preferences.avatar ? (
                              <AvatarImage src={player.preferences.avatar} alt={player.name} />
                            ) : (
                              <AvatarFallback>{player.preferences.icon || player.name[0].toUpperCase()}</AvatarFallback>
                            )}
                          </Avatar>
                          <div>
                            <div className={getSpecialEffectClass(player) || 'font-medium'}>{player.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {player.stats.gameStats?.[game.id]?.wins || 0} victoires • {player.stats.gameStats?.[game.id]?.gamesPlayed || 0} parties
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-500">
                          <Trophy className="h-5 w-5" />
                          <span className="font-bold">{player.stats.gameStats?.[game.id]?.wins || 0}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-6 text-muted-foreground">
                      Aucun joueur n&apos;a encore remporté de victoire à ce jeu
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {game.id === 'petit-buveur' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>🍻</span>
                    Champions de la Boisson - {game.name}
                  </CardTitle>
                  <CardDescription>
                    Classement des joueurs ayant bu le plus de gorgées
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[...players]
                      .filter(p => p.stats.gameStats?.[game.id]?.totalDrinks)
                      .sort((a, b) => (b.stats.gameStats?.[game.id]?.totalDrinks || 0) - (a.stats.gameStats?.[game.id]?.totalDrinks || 0))
                      .slice(0, 5)
                      .map((player, index) => (
                        <div key={player.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8">
                              {renderPositionBadge(index)}
                            </div>
                            <Avatar className={`${getColorFromClass(player.preferences.color)} h-10 w-10 ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                              {player.preferences.avatar ? (
                                <AvatarImage src={player.preferences.avatar} alt={player.name} />
                              ) : (
                                <AvatarFallback>{player.preferences.icon || player.name[0].toUpperCase()}</AvatarFallback>
                              )}
                            </Avatar>
                            <div>
                              <div className={getSpecialEffectClass(player)}>{player.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {player.stats.gameStats?.[game.id]?.totalDrinks || 0} gorgées bues
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-amber-500">
                            <span className="text-xl">🍺</span>
                            <span className="font-bold">{player.stats.gameStats?.[game.id]?.totalDrinks || 0}</span>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </CardContent>
              </Card>
            )}

            {game.id === 'hi-lo' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>🃏</span>
                    Champions de la Boisson - {game.name}
                  </CardTitle>
                  <CardDescription>
                    Classement des joueurs ayant bu le plus de gorgées au jeu de cartes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[...players]
                      .filter(p => p.stats.gameStats?.[game.id]?.totalDrinks)
                      .sort((a, b) => (b.stats.gameStats?.[game.id]?.totalDrinks || 0) - (a.stats.gameStats?.[game.id]?.totalDrinks || 0))
                      .slice(0, 5)
                      .map((player, index) => (
                        <div key={player.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8">
                              {renderPositionBadge(index)}
                            </div>
                            <Avatar className={`${getColorFromClass(player.preferences.color)} h-10 w-10 ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                              {player.preferences.avatar ? (
                                <AvatarImage src={player.preferences.avatar} alt={player.name} />
                              ) : (
                                <AvatarFallback>{player.preferences.icon || player.name[0].toUpperCase()}</AvatarFallback>
                              )}
                            </Avatar>
                            <div>
                              <div className={getSpecialEffectClass(player)}>{player.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {player.stats.gameStats?.[game.id]?.totalDrinks || 0} gorgées bues • {' '}
                                {player.stats.gameStats?.[game.id]?.gamesPlayed || 0} parties
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-amber-500">
                            <span className="text-xl">🍺</span>
                            <span className="font-bold">{player.stats.gameStats?.[game.id]?.totalDrinks || 0}</span>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
} 