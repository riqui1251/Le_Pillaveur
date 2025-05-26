/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useCallback } from 'react';
import { 
  Player, 
  PlayerStats, 
  PlayerPreferences,
  PLAYER_ICONS,
  getStoredPlayers, 
  savePlayers, 
  addPlayer as addPlayerToStorage, 
  removePlayer as removePlayerFromStorage, 
  updatePlayer as updatePlayerInStorage,
  updatePlayerStats as updatePlayerStatsInStorage,
  updatePlayerPreferences as updatePlayerPreferencesInStorage,
  getTopPlayers,
  getMostActivePlayers,
  getTopPlayersByGame,
  getMostActivePlayersByGame,
  getPlayerStatsByGame as getPlayerStatsByGameFromStorage
} from '../lib/players';

export function usePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);
  const [mostActivePlayers, setMostActivePlayers] = useState<Player[]>([]);

  // Charger les joueurs au montage du composant
  useEffect(() => {
    const storedPlayers = getStoredPlayers();
    setPlayers(storedPlayers);
    setTopPlayers(getTopPlayers());
    setMostActivePlayers(getMostActivePlayers());
    setLoading(false);
  }, []);

  // Ajouter un nouveau joueur
  const addPlayer = useCallback((name: string) => {
    const updatedPlayers = addPlayerToStorage(name);
    setPlayers(updatedPlayers);
    return updatedPlayers;
  }, []);

  // Supprimer un joueur
  const removePlayer = useCallback((playerId: string) => {
    const updatedPlayers = removePlayerFromStorage(playerId);
    setPlayers(updatedPlayers);
    return updatedPlayers;
  }, []);

  // Mettre à jour un joueur
  const updatePlayer = useCallback((playerId: string, updates: Partial<Player>) => {
    const updatedPlayers = updatePlayerInStorage(playerId, updates);
    setPlayers(updatedPlayers);
    return updatedPlayers;
  }, []);

  // Mettre à jour les statistiques d'un joueur
  const updatePlayerStats = useCallback((playerId: string, gameId: string, stats: Partial<PlayerStats>) => {
    const updatedPlayers = updatePlayerStatsInStorage(playerId, gameId, stats);
    setPlayers(updatedPlayers);
    setTopPlayers(getTopPlayers());
    setMostActivePlayers(getMostActivePlayers());
    return updatedPlayers;
  }, []);

  // Mettre à jour les préférences d'un joueur
  const updatePlayerPreferences = useCallback((playerId: string, preferences: Partial<PlayerPreferences>) => {
    const updatedPlayers = updatePlayerPreferencesInStorage(playerId, preferences);
    setPlayers(updatedPlayers);
    return updatedPlayers;
  }, []);

  // Sélectionner des joueurs pour un jeu
  const selectPlayersForGame = useCallback((selectedIds: string[]): Player[] => {
    return players.filter(player => selectedIds.includes(player.id));
  }, [players]);

  // Obtenir les statistiques d'un joueur
  const getPlayerStats = useCallback((playerId: string): PlayerStats | null => {
    const player = players.find(p => p.id === playerId);
    return player ? player.stats : null;
  }, [players]);

  // Obtenir les préférences d'un joueur
  const getPlayerPreferences = useCallback((playerId: string): PlayerPreferences | null => {
    const player = players.find(p => p.id === playerId);
    return player ? player.preferences : null;
  }, [players]);

  // Obtenir le classement des joueurs par jeu
  const getTopPlayersByGame = useCallback((gameId: string, limit: number = 5): Player[] => {
    return getTopPlayersByGame(gameId, limit);
  }, []);

  // Obtenir les joueurs les plus actifs par jeu
  const getMostActivePlayersByGame = useCallback((gameId: string, limit: number = 5): Player[] => {
    return getMostActivePlayersByGame(gameId, limit);
  }, []);

  // Obtenir les statistiques d'un joueur pour un jeu spécifique
  const getPlayerStatsByGame = useCallback((playerId: string, gameId: string) => {
    return getPlayerStatsByGameFromStorage(playerId, gameId);
  }, []);

  // Sauvegarder les joueurs quand ils changent
  useEffect(() => {
    if (!loading) {
      savePlayers(players);
    }
  }, [players, loading]);

  return {
    players,
    loading,
    topPlayers,
    mostActivePlayers,
    addPlayer,
    removePlayer,
    updatePlayer,
    updatePlayerStats,
    updatePlayerPreferences,
    selectPlayersForGame,
    getPlayerStats,
    getPlayerPreferences,
    getTopPlayersByGame,
    getMostActivePlayersByGame,
    getPlayerStatsByGame
  };
} 