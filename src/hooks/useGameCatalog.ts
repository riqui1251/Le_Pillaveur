'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  EMPTY_GAME_CATALOG,
  gameDifficulty,
  gameDrinkLevel,
  parseGameCatalogState,
  type GameCatalogState,
  type GameCategory,
} from '@/lib/game-catalog'
import type { GameDifficulty, GameDrinkLevel } from '@/lib/games'

/**
 * Le catalogue tel que l'équipe le règle (jeux cachés, difficulté, niveau « fait boire », catégories, jeux les plus joués),
 * côté navigateur : servi par GET /api/games/catalog, gardé sur l'appareil.
 *
 * La copie de l'appareil s'affiche tout de suite (et hors ligne : les jeux
 * locaux tournent sans réseau, voir le service worker) ; le serveur la
 * remplace dès qu'il répond. Une seule requête en vol pour tous les écrans,
 * redemandée au montage d'un écran quand la dernière réponse a plus de
 * GAME_CATALOG_MAX_AGE_MS — une page reste ouverte toute une soirée.
 */

/** D'où vient l'état : défaut du code (rien lu encore), copie de l'appareil, serveur. */
export type GameCatalogSource = 'default' | 'cache' | 'server'

export type GameCatalogSnapshot = { state: GameCatalogState; source: GameCatalogSource }

export const GAME_CATALOG_CACHE_KEY = 'lp.gameCatalog.v1'
export const GAME_CATALOG_MAX_AGE_MS = 2 * 60_000
/** Après un échec (hors ligne, serveur en redémarrage), délai avant de redemander. */
export const GAME_CATALOG_RETRY_MS = 30_000

const DEFAULT_SNAPSHOT: GameCatalogSnapshot = Object.freeze({ state: EMPTY_GAME_CATALOG, source: 'default' as const })

type CatalogStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Usine exportée pour les tests ; l'application n'en utilise qu'une instance. */
export function createGameCatalogStore(options: {
  fetchState: (fresh: boolean) => Promise<unknown>
  storage: () => CatalogStorage | null
  now: () => number
}) {
  let snapshot: GameCatalogSnapshot | null = null
  let inflight: Promise<void> | null = null
  let nextFetchAt: number | null = null
  const listeners = new Set<() => void>()

  function readStored(): GameCatalogSnapshot {
    try {
      const raw = options.storage()?.getItem(GAME_CATALOG_CACHE_KEY)
      const state = raw ? parseGameCatalogState(JSON.parse(raw)) : null
      return state ? { state, source: 'cache' } : DEFAULT_SNAPSHOT
    } catch {
      return DEFAULT_SNAPSHOT
    }
  }

  function getSnapshot(): GameCatalogSnapshot {
    if (!snapshot) snapshot = readStored()
    return snapshot
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function store(state: GameCatalogState) {
    try {
      options.storage()?.setItem(GAME_CATALOG_CACHE_KEY, JSON.stringify(state))
    } catch {
      // Stockage plein ou refusé (navigation privée) : l'état reste en mémoire.
    }
  }

  /** `fresh` : passe outre le cache HTTP (30 s) — après un changement fait depuis la Supervision. */
  function refresh(fresh = false): Promise<void> {
    if (inflight && !fresh) return inflight
    const request = options
      .fetchState(fresh)
      .then((body) => {
        const state = parseGameCatalogState(body)
        if (!state) throw new Error('unreadable')
        nextFetchAt = options.now() + GAME_CATALOG_MAX_AGE_MS
        store(state)
        snapshot = { state, source: 'server' }
        for (const listener of listeners) listener()
      })
      .catch(() => {
        nextFetchAt = options.now() + GAME_CATALOG_RETRY_MS
      })
      .finally(() => {
        if (inflight === request) inflight = null
      })
    inflight = request
    return request
  }

  function ensureFresh() {
    if (inflight) return
    if (nextFetchAt !== null && options.now() < nextFetchAt) return
    void refresh()
  }

  return { getSnapshot, subscribe, refresh, ensureFresh }
}

function deviceStorage(): CatalogStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const gameCatalogStore = createGameCatalogStore({
  fetchState: async (fresh) => {
    // 'reload' et non 'no-store' : la réponse fraîche REMPLACE l'entrée du cache
    // HTTP, sinon un autre onglet rechargé dans les 30 s relirait l'ancien état.
    const response = await fetch('/api/games/catalog', fresh ? { cache: 'reload' } : undefined)
    if (!response.ok) throw new Error(String(response.status))
    return response.json()
  },
  storage: deviceStorage,
  now: () => Date.now(),
})

/** Redemande l'état au serveur sans passer par le cache HTTP (après un réglage de la Supervision). */
export function refreshGameCatalog(): Promise<void> {
  return gameCatalogStore.refresh(true)
}

/** L'état et sa provenance : utile pour ne bloquer un jeu caché que sur une information lue. */
export function useGameCatalogSnapshot(): GameCatalogSnapshot {
  const snapshot = useSyncExternalStore(gameCatalogStore.subscribe, gameCatalogStore.getSnapshot, () => DEFAULT_SNAPSHOT)
  useEffect(() => {
    gameCatalogStore.ensureFresh()
  }, [])
  return snapshot
}

export function useGameCatalog(): GameCatalogState {
  return useGameCatalogSnapshot().state
}

/** La difficulté effective d'un jeu (réglage de la Supervision, sinon celle du code). */
export function useGameDifficulty(): (gameId: string) => GameDifficulty {
  const { difficulty } = useGameCatalog()
  return (gameId) => gameDifficulty(gameId, difficulty)
}

/** Le niveau « fait boire » effectif d'un jeu (réglage de la Supervision, sinon celui du code). */
export function useGameDrinkLevel(): (gameId: string) => GameDrinkLevel {
  const { drinkLevel } = useGameCatalog()
  return (gameId) => gameDrinkLevel(gameId, drinkLevel)
}

/** Les catégories de jeux créées par l'équipe, dans l'ordre où le hub les propose. */
export function useGameCategories(): GameCategory[] {
  return useGameCatalog().categories
}
