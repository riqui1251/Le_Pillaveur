import { getSafeStorage } from './storage';
import {
  validateLocalPlayerName,
  type NameModerationReason,
} from '@/lib/name-moderation';

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

export type PlayerSpecialEffect =
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'rainbow'
  | 'neon'
  | 'galaxy'
  | 'matrix'
  | 'sunset'
  | 'ocean'
  | 'red'
  | 'blue'
  | 'gold'
  | 'emerald'
  | 'purple'
  | 'cyber'
  // Exclusif EN LIGNE (catalogue de progression, voir src/lib/online/cosmetics.ts) —
  // absent de PLAYER_EFFECTS/CSS local : jamais proposé ni rendu en local.
  | 'toast'
  | null;

export type PlayerIconFrame =
  | 'gold'
  | 'silver'
  | 'neon'
  | 'ember'
  | 'royal'
  | 'diamond'
  | 'staff'
  | 'crown'
  // Cadres de RÔLE, exclusifs EN LIGNE (voir src/lib/online/cosmetics.ts) —
  // absents de PLAYER_FRAMES/CSS local, débloqués par grade et non par niveau.
  | 'sentinel'
  | 'blade'
  | 'eagle'
  | 'prestige'
  | null;

export interface PlayerPreferences {
  color: string;
  avatar?: string;
  nickname?: string;
  theme?: 'light' | 'dark';
  icon?: string;
  specialEffect?: PlayerSpecialEffect;
  iconFrame?: PlayerIconFrame;
}

export const PLAYER_EFFECTS: { id: PlayerSpecialEffect; label: string }[] = [
  { id: null, label: 'Classique' },
  { id: 'fire', label: 'Feu' },
  { id: 'ice', label: 'Glace' },
  { id: 'lightning', label: 'Éclair' },
  { id: 'rainbow', label: 'Arc-en-ciel' },
  { id: 'neon', label: 'Néon' },
  { id: 'galaxy', label: 'Galaxie' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'sunset', label: 'Coucher de soleil' },
  { id: 'ocean', label: 'Océan' },
  { id: 'red', label: 'Rouge' },
  { id: 'blue', label: 'Bleu' },
  { id: 'gold', label: 'Or' },
  { id: 'emerald', label: 'Émeraude' },
  { id: 'purple', label: 'Violet' },
  { id: 'cyber', label: 'Cyber' },
];

export const PLAYER_FRAMES: { id: PlayerIconFrame; label: string }[] = [
  { id: null, label: 'Aucun' },
  { id: 'gold', label: 'Or' },
  { id: 'silver', label: 'Argent' },
  { id: 'neon', label: 'Néon' },
  { id: 'ember', label: 'Braise' },
  { id: 'royal', label: 'Royal' },
  { id: 'diamond', label: 'Diamant' },
  { id: 'staff', label: 'Staff' },
  { id: 'crown', label: 'Couronne' },
];

export interface Player {
  id: string;
  name: string;
  onlineEnabled?: boolean;
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

/**
 * Nettoie un nom de joueur pour empêcher toute injection HTML/XSS.
 * Les noms sont rendus dans plusieurs jeux via dangerouslySetInnerHTML
 * (descriptions d'effets) : on supprime donc tout caractère permettant
 * d'ouvrir une balise ou une entité, et on limite la longueur.
 */
export const PLAYER_NAME_MAX_LENGTH = 40;

export function sanitizePlayerName(name: string): string {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[<>]/g, '')        // empêche l'ouverture/fermeture de balises
    .replace(/[\u0000-\u001F\u007F]/g, '') // supprime les caractères de contrôle
    .trim()
    .slice(0, PLAYER_NAME_MAX_LENGTH);
}

export function getPlayerNameValidationError(name: string): NameModerationReason | null {
  const result = validateLocalPlayerName(name, PLAYER_NAME_MAX_LENGTH);
  return result.ok ? null : result.reason;
}

export function isValidPlayerName(name: string): boolean {
  return getPlayerNameValidationError(name) === null;
}

