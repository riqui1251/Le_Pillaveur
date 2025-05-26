/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { usePlayers } from '../hooks/usePlayers';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { X, Trophy, Activity, Settings, User } from 'lucide-react';
import { PlayerPreferences, PLAYER_ICONS } from '@/lib/players';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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

interface PlayerManagerProps {
  onPlayersSelected: (selectedPlayers: string[]) => void;
  minPlayers?: number;
  maxPlayers?: number;
  hideRemoveButtons?: boolean;
}

// Fonction pour convertir les classes Tailwind en couleurs CSS
const getColorFromClass = (colorClass: string): string => {
  if (!colorClass.startsWith('bg-')) return colorClass;
  const colorName = colorClass.substring(3);
  return `var(--${colorName})`;
};

// Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l'effet spécial activé)
const isSpecialPlayer = (player: any): boolean => {
  // Si le joueur a explicitement activé l'effet spécial dans ses préférences
  if (player.preferences?.specialEffect) {
    return true;
  }
  
  // Sinon, vérifier si c'est un des noms spéciaux par défaut
  const name = typeof player === 'string' 
    ? player.toLowerCase() 
    : player.name?.toLowerCase();
  return name === 'sim' || name === 'riqui';
};

// Fonction pour obtenir la classe CSS de l'effet spécial
const getSpecialEffectClass = (player: any): string => {
  // Si le joueur a un effet spécial spécifique
  if (player.preferences?.specialEffect) {
    const effect = player.preferences.specialEffect as 'red' | 'blue' | 'rainbow' | 'gold' | 'fire' | 'neon';
    return `special-player-name-${effect}`;
  }
  
  // Pour les joueurs spéciaux par défaut (Sim ou Riqui)
  const name = typeof player === 'string' 
    ? player.toLowerCase() 
    : player.name?.toLowerCase();
  if (name === 'sim' || name === 'riqui') {
    return 'special-player-name-red'; // Effet par défaut pour Sim et Riqui
  }
  
  return '';
};

export function PlayerManager({ onPlayersSelected, minPlayers = 2, maxPlayers = 8, hideRemoveButtons = false }: PlayerManagerProps) {
  const { 
    players, 
    loading, 
    addPlayer, 
    removePlayer, 
    updatePlayerPreferences,
    topPlayers,
    mostActivePlayers,
    getTopPlayersByGame,
    getMostActivePlayersByGame
  } = usePlayers();
  
  const [newPlayerName, setNewPlayerName] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('players');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>();
  const [selectedGame, setSelectedGame] = useState<string>('global');

  // Liste des jeux disponibles
  const availableGames = [
    { id: 'global', name: 'Tous les jeux' },
    { id: 'petit-buveur', name: 'Le Petit Buveur' },
    { id: 'pmu', name: 'PMU' },
  ];

  // Obtenir le classement en fonction du jeu sélectionné
  const gameTopPlayers = selectedGame === 'global' 
    ? topPlayers 
    : getTopPlayersByGame(selectedGame);

  // Obtenir les joueurs les plus actifs en fonction du jeu sélectionné
  const gameMostActivePlayers = selectedGame === 'global'
    ? mostActivePlayers
    : getMostActivePlayersByGame(selectedGame);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    
    addPlayer(newPlayerName.trim());
    setNewPlayerName('');
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev => {
      const isSelected = prev.includes(playerId);
      if (isSelected) {
        return prev.filter(id => id !== playerId);
      } else if (prev.length < maxPlayers) {
        return [...prev, playerId];
      }
      return prev;
    });
    setError(null);
  };

  const handleStartGame = () => {
    if (selectedPlayerIds.length < minPlayers) {
      setError(`Il faut au moins ${minPlayers} joueurs pour commencer`);
      return;
    }
    onPlayersSelected(selectedPlayerIds);
  };

  const handleUpdatePreferences = (playerId: string, preferences: Partial<PlayerPreferences>) => {
    updatePlayerPreferences(playerId, preferences);
  };

  if (loading) {
    return <div>Chargement des joueurs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 shadow-md">
            <h2 className="text-lg md:text-xl font-semibold mb-4">Ajouter un joueur</h2>
            <form onSubmit={handleAddPlayer} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Input
                  type="text"
                  placeholder="Nom du joueur"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="flex-grow"
                />
                <Button 
                  type="submit" 
                  disabled={!newPlayerName.trim() || players.length >= maxPlayers}
                  className="w-full sm:w-auto"
                >
                  Ajouter
                </Button>
              </div>
              {players.length >= maxPlayers && (
                <p className="text-sm text-orange-500 mt-1">Nombre maximum de joueurs atteint ({maxPlayers})</p>
              )}
            </form>
          </Card>

          <Card className="p-4 shadow-md">
            <h2 className="text-lg md:text-xl font-semibold mb-4">Options de partie</h2>
            <div className="space-y-3">
              <Button 
                onClick={handleStartGame} 
                disabled={selectedPlayerIds.length < minPlayers}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium"
              >
                Commencer la partie ({selectedPlayerIds.length}/{minPlayers}+ joueurs)
              </Button>
              {selectedPlayerIds.length < minPlayers && (
                <p className="text-sm text-orange-500 mt-1">Sélectionnez au moins {minPlayers} joueurs</p>
              )}
            </div>
          </Card>
        </div>

        <Tabs defaultValue="players" className="w-full">
          <TabsList className="grid grid-cols-4 max-w-md mx-auto mb-4">
            <TabsTrigger value="players" className="flex items-center gap-1 px-2 md:px-3">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Joueurs</span>
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex items-center gap-1 px-2 md:px-3">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Classement</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1 px-2 md:px-3">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activité</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1 px-2 md:px-3">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Préférences</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {players.map((player) => (
                <Card
                  key={player.id}
                  onClick={() => togglePlayerSelection(player.id)}
                  className={`p-3 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                    selectedPlayerIds.includes(player.id) 
                      ? 'ring-2 ring-amber-500 bg-amber-50/10' 
                      : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className={`h-10 w-10 border-2 bg-${player.preferences.color}-100 border-${player.preferences.color}-500`}>
                      <AvatarFallback className={`bg-${player.preferences.color}-100 text-${player.preferences.color}-700`}>
                        {player.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                      {player.preferences.avatar && (
                        <AvatarImage src={player.preferences.avatar} alt={player.name} />
                      )}
                    </Avatar>
                    <div className="flex-grow">
                      <div className={`font-semibold ${isSpecialPlayer(player) ? getSpecialEffectClass(player) : ''}`}>
                        {player.name}
                      </div>
                      <div className="text-xs opacity-70 flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> {player.stats.wins} victoires
                      </div>
                    </div>
                    {!hideRemoveButtons && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlayer(player.id);
                          setSelectedPlayerIds(prev => prev.filter(id => id !== player.id));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="leaderboard" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Meilleurs joueurs</h3>
              <Select
                value={selectedGame}
                onValueChange={setSelectedGame}
              >
                <SelectTrigger className="w-[180px] shadow-sm">
                  <SelectValue placeholder="Sélectionner un jeu" />
                </SelectTrigger>
                <SelectContent>
                  {availableGames.map(game => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              {gameTopPlayers.length > 0 ? (
                gameTopPlayers.map((player, index) => (
                  <Card key={player.id} className="p-3 card-with-relief">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl font-bold">#{index + 1}</div>
                        <Avatar className={`shadow-sm ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`} style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
                          {player.preferences.avatar ? (
                            <AvatarImage src={player.preferences.avatar} alt={player.name} />
                          ) : (
                            <AvatarFallback style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
                              {player.preferences.icon || player.name[0].toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div>
                          <div className={getSpecialEffectClass(player) || 'font-medium'}>{player.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {selectedGame === 'global' 
                              ? `${player.stats.wins} victoires` 
                              : `${player.stats.gameStats?.[selectedGame]?.wins || 0} victoires en ${player.stats.gameStats?.[selectedGame]?.gamesPlayed || 0} parties`}
                          </div>
                        </div>
                      </div>
                      <Trophy className={`w-6 h-6 ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : 'text-amber-600'}`} />
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Aucune partie jouée pour ce jeu
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Joueurs les plus actifs</h3>
              <Select
                value={selectedGame}
                onValueChange={setSelectedGame}
              >
                <SelectTrigger className="w-[180px] shadow-sm">
                  <SelectValue placeholder="Sélectionner un jeu" />
                </SelectTrigger>
                <SelectContent>
                  {availableGames.map(game => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              {gameMostActivePlayers.length > 0 ? (
                gameMostActivePlayers.map((player, index) => (
                  <Card key={player.id} className="p-3 card-with-relief">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className={`shadow-sm ${isSpecialPlayer(player) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`} style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
                          {player.preferences.avatar ? (
                            <AvatarImage src={player.preferences.avatar} alt={player.name} />
                          ) : (
                            <AvatarFallback style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
                              {player.preferences.icon || player.name[0].toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div>
                          <div className={getSpecialEffectClass(player) || 'font-medium'}>{player.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {selectedGame === 'global'
                              ? `${player.stats.gamesPlayed} parties jouées${player.stats.favoriteGame ? ` • Favori : ${player.stats.favoriteGame}` : ''}`
                              : `${player.stats.gameStats?.[selectedGame]?.gamesPlayed || 0} parties jouées`}
                          </div>
                        </div>
                      </div>
                      <Activity className="w-5 h-5 text-primary" />
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Aucune partie jouée pour ce jeu
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Préférences des joueurs</h3>
            
            <Select
              value={selectedPlayerId}
              onValueChange={setSelectedPlayerId}
            >
              <SelectTrigger className="w-full shadow-sm">
                <SelectValue placeholder="Sélectionnez un joueur" />
              </SelectTrigger>
              <SelectContent className="select-content">
                {players.map(player => (
                  <SelectItem key={player.id} value={player.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className={`player-color-indicator ring-1 ring-border shadow-sm ${isSpecialPlayer(player) ? 'ring-2 ring-red-500' : ''}`}
                        style={{ backgroundColor: getColorFromClass(player.preferences.color) }}
                      />
                      <span className={getSpecialEffectClass(player) || ''}>{player.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedPlayerId && (
              <div className="mt-4 space-y-4">
                {players.filter(p => p.id === selectedPlayerId).map(player => (
                  <Card key={player.id} className="p-4 card-with-relief">
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="shadow-md" style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
                          <AvatarFallback style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
                            {player.preferences.icon || player.name[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{player.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {player.preferences.nickname || 'Pas de surnom'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Couleur</label>
                        <div className="grid grid-cols-6 gap-2">
                          {['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
                            'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
                            'bg-teal-500', 'bg-cyan-500', 'bg-rose-500', 'bg-emerald-500'].map(color => (
                            <div
                              key={color}
                              className={`h-8 rounded-md cursor-pointer shadow-sm ${
                                player.preferences.color === color ? 'ring-2 ring-primary' : 'ring-1 ring-border'
                              }`}
                              style={{ backgroundColor: getColorFromClass(color) }}
                              onClick={() => handleUpdatePreferences(player.id, { color })}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Icône</label>
                        <div className="grid grid-cols-8 gap-2">
                          {PLAYER_ICONS.map(icon => (
                            <Button
                              key={icon}
                              variant="outline"
                              className={`h-10 w-10 p-0 text-lg shadow-sm ${
                                player.preferences.icon === icon ? 'ring-2 ring-primary bg-primary/20' : ''
                              }`}
                              onClick={() => handleUpdatePreferences(player.id, { icon })}
                            >
                              {icon}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Surnom</label>
                        <Input
                          placeholder="Surnom"
                          value={player.preferences.nickname || ''}
                          onChange={(e) => handleUpdatePreferences(player.id, { 
                            nickname: e.target.value 
                          })}
                          className="w-full shadow-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium mb-2 flex items-center justify-between">
                          <span>Effet spécial</span>
                        </label>
                        
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          <Button
                            type="button"
                            variant={!player.preferences.specialEffect ? "default" : "outline"}
                            className="w-full"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: null })}
                          >
                            Aucun
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'red' ? "default" : "outline"}
                            className="w-full special-player-name-red"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'red' })}
                          >
                            Rouge
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'blue' ? "default" : "outline"}
                            className="w-full special-player-name-blue"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'blue' })}
                          >
                            Bleu
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'rainbow' ? "default" : "outline"}
                            className="w-full special-player-name-rainbow"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'rainbow' })}
                          >
                            Arc-en-ciel
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'gold' ? "default" : "outline"}
                            className="w-full special-player-name-gold"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'gold' })}
                          >
                            Or
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'fire' ? "default" : "outline"}
                            className="w-full special-player-name-fire"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'fire' })}
                          >
                            Feu
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'neon' ? "default" : "outline"}
                            className="w-full special-player-name-neon"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'neon' })}
                          >
                            Néon
                          </Button>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mt-1">
                          Applique un effet de dégradé au nom du joueur.
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 