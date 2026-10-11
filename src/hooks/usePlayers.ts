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
import { syncLocalPlayersNow } from '@/lib/visit-ping-client';
import {
  markCloudBehind,
  pushPlayersToCloud,
  schedulePlayersPush,
  setCloudAccount,
  syncLocalWithCloud,
} from '@/lib/player-sync';

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
  const { user, unavailable: sessionUnavailable } = useAuth();
  // Toute la synchro cloud ne dépend que de l'identité du compte : l'objet
  // `user` change de référence à chaque rafraîchissement de session, ce qui
  // relancerait fusion et poussées sans qu'aucun joueur n'ait bougé.
  const userId = user?.id;
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);
  const [mostActivePlayers, setMostActivePlayers] = useState<Player[]>([]);
  const cloudSyncedRef = useRef(false);
  const listenerRef = useRef<PlayersListener | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      cloudSyncedRef.current = false;
      setCloudAccount(userId);
      const local = getStoredPlayers();

      if (userId) {
        try {
          const merged = await syncLocalWithCloud(userId);
          if (!cancelled) {
            setPlayers(merged);
            if (merged.length === 0) {
              clearSelectedPlayerIds();
            }
            setTopPlayers(getTopPlayers());
            setMostActivePlayers(getMostActivePlayers());
            cloudSyncedRef.current = true;
            setLoading(false);
            return;
          }
        } catch {
          // Nuage injoignable : on continue avec la liste locale, sans bruit.
        }
      }

      if (!cancelled) {
        setPlayers(local);
        setTopPlayers(getTopPlayers());
        setMostActivePlayers(getMostActivePlayers());
        cloudSyncedRef.current = !userId;
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true };
  }, [userId]);

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

  const pushCloudIfReady = useCallback((playerList: Player[]) => {
    if (userId && cloudSyncedRef.current) {
      pushPlayersToCloud(playerList).catch(() => {});
      return;
    }
    // Nuage pas joint depuis ce chargement — compte connu mais synchro en
    // échec, ou session INVÉRIFIABLE (app ouverte hors ligne) : le geste est
    // noté « en retard » pour que la prochaine resynchro pousse la liste
    // locale au lieu de fusionner une copie du nuage qui ressusciterait un
    // joueur supprimé ici. Un visiteur franchement déconnecté (401) ne note
    // rien : ses gestes ne sont dus à aucun compte.
    if (userId || sessionUnavailable) markCloudBehind();
  }, [userId, sessionUnavailable]);

  useEffect(() => {
    if (!userId || loading) return;

    const resyncFromCloud = () => {
      if (document.visibilityState === 'hidden') return;
      syncLocalWithCloud(userId)
        .then((merged) => {
          setPlayers(merged);
          setTopPlayers(getTopPlayers());
          setMostActivePlayers(getMostActivePlayers());
          // Nuage rejoint (après un chargement hors ligne, par exemple) : les
          // gestes suivants repartent directement.
          cloudSyncedRef.current = true;
        })
        .catch(() => {});
    };

    document.addEventListener('visibilitychange', resyncFromCloud);
    window.addEventListener('focus', resyncFromCloud);
    window.addEventListener('pageshow', resyncFromCloud);
    // Retour du réseau en pleine soirée : le nuage rattrape la table sans attendre un focus.
    window.addEventListener('online', resyncFromCloud);
    return () => {
      document.removeEventListener('visibilitychange', resyncFromCloud);
      window.removeEventListener('focus', resyncFromCloud);
      window.removeEventListener('pageshow', resyncFromCloud);
      window.removeEventListener('online', resyncFromCloud);
    };
  }, [userId, loading]);

  const addPlayer = useCallback((name: string) => {
    const updatedPlayers = addPlayerToStorage(name);
    setPlayers(updatedPlayers);
    notifyOthers();
    pushCloudIfReady(updatedPlayers);
    return updatedPlayers;
  }, [notifyOthers, pushCloudIfReady]);

  // Plusieurs prénoms d'un trait (« Léa, Tom, Max ») : UN état, UNE
  // notification, UNE poussée cloud pour tout le lot. Passer par addPlayer en
  // boucle envoyait autant de requêtes que de prénoms, chacune avec une liste
  // partielle — trois allers-retours pour un geste, sur réseau de soirée.
  // Renvoie aussi les joueurs créés : le stockage ajoute toujours en fin de
  // liste, et c'est la seule façon sûre de les reconnaître (comparer à l'état
  // React pouvait désigner un joueur arrivé d'un autre onglet entre-temps).
  const addPlayers = useCallback((names: string[]) => {
    const created: Player[] = [];
    let updatedPlayers = getStoredPlayers();
    for (const name of names) {
      const before = updatedPlayers.length;
      updatedPlayers = addPlayerToStorage(name);
      // Prénom refusé par le stockage : la liste revient telle quelle.
      if (updatedPlayers.length > before) created.push(updatedPlayers[updatedPlayers.length - 1]);
    }
    setPlayers(updatedPlayers);
    if (created.length > 0) {
      notifyOthers();
      pushCloudIfReady(updatedPlayers);
    }
    return { players: updatedPlayers, created };
  }, [notifyOthers, pushCloudIfReady]);

  const removePlayer = useCallback((playerId: string) => {
    const updatedPlayers = removePlayerFromStorage(playerId);
    setPlayers(updatedPlayers);
    notifyOthers();
    pushCloudIfReady(updatedPlayers);
    return updatedPlayers;
  }, [notifyOthers, pushCloudIfReady]);

  const updatePlayer = useCallback((playerId: string, updates: Partial<Player>) => {
    const updatedPlayers = updatePlayerInStorage(playerId, updates);
    setPlayers(updatedPlayers);
    notifyOthers();
    pushCloudIfReady(updatedPlayers);
    return updatedPlayers;
  }, [notifyOthers, pushCloudIfReady]);

  const updatePlayerStats = useCallback((playerId: string, gameId: string, stats: Partial<PlayerStats>) => {
    const updatedPlayers = updatePlayerStatsInStorage(playerId, gameId, stats);
    setPlayers(updatedPlayers);
    setTopPlayers(getTopPlayers());
    setMostActivePlayers(getMostActivePlayers());
    notifyOthers();
    pushCloudIfReady(updatedPlayers);
    return updatedPlayers;
  }, [notifyOthers, pushCloudIfReady]);

  const updatePlayerPreferences = useCallback((playerId: string, preferences: Partial<PlayerPreferences>) => {
    const updatedPlayers = updatePlayerPreferencesInStorage(playerId, preferences);
    setPlayers(updatedPlayers);
    notifyOthers();
    // Pas de poussée immédiate (l'effet de sauvegarde la programme), mais la
    // même note « nuage en retard » que les autres gestes quand il n'est pas
    // joint : une couleur choisie hors ligne ne doit pas revenir à l'ancienne.
    if (!(userId && cloudSyncedRef.current) && (userId || sessionUnavailable)) markCloudBehind();
    return updatedPlayers;
  }, [notifyOthers, userId, sessionUnavailable]);

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

  // Poussée différée partagée par toutes les instances : une resynchro qui
  // démarre avant son échéance la fait partir d'abord (voir syncLocalWithCloud),
  // sinon la copie du nuage, en retard, annulerait le changement.
  useEffect(() => {
    if (loading) return;
    savePlayers(players);

    if (!userId || !cloudSyncedRef.current) return;
    schedulePlayersPush();
  }, [players, loading, userId]);

  // Pseudos locaux → statistiques de visite. Relancé seulement quand les NOMS
  // changent (ajout, suppression, renommage, fusion cloud), jamais pour une
  // mise à jour de stats en partie. syncLocalPlayersNow filtre encore le
  // consentement et dédoublonne entre instances (page + composant de jeu).
  // Déclaré APRÈS l'effet qui enregistre la liste : elle la relit en stockage.
  // Ce n'est pas une présence : seul VisitTracker émet des battements.
  const localNamesKey = JSON.stringify(players.map((player) => player.name));
  useEffect(() => {
    if (loading) return;
    syncLocalPlayersNow();
  }, [localNamesKey, loading]);

  return {
    players,
    loading,
    topPlayers,
    mostActivePlayers,
    addPlayer,
    addPlayers,
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
