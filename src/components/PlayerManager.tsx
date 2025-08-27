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
import { GAMES } from '@/lib/games'
import { getColorFromClass, isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils';

// Ajouter un style CSS pour les différentes animations de dégradé
const specialPlayerNameStyle = `
  @keyframes gradientFlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  @keyframes sparkle {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  @keyframes lightning {
    0%, 90%, 100% { opacity: 1; }
    5%, 85% { opacity: 0.3; }
  }
  
  @keyframes matrix {
    0% { text-shadow: 0 0 5px #00ff00, 0 0 10px #00ff00, 0 0 15px #00ff00; }
    50% { text-shadow: 0 0 10px #00ff00, 0 0 20px #00ff00, 0 0 30px #00ff00; }
    100% { text-shadow: 0 0 5px #00ff00, 0 0 10px #00ff00, 0 0 15px #00ff00; }
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
  
  /* Effet glace */
  .special-player-name-ice {
    background: linear-gradient(90deg, #00ffff, #87ceeb, #00ffff);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 4s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.8);
  }
  
  /* Effet éclair */
  .special-player-name-lightning {
    background: linear-gradient(90deg, #ffff00, #ffd700, #ffff00);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: lightning 1s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 15px rgba(255, 255, 0, 0.9);
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
  
  /* Effet néon */
  .special-player-name-neon {
    background: linear-gradient(90deg, #ff00ff, #ff69b4, #ff00ff);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(255, 0, 255, 0.8);
  }
  
  /* Effet galaxie */
  .special-player-name-galaxy {
    background: linear-gradient(90deg, #4b0082, #8a2be2, #9370db, #4b0082);
    background-size: 300% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 5s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 12px rgba(75, 0, 130, 0.8);
  }
  
  /* Effet matrix */
  .special-player-name-matrix {
    color: #00ff00;
    animation: matrix 2s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px #00ff00;
  }
  
  /* Effet coucher de soleil */
  .special-player-name-sunset {
    background: linear-gradient(90deg, #ff6b35, #f7931e, #ffd23f, #ff6b35);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 4s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 8px rgba(255, 107, 53, 0.6);
  }
  
  /* Effet océan */
  .special-player-name-ocean {
    background: linear-gradient(90deg, #006994, #0099cc, #00bfff, #006994);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(0, 105, 148, 0.7);
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
  hideRemoveButtons?: boolean;
}



export function PlayerManager({ onPlayersSelected, minPlayers = 2, hideRemoveButtons = false }: PlayerManagerProps) {
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
  const [bulkNames, setBulkNames] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('players');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>();
  const [selectedGame, setSelectedGame] = useState<string>('global');

  // Liste des jeux disponibles
  const availableGames = [
    { id: 'global', name: 'Tous les jeux' },
    ...GAMES.map(g => ({ id: g.id, name: g.title }))
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
      } else {
        return [...prev, playerId];
      }
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
      <style jsx>{specialPlayerNameStyle}</style>
      <div className="flex flex-col space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 shadow-md">
            <h2 className="text-lg md:text-xl font-semibold mb-4">Ajouter des joueurs</h2>
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
                  disabled={!newPlayerName.trim()}
                  className="w-full sm:w-auto"
                >
                  Ajouter
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Input
                  type="text"
                  placeholder="Ajout multiple: séparez par des virgules ou retours à la ligne"
                  value={bulkNames}
                  onChange={(e) => setBulkNames(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!bulkNames.trim()}
                  onClick={() => {
                    const parts = bulkNames
                      .split(/[,\n]/)
                      .map(s => s.trim())
                      .filter(Boolean)
                      .slice(0, 30); // sécurité
                    parts.forEach(name => addPlayer(name));
                    setBulkNames('');
                  }}
                >
                  Ajouter en lot
                </Button>
              </div>
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
          <TabsList className="grid grid-cols-3 max-w-md mx-auto mb-4">
            <TabsTrigger value="players" className="flex items-center gap-1 px-2 md:px-3">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Joueurs</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1 px-2 md:px-3">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activité</span>
            </TabsTrigger>
            <TabsTrigger value="personalization" className="flex items-center gap-1 px-2 md:px-3">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Personalisation</span>
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
                    <Avatar 
                      className="h-10 w-10 border-2"
                      style={{ backgroundColor: getColorFromClass(player.preferences.color) }}
                    >
                      <AvatarFallback style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
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
                          <div className={getSpecialEffectClass(player) || 'player-name-default font-medium'}>{player.name}</div>
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

          <TabsContent value="personalization" className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Personalisation des joueurs</h3>
            
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
                          <div className={getSpecialEffectClass(player) || 'player-name-default font-medium'}>{player.name}</div>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Couleur</label>
                        <div className="grid grid-cols-9 gap-2">
                          {[
                            'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-blue-500',
                            'bg-purple-500', 'bg-pink-500', 'bg-gray-500', 'bg-black'
                          ].map(color => (
                            <div
                              key={color}
                              className={`h-8 rounded-md cursor-pointer shadow-sm transition-all hover:scale-110 ${
                                player.preferences.color === color ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-border'
                              }`}
                              style={{ backgroundColor: getColorFromClass(color) }}
                              onClick={() => handleUpdatePreferences(player.id, { color })}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Icône</label>
                        <div className="grid grid-cols-10 gap-2 max-h-64 overflow-y-auto p-2 border rounded-md">
                          {PLAYER_ICONS.map(icon => (
                            <Button
                              key={icon}
                              variant="outline"
                              className={`h-10 w-10 p-0 text-lg shadow-sm hover:scale-110 transition-all ${
                                player.preferences.icon === icon ? 'ring-2 ring-primary bg-primary/20' : ''
                              }`}
                              onClick={() => handleUpdatePreferences(player.id, { icon })}
                            >
                              {icon}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {PLAYER_ICONS.length} icônes disponibles
                        </p>
                      </div>


                      
                      <div>
                        <label className="text-sm font-medium mb-2 block">Présets</label>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => handleUpdatePreferences(player.id, { 
                              color: 'bg-red-500',
                              icon: '🔥',
                              specialEffect: 'fire'
                            })}
                          >
                            🔥 Feu
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => handleUpdatePreferences(player.id, { 
                              color: 'bg-blue-500',
                              icon: '❄️',
                              specialEffect: 'ice'
                            })}
                          >
                            ❄️ Glace
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => handleUpdatePreferences(player.id, { 
                              color: 'bg-green-500',
                              icon: '🌿',
                              specialEffect: null
                            })}
                          >
                            🌿 Nature
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => handleUpdatePreferences(player.id, { 
                              color: 'bg-purple-500',
                              icon: '⭐',
                              specialEffect: 'galaxy'
                            })}
                          >
                            🌌 Galaxie
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => handleUpdatePreferences(player.id, { 
                              color: 'bg-yellow-500',
                              icon: '⚡',
                              specialEffect: 'lightning'
                            })}
                          >
                            ⚡ Éclair
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => handleUpdatePreferences(player.id, { 
                              color: 'bg-pink-500',
                              icon: '💖',
                              specialEffect: 'neon'
                            })}
                          >
                            💖 Néon
                          </Button>
                        </div>
                      </div>



                      <div>
                        <label className="text-sm font-medium mb-2 flex items-center justify-between">
                          <span>Effet spécial</span>
                        </label>
                        
                        <div className="grid grid-cols-3 gap-2 mt-2">
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
                            variant={player.preferences.specialEffect === 'fire' ? "default" : "outline"}
                            className="w-full special-player-name-fire"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'fire' })}
                          >
                            🔥 Feu
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'ice' ? "default" : "outline"}
                            className="w-full special-player-name-ice"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'ice' })}
                          >
                            ❄️ Glace
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'lightning' ? "default" : "outline"}
                            className="w-full special-player-name-lightning"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'lightning' })}
                          >
                            ⚡ Éclair
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'rainbow' ? "default" : "outline"}
                            className="w-full special-player-name-rainbow"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'rainbow' })}
                          >
                            🌈 Arc-en-ciel
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'neon' ? "default" : "outline"}
                            className="w-full special-player-name-neon"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'neon' })}
                          >
                            💖 Néon
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'galaxy' ? "default" : "outline"}
                            className="w-full special-player-name-galaxy"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'galaxy' })}
                          >
                            🌌 Galaxie
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'matrix' ? "default" : "outline"}
                            className="w-full special-player-name-matrix"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'matrix' })}
                          >
                            💻 Matrix
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'sunset' ? "default" : "outline"}
                            className="w-full special-player-name-sunset"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'sunset' })}
                          >
                            🌅 Coucher
                          </Button>
                          <Button
                            type="button"
                            variant={player.preferences.specialEffect === 'ocean' ? "default" : "outline"}
                            className="w-full special-player-name-ocean"
                            onClick={() => handleUpdatePreferences(player.id, { specialEffect: 'ocean' })}
                          >
                            🌊 Océan
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