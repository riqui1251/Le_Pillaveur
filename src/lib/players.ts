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
    .replace(/\p{Cc}/gu, '') // supprime les caractères de contrôle (C0, DEL et C1)
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

const PLAYER_ID_PATTERN = /^[\w-]{1,128}$/;
// Commence par une lettre ou un chiffre : écarte `__proto__` comme clé de gameStats.
const GAME_ID_PATTERN = /^[a-z0-9][\w-]{0,63}$/i;
// Une classe Tailwind de fond, rien d'autre : la couleur finit dans un className.
const PLAYER_COLOR_PATTERN = /^bg-[a-z]+-\d{2,3}$/;
const PLAYER_ICON_MAX_LENGTH = 32;

const LOCAL_EFFECT_IDS = new Set<string>(
  PLAYER_EFFECTS.flatMap((effect) => (effect.id ? [effect.id] : []))
);
const LOCAL_FRAME_IDS = new Set<string>(
  PLAYER_FRAMES.flatMap((frame) => (frame.id ? [frame.id] : []))
);

/** Effet du catalogue LOCAL (PLAYER_EFFECTS) : le seul qui ait une classe CSS ici. */
export function isLocalSpecialEffect(value: unknown): value is NonNullable<PlayerSpecialEffect> {
  return typeof value === 'string' && LOCAL_EFFECT_IDS.has(value);
}

/** Cadre du catalogue LOCAL (PLAYER_FRAMES). */
export function isLocalIconFrame(value: unknown): value is NonNullable<PlayerIconFrame> {
  return typeof value === 'string' && LOCAL_FRAME_IDS.has(value);
}

export function isValidPlayerId(value: unknown): value is string {
  return typeof value === 'string' && PLAYER_ID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isSafePlayerIcon(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PLAYER_ICON_MAX_LENGTH &&
    !/[<>"'&\p{Cc}]/u.test(value)
  );
}

function sanitizeGameStats(raw: unknown): PlayerStats['gameStats'] {
  if (!isRecord(raw)) return undefined;
  const gameStats: NonNullable<PlayerStats['gameStats']> = {};
  for (const [gameId, entry] of Object.entries(raw)) {
    if (!GAME_ID_PATTERN.test(gameId) || !isRecord(entry)) continue;
    const totalDrinks = finiteNumber(entry.totalDrinks);
    gameStats[gameId] = {
      gamesPlayed: finiteNumber(entry.gamesPlayed) ?? 0,
      wins: finiteNumber(entry.wins) ?? 0,
      ...(totalDrinks === undefined ? {} : { totalDrinks }),
    };
  }
  return gameStats;
}

export function sanitizePlayerStats(raw: unknown): PlayerStats {
  const source = isRecord(raw) ? raw : {};
  const stats: PlayerStats = {
    gamesPlayed: finiteNumber(source.gamesPlayed) ?? 0,
    wins: finiteNumber(source.wins) ?? 0,
    totalDrinks: finiteNumber(source.totalDrinks) ?? 0,
  };
  if (typeof source.favoriteGame === 'string' && GAME_ID_PATTERN.test(source.favoriteGame)) {
    stats.favoriteGame = source.favoriteGame;
  }
  const lastPlayed = finiteNumber(source.lastPlayed);
  if (lastPlayed !== undefined) stats.lastPlayed = lastPlayed;
  const gameStats = sanitizeGameStats(source.gameStats);
  if (gameStats) stats.gameStats = gameStats;
  return stats;
}

/**
 * Préférences ramenées aux catalogues : l'effet et le cadre finissent dans un
 * attribut class, jusque dans le HTML brut du Petit Buveur — une valeur hors
 * catalogue, venue du nuage d'un autre compte, y injectait une balise.
 * `avatar` n'est posé par aucun écran et finirait dans un <img src> : une URL
 * tierce y servirait de pixel espion, il n'est donc pas repris.
 */
export function sanitizePlayerPreferences(raw: unknown): PlayerPreferences {
  const source = isRecord(raw) ? raw : {};
  const preferences: PlayerPreferences = {
    color:
      typeof source.color === 'string' && PLAYER_COLOR_PATTERN.test(source.color)
        ? source.color
        : DEFAULT_COLORS[0],
  };
  if (typeof source.nickname === 'string') preferences.nickname = sanitizePlayerName(source.nickname);
  if (source.theme === 'light' || source.theme === 'dark') preferences.theme = source.theme;
  if (isSafePlayerIcon(source.icon)) preferences.icon = source.icon;
  if (source.specialEffect === null || isLocalSpecialEffect(source.specialEffect)) {
    preferences.specialEffect = source.specialEffect;
  }
  if (source.iconFrame === null || isLocalIconFrame(source.iconFrame)) {
    preferences.iconFrame = source.iconFrame;
  }
  return preferences;
}

/**
 * Joueur relu (stockage, nuage) ramené à sa forme : clés inconnues retirées,
 * nombres finis, préférences dans les catalogues. Toujours le même ordre de
 * clés, pour que deux copies identiques se sérialisent pareil. Null si ce
 * n'est pas un objet.
 */
export function sanitizePlayer(raw: unknown): Player | null {
  if (!isRecord(raw)) return null;
  return {
    id: isValidPlayerId(raw.id) ? raw.id : generatePlayerId(),
    name: typeof raw.name === 'string' ? sanitizePlayerName(raw.name) : '',
    ...(typeof raw.onlineEnabled === 'boolean' ? { onlineEnabled: raw.onlineEnabled } : {}),
    createdAt: finiteNumber(raw.createdAt) ?? 0,
    stats: sanitizePlayerStats(raw.stats),
    preferences: sanitizePlayerPreferences(raw.preferences),
  };
}

export function sanitizePlayers(raw: unknown): Player[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => sanitizePlayer(item) ?? []);
}

export function getStoredPlayers(): Player[] {
  const storage = getSafeStorage();
  if (!storage) return [];

  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const sanitized = sanitizePlayers(parsed);
    const deduped = dedupePlayersById(sanitized);
    if (JSON.stringify(deduped) !== stored) {
      try {
        savePlayers(deduped);
      } catch {
        // Stockage plein ou en lecture seule : la liste nettoyée sert quand même.
      }
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
  } catch {
    // crypto indisponible (contexte non sécurisé) : on passe au repli.
  }
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
