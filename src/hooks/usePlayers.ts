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
import { useAuth } from '@/hooks/useAuth';
import { clearSelectedPlayerIds } from '@/lib/selectedPlayers';

type PlayersListener = () => void;
const playersListeners = new Set<PlayersListener>();

function notifyPlayersUpdated(except?: PlayersListener) {
  queueMicrotask(() => {
    playersListeners.forEach((listener) => {
      if (listener !== except) listener();
    });
  });
}

function refreshPlayersState(
  setPlayers: (players: Player[]) => void,
  setTopPlayers: (players: Player[]) => void,
  setMostActivePlayers: (players: Player[]) => void,
) {
  setPlayers(getStoredPlayers());
  setTopPlayers(getTopPlayers());
  setMostActivePlayers(getMostActivePlayers());
}

export function usePlayers() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);
  const [mostActivePlayers, setMostActivePlayers] = useState<Player[]>([]);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudSyncedRef = useRef(false);
  const listenerRef = useRef<PlayersListener | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      cloudSyncedRef.current = false;
      const local = getStoredPlayers();

      if (user) {
        try {
          const res = await fetch('/api/players/local', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            const cloud: Player[] = Array.isArray(data.players) ? data.players : [];
            if (!cancelled) {
              if (cloud.length > 0) {
                savePlayers(cloud);
                setPlayers(cloud);
              } else {
                // Compte cloud vide : ne pas reprendre les joueurs locaux de l'appareil
                savePlayers([]);
                setPlayers([]);
                clearSelectedPlayerIds();
              }
              setTopPlayers(getTopPlayers());
              setMostActivePlayers(getMostActivePlayers());
              cloudSyncedRef.current = true;
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
        cloudSyncedRef.current = !user;
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true };
  }, [user?.id]);

  useEffect(() => {
    const listener: PlayersListener = () => {
      refreshPlayersState(setPlayers, setTopPlayers, setMostActivePlayers);
    };
    listenerRef.current = listener;
    playersListeners.add(listener);
    return () => {
      playersListeners.delete(listener);
      if (listenerRef.current === listener) listenerRef.current = null;
    };
  }, []);

  const notifyOthers = useCallback(() => {
    notifyPlayersUpdated(listenerRef.current ?? undefined);
  }, []);

  const addPlayer = useCallback((name: string) => {
    const updatedPlayers = addPlayerToStorage(name);
    setPlayers(updatedPlayers);
    notifyOthers();
    return updatedPlayers;
  }, [notifyOthers]);

  const removePlayer = useCallback((playerId: string) => {
    const updatedPlayers = removePlayerFromStorage(playerId);
    setPlayers(updatedPlayers);
    notifyOthers();
    return updatedPlayers;
  }, [notifyOthers]);

  const updatePlayer = useCallback((playerId: string, updates: Partial<Player>) => {
    const updatedPlayers = updatePlayerInStorage(playerId, updates);
    setPlayers(updatedPlayers);
    notifyOthers();
    return updatedPlayers;
  }, [notifyOthers]);

  const updatePlayerStats = useCallback((playerId: string, gameId: string, stats: Partial<PlayerStats>) => {
    const updatedPlayers = updatePlayerStatsInStorage(playerId, gameId, stats);
    setPlayers(updatedPlayers);
    setTopPlayers(getTopPlayers());
    setMostActivePlayers(getMostActivePlayers());
    notifyOthers();
    return updatedPlayers;
  }, [notifyOthers]);

  const updatePlayerPreferences = useCallback((playerId: string, preferences: Partial<PlayerPreferences>) => {
    const updatedPlayers = updatePlayerPreferencesInStorage(playerId, preferences);
    setPlayers(updatedPlayers);
    notifyOthers();
    return updatedPlayers;
  }, [notifyOthers]);

  const selectPlayersForGame = useCallback((selectedIds: string[]): Player[] => {
    return players.filter(player => selectedIds.includes(player.id));
  }, [players]);

  const getPlayerStats = useCallback((playerId: string): PlayerStats | null => {
    const player = players.find(p => p.id === playerId);
    return player ? player.stats : null;
  }, [players]);

  const getPlayerPreferences = useCallback((playerId: string): PlayerPreferences | null => {
    const player = players.find(p => p.id === playerId);
    return player ? player.preferences : null;
  }, [players]);

  const getTopPlayersByGameCallback = useCallback((gameId: string, limit: number = 5): Player[] => {
    return getTopPlayersByGame(gameId, limit);
  }, []);

  const getMostActivePlayersByGameCallback = useCallback((gameId: string, limit: number = 5): Player[] => {
    return getMostActivePlayersByGame(gameId, limit);
  }, []);

  const getPlayerStatsByGame = useCallback((playerId: string, gameId: string) => {
    return getPlayerStatsByGameFromStorage(playerId, gameId);
  }, []);

  useEffect(() => {
    if (loading) return;
    savePlayers(players);

    if (!user || !cloudSyncedRef.current) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      fetch('/api/players/local', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ players }),
      }).catch(() => {});
    }, 800);
  }, [players, loading, user?.id]);

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