export function resolveValidatedPlayerName(name: string): string | null {
  const validation = validateLocalPlayerName(name, PLAYER_NAME_MAX_LENGTH);
  if (!validation.ok) return null;
  return sanitizePlayerName(validation.value);
}

export function getStoredPlayers(): Player[] {
  const storage = getSafeStorage();
  if (!storage) return [];
  
  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) return [];
  
  try {
    const parsed: Player[] = JSON.parse(stored);
    let changed = false;
    const sanitized = parsed.map((p) => {
      const cleanName = sanitizePlayerName(p.name);
      if (cleanName !== p.name) changed = true;
      return { ...p, name: cleanName };
    });
    const deduped = dedupePlayersById(sanitized);
    if (changed || deduped.length !== sanitized.length) {
      try { savePlayers(deduped); } catch {}
    }
    return deduped;
  } catch {
    return [];
  }
}

export function savePlayers(players: Player[]): void {
  const storage = getSafeStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(dedupePlayersById(players)));
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

/** Fusionne les entrées partageant le même id (données cloud/local corrompues). */
export function dedupePlayersById(players: Player[]): Player[] {
  const byId = new Map<string, Player>()

  for (const raw of players) {
    const id = raw.id?.trim() || generatePlayerId()
    const player = { ...raw, id }
    const existing = byId.get(id)
    if (!existing) {
      byId.set(id, player)
      continue
    }
    const existingLast = existing.stats.lastPlayed ?? existing.createdAt
    const currentLast = player.stats.lastPlayed ?? player.createdAt
    const newer = currentLast >= existingLast ? player : existing
    const older = currentLast >= existingLast ? existing : player
    byId.set(id, {
      ...newer,
      createdAt: Math.min(existing.createdAt, player.createdAt),
      stats: {
        gamesPlayed: Math.max(existing.stats.gamesPlayed, player.stats.gamesPlayed),
        wins: Math.max(existing.stats.wins, player.stats.wins),
        totalDrinks: Math.max(existing.stats.totalDrinks, player.stats.totalDrinks),
        favoriteGame: newer.stats.favoriteGame ?? older.stats.favoriteGame,
        lastPlayed: Math.max(existingLast, currentLast) || undefined,
        gameStats: { ...older.stats.gameStats, ...newer.stats.gameStats },
      },
      preferences: { ...older.preferences, ...newer.preferences },
    })
  }

  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt)
}

export function addPlayer(name: string): Player[] {
  const validation = validateLocalPlayerName(name, PLAYER_NAME_MAX_LENGTH);
  if (!validation.ok) return getStoredPlayers();

  const players = getStoredPlayers();
  const newPlayer: Player = {
    id: generatePlayerId(),
    name: sanitizePlayerName(validation.value),
    onlineEnabled: false,
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
  let safeUpdates = updates;
  if (typeof updates.name === 'string') {
    const validation = validateLocalPlayerName(updates.name, PLAYER_NAME_MAX_LENGTH);
    if (!validation.ok) return players;
    safeUpdates = { ...updates, name: sanitizePlayerName(validation.value) };
  }
  const updatedPlayers = players.map(p => 
    p.id === playerId ? { ...p, ...safeUpdates } : p
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
    .sort((a, b) => (b.stats?.wins || 0) - (a.stats?.wins || 0))
    .slice(0, limit);
}

export function getMostActivePlayers(limit: number = 5): Player[] {
  const players = getStoredPlayers();
  return [...players]
    .sort((a, b) => (b.stats?.gamesPlayed || 0) - (a.stats?.gamesPlayed || 0))
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

const BOOSTED_GAME_IDS = ['pmu', 'purple', 'petit-buveur', 'plinko', 'monsieur-3'] as const

/** Easter egg Sim : léger avantage sur certains jeux. */
export function getPlayerGameBoost(player: unknown, gameId: string): number {
  const p = player as { name?: string } | null | undefined;
  if (!p) return 0
  const isSim = p.name?.toLowerCase() === 'sim'
  if (isSim && BOOSTED_GAME_IDS.includes(gameId as (typeof BOOSTED_GAME_IDS)[number])) {
    return 20
  }
  return 0
} 