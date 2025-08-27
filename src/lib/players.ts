/* eslint-disable @typescript-eslint/no-unused-vars */
export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  totalDrinks: number;
  favoriteGame?: string;
  lastPlayed?: number;
  gameStats?: {
    [gameId: string]: {
      gamesPlayed: number;
      wins: number;
      totalDrinks?: number;
    }
  };
}

export interface PlayerPreferences {
  color: string;
  avatar?: string;
  nickname?: string;
  theme?: 'light' | 'dark';
  icon?: string;
  specialEffect?: 'fire' | 'ice' | 'lightning' | 'rainbow' | 'neon' | 'galaxy' | 'matrix' | 'sunset' | 'ocean' | null;
}

export interface Player {
  id: string;
  name: string;
  createdAt: number;
  stats: PlayerStats;
  preferences: PlayerPreferences;
}

const STORAGE_KEY = 'game_players';
const DEFAULT_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-rose-500', 'bg-emerald-500'
];

export const PLAYER_ICONS = [
  // Animaux
  '🦁', '🐯', '🐉', '🦊', '🦄', '🦋', '🐺', '🐻', '🐸', '🐙', '🦈', '🦅', '🦉', '🦇', '🦕', '🦖',
  // Émotions et visages
  '😎', '🤠', '👻', '🤖', '👾', '👽', '🤡', '👹', '👺', '💀', '☠️', '🎃', '🧙‍♀️', '🧙‍♂️',
  // Nature et éléments
  '🌙', '☀️', '⭐', '🌟', '⚡', '🔥', '💧', '❄️', '🌈', '🍀', '🌺', '🌹', '🌸', '🌻', '🌼', '🌷',
  // Objets et symboles
  '👑', '💎', '🔮', '⚔️', '🛡️', '🏹', '🗡️', '🔱', '⚜️', '💠', '🔯', '☯️', '☮️', '✝️', '☪️', '🕉️',
  // Jeux et divertissement
  '🎮', '🎲', '🎯', '🎪', '🎭', '🎨', '🎤', '🎧', '🎸', '🎹', '🎺', '🎻', '🥁', '🎼',
  // Sports et activités
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏊‍♂️', '🏄‍♂️', '🚴‍♂️', '🏃‍♂️', '🏋️‍♂️', '🤸‍♂️',
  // Nourriture et boissons
  '🍕', '🍔', '🌭', '🍟', '🌮', '🍣', '🍜', '🍱', '🍙', '🍘', '🍪', '🍩', '🍰', '🍦', '🍺', '🍷',
  // Technologie et gadgets
  '📱', '💻', '🖥️', '⌨️', '🖱️', '📷', '📹', '🎥', '📺', '📻', '🔋', '💡', '🔌', '🔍', '🔬',
  // Transport
  '🚗', '🏎️', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🚁', '✈️', '🚀', '🛸',
  // Divers
  '🎬', '🎵', '🎶'
];

export function getStoredPlayers(): Player[] {
  if (typeof window === 'undefined') return [];
  
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  
  try {
    const parsed: Player[] = JSON.parse(stored);
    // Assainir: s'assurer que chaque joueur a un id unique
    const seen = new Set<string>();
    let changed = false;
    const sanitized = parsed.map((p) => {
      let id = p.id;
      if (!id || seen.has(id)) {
        id = generatePlayerId();
        changed = true;
      }
      seen.add(id);
      return { ...p, id };
    });
    if (changed) {
      try { savePlayers(sanitized); } catch {}
    }
    return sanitized;
  } catch {
    return [];
  }
}

export function savePlayers(players: Player[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

export function generatePlayerId(): string {
  try {
    // Utiliser un UUID si disponible pour éviter les collisions (notamment en ajout multiple)
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `player-${(crypto as unknown as { randomUUID: () => string }).randomUUID()}`;
    }
  } catch {}
  // Fallback robuste: timestamp + aléatoire
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function addPlayer(name: string): Player[] {
  const players = getStoredPlayers();
  const newPlayer: Player = {
    id: generatePlayerId(),
    name,
    createdAt: Date.now(),
    stats: {
      gamesPlayed: 0,
      wins: 0,
      totalDrinks: 0
    },
    preferences: {
      color: DEFAULT_COLORS[players.length % DEFAULT_COLORS.length],
      icon: PLAYER_ICONS[Math.floor(Math.random() * PLAYER_ICONS.length)]
    }
  };
  
  const updatedPlayers = [...players, newPlayer];
  savePlayers(updatedPlayers);
  return updatedPlayers;
}

export function removePlayer(playerId: string): Player[] {
  const players = getStoredPlayers();
  const updatedPlayers = players.filter(p => p.id !== playerId);
  savePlayers(updatedPlayers);
  return updatedPlayers;
}

export function updatePlayer(playerId: string, updates: Partial<Player>): Player[] {
  const players = getStoredPlayers();
  const updatedPlayers = players.map(p => 
    p.id === playerId ? { ...p, ...updates } : p
  );
  savePlayers(updatedPlayers);
  return updatedPlayers;
}

export function updatePlayerStats(playerId: string, gameId: string, stats: Partial<PlayerStats>): Player[] {
  if (!playerId || !gameId) {
    console.error('updatePlayerStats: playerId ou gameId invalide', { playerId, gameId });
    return getStoredPlayers(); // Retourner les joueurs sans modification
  }
  
  try {
    const players = getStoredPlayers();
    
    // Vérifier si le joueur existe
    const playerExists = players.some(p => p.id === playerId);
    if (!playerExists) {
      console.error(`updatePlayerStats: Joueur introuvable avec l'ID ${playerId}`);
      return players;
    }
    
    // Sécuriser les stats en entrée
    const safeStats = {
      wins: stats.wins || 0,
      totalDrinks: stats.totalDrinks || 0,
      gamesPlayed: stats.gamesPlayed || 0
    };
    
    const updatedPlayers = players.map(p => {
      if (p.id === playerId) {
        const currentStats = p.stats || { gamesPlayed: 0, wins: 0, totalDrinks: 0 };
        
        // Initialiser ou mettre à jour les statistiques spécifiques au jeu
        const currentGameStats = currentStats.gameStats || {};
        const currentGameSpecificStats = currentGameStats[gameId] || { gamesPlayed: 0, wins: 0, totalDrinks: 0 };
        
        // Ne pas incrémenter le compteur de parties si gamesPlayed est explicitement défini à 0
        const gamePlayedIncrement = safeStats.gamesPlayed === 0 ? 0 : 1;
        
        const updatedGameSpecificStats = {
          ...currentGameSpecificStats,
          gamesPlayed: currentGameSpecificStats.gamesPlayed + gamePlayedIncrement,
          wins: currentGameSpecificStats.wins + safeStats.wins,
          totalDrinks: (currentGameSpecificStats.totalDrinks || 0) + safeStats.totalDrinks
        };
        
        const updatedGameStats = {
          ...currentGameStats,
          [gameId]: updatedGameSpecificStats
        };
        
        const updatedStats = {
          ...currentStats,
          gamesPlayed: (currentStats.gamesPlayed || 0) + gamePlayedIncrement,
          wins: (currentStats.wins || 0) + safeStats.wins,
          totalDrinks: (currentStats.totalDrinks || 0) + safeStats.totalDrinks,
          lastPlayed: Date.now(),
          gameStats: updatedGameStats
        };

        // Mettre à jour le jeu favori si c'est celui auquel le joueur a le plus joué
        let maxPlayed = 0;
        let favoriteGame = currentStats.favoriteGame;
        
        // Trouver le jeu le plus joué
        Object.entries(updatedGameStats).forEach(([game, gameStats]) => {
          if (gameStats.gamesPlayed > maxPlayed) {
            maxPlayed = gameStats.gamesPlayed;
            favoriteGame = game;
          }
        });
        
        updatedStats.favoriteGame = favoriteGame;

        return {
          ...p,
          stats: updatedStats
        };
      }
      return p;
    });
    
    try {
      savePlayers(updatedPlayers);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des joueurs:', error);
    }
    
    return updatedPlayers;
  } catch (error) {
    console.error('Erreur dans updatePlayerStats:', error);
    return getStoredPlayers(); // Retourner les joueurs sans modification en cas d'erreur
  }
}

export function updatePlayerPreferences(playerId: string, preferences: Partial<PlayerPreferences>): Player[] {
  const players = getStoredPlayers();
  const updatedPlayers = players.map(p => {
    if (p.id === playerId) {
      return {
        ...p,
        preferences: {
          ...p.preferences,
          ...preferences
        }
      };
    }
    return p;
  });
  
  savePlayers(updatedPlayers);
  return updatedPlayers;
}

export function getPlayerStats(playerId: string): PlayerStats | null {
  const players = getStoredPlayers();
  const player = players.find(p => p.id === playerId);
  return player ? player.stats : null;
}

export function getTopPlayers(limit: number = 5): Player[] {
  const players = getStoredPlayers();
  return [...players]
    .sort((a, b) => {
      // Calculer le total des victoires sur tous les jeux
      let aWins = a.stats.wins || 0;
      let bWins = b.stats.wins || 0;
      
      // Ajouter les victoires spécifiques à chaque jeu
      if (a.stats.gameStats) {
        Object.entries(a.stats.gameStats).forEach(([gameId, stats]) => {
          aWins += stats.wins || 0;
        });
      }
      
      if (b.stats.gameStats) {
        Object.entries(b.stats.gameStats).forEach(([gameId, stats]) => {
          bWins += stats.wins || 0;
        });
      }
      
      return bWins - aWins;
    })
    .slice(0, limit);
}

export function getMostActivePlayers(limit: number = 5): Player[] {
  const players = getStoredPlayers();
  return [...players]
    .sort((a, b) => {
      // Calculer le total des parties jouées sur tous les jeux
      let aGames = a.stats.gamesPlayed || 0;
      let bGames = b.stats.gamesPlayed || 0;
      
      // Ajouter les parties spécifiques à chaque jeu
      if (a.stats.gameStats) {
        Object.entries(a.stats.gameStats).forEach(([gameId, stats]) => {
          aGames += stats.gamesPlayed || 0;
        });
      }
      
      if (b.stats.gameStats) {
        Object.entries(b.stats.gameStats).forEach(([gameId, stats]) => {
          bGames += stats.gamesPlayed || 0;
        });
      }
      
      return bGames - aGames;
    })
    .slice(0, limit);
}

// Nouvelles fonctions pour obtenir le classement par jeu
export function getTopPlayersByGame(gameId: string, limit: number = 5): Player[] {
  const players = getStoredPlayers();
  return [...players]
    .filter(player => player.stats.gameStats && player.stats.gameStats[gameId])
    .sort((a, b) => {
      const aWins = a.stats.gameStats?.[gameId]?.wins || 0;
      const bWins = b.stats.gameStats?.[gameId]?.wins || 0;
      return bWins - aWins;
    })
    .slice(0, limit);
}

export function getMostActivePlayersByGame(gameId: string, limit: number = 5): Player[] {
  const players = getStoredPlayers();
  return [...players]
    .filter(player => player.stats.gameStats && player.stats.gameStats[gameId])
    .sort((a, b) => {
      const aGames = a.stats.gameStats?.[gameId]?.gamesPlayed || 0;
      const bGames = b.stats.gameStats?.[gameId]?.gamesPlayed || 0;
      return bGames - aGames;
    })
    .slice(0, limit);
}

export function getPlayerStatsByGame(playerId: string, gameId: string): { gamesPlayed: number; wins: number; totalDrinks?: number } | null {
  const players = getStoredPlayers();
  const player = players.find(p => p.id === playerId);
  if (!player || !player.stats.gameStats || !player.stats.gameStats[gameId]) {
    return null;
  }
  return player.stats.gameStats[gameId];
} 