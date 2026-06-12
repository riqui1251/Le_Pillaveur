import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Player, 
  PlayerStats, 
  PlayerPreferences,
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
import { useAuth } from '@/components/providers/AuthProvider';
import { useOnlineRoom } from '@/hooks/useOnlineRoom';
import { membersToPlayers } from '@/lib/online-players';

export function usePlayers() {
  const { user } = useAuth();
  const { room } = useOnlineRoom();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);
  const [mostActivePlayers, setMostActivePlayers] = useState<Player[]>([]);
  const cloudSyncedRef = useRef(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les joueurs (local + sync cloud si connecté en mode local)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const local = getStoredPlayers();

      if (user && user.playMode === 'local') {
        try {
          const res = await fetch('/api/players/local', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            const cloud: Player[] = Array.isArray(data.players) ? data.players : [];
            const useCloud = cloud.length > 0 || local.length === 0;
            if (!cancelled && useCloud) {
              savePlayers(cloud);
              setPlayers(cloud);
              cloudSyncedRef.current = true;
              setTopPlayers(getTopPlayers());
              setMostActivePlayers(getMostActivePlayers());
              setLoading(false);
              return;
            }
          }
        } catch {}
      }

      if (!cancelled) {
        setPlayers(local);
        setTopPlayers(getTopPlayers());
        setMostActivePlayers(getMostActivePlayers());
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true };
  }, [user?.id, user?.playMode]);

  // Mode en ligne : les joueurs actifs sont les membres de la salle
  useEffect(() => {
    if (user?.playMode !== 'online' || !room) return;
    const onlinePlayers = membersToPlayers(room.members);
    setPlayers(onlinePlayers);
    setTopPlayers(onlinePlayers.slice(0, 5));
    setMostActivePlayers(onlinePlayers);
  }, [user?.playMode, room]);

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
  const getTopPlayersByGameCallback = useCallback((gameId: string, limit: number = 5): Player[] => {
    return getTopPlayersByGame(gameId, limit);
  }, []);

  // Obtenir les joueurs les plus actifs par jeu
  const getMostActivePlayersByGameCallback = useCallback((gameId: string, limit: number = 5): Player[] => {
    return getMostActivePlayersByGame(gameId, limit);
  }, []);

  // Obtenir les statistiques d'un joueur pour un jeu spécifique
  const getPlayerStatsByGame = useCallback((playerId: string, gameId: string) => {
    return getPlayerStatsByGameFromStorage(playerId, gameId);
  }, []);

  // Sauvegarder localement + synchroniser le cloud (mode local + compte)
  useEffect(() => {
    if (loading) return;
    savePlayers(players);

    if (!user || user.playMode !== 'local') return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      fetch('/api/players/local', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ players }),
      }).catch(() => {});
    }, 800);
  }, [players, loading, user?.id, user?.playMode]);

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
    getTopPlayersByGame: getTopPlayersByGameCallback,
    getMostActivePlayersByGame: getMostActivePlayersByGameCallback,
    getPlayerStatsByGame
  };
} 