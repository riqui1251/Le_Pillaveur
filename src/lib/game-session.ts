import { useCallback, useEffect, useRef, useState } from 'react'

import { getSafeStorage } from '@/lib/storage'

const PREFIX = 'lp-game-session:'

export type GameSessionMeta = {
  active: true
  mode: 'new' | 'resume'
  difficulty?: string
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function markGameSessionActive(
  gameId: string,
  meta: { mode: 'new' | 'resume'; difficulty?: string }
): void {
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.setItem(`${PREFIX}${gameId}`, JSON.stringify({ active: true, ...meta }))
  } catch {
    // sessionStorage plein ou inaccessible
  }
}

export function clearGameSession(gameId: string): void {
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.removeItem(`${PREFIX}${gameId}`)
  } catch {
    // ignore
  }
}

export function readGameSession(gameId: string): GameSessionMeta | null {
  const storage = getSessionStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(`${PREFIX}${gameId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameSessionMeta
    return parsed?.active ? parsed : null
  } catch {
    return null
  }
}

/** Reprendre depuis localStorage si une sauvegarde active existe (changement de langue). */
export function shouldResumeFromSave(gameSaveKey: string): boolean {
  const storage = getSafeStorage()
  if (!storage) return false
  try {
    const raw = storage.getItem(gameSaveKey)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { gameStarted?: boolean }
    return parsed.gameStarted === true
  } catch {
    return false
  }
}

// ─── Reprise de partie LOCALE ────────────────────────────────────────────────
// Pourquoi : en mode local (un seul téléphone qui tourne autour de la table),
// une partie de Pyramide dure 30 à 45 minutes et un simple swipe retour, un clic
// sur le logo ou un onglet rechargé par le navigateur mobile la perdait
// entièrement. On sérialise donc l'état dans localStorage, on le PROPOSE au
// retour (jamais imposé), et on le purge dès qu'il est périmé ou que la partie
// est terminée.

/** Au-delà de 3 jours, reprendre une partie de soirée n'a plus aucun intérêt. */
export const LOCAL_GAME_SAVE_TTL_MS = 3 * 24 * 60 * 60 * 1000

const LOCAL_SAVE_PREFIX = 'lp-local-save:'

export type LocalGameSaveEnvelope<T> = {
  /** Incrémenté quand la forme de l'état change : une vieille sauvegarde est jetée. */
  version: number
  savedAt: number
  state: T
}

export function localGameSaveKey(gameId: string): string {
  return `${LOCAL_SAVE_PREFIX}${gameId}`
}

/**
 * Cœur testable de la reprise : validation de version, de fraîcheur et de JSON,
 * isolée du stockage pour pouvoir être couverte par des tests unitaires.
 */
export function parseLocalGameSave<T>(
  raw: string | null,
  version: number,
  now: number = Date.now()
): T | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LocalGameSaveEnvelope<T> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.version !== version) return null
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null
    // Une sauvegarde datée du futur (horloge remise à l'heure) reste acceptée :
    // seule l'ancienneté disqualifie une partie.
    if (now - parsed.savedAt > LOCAL_GAME_SAVE_TTL_MS) return null
    if (parsed.state === undefined || parsed.state === null) return null
    return parsed.state
  } catch {
    return null
  }
}

/** Lit la sauvegarde d'un jeu local ; purge au passage toute entrée illisible ou périmée. */
export function readLocalGameSave<T>(
  gameId: string,
  version: number,
  now: number = Date.now()
): T | null {
  const storage = getSafeStorage()
  if (!storage) return null
  const key = localGameSaveKey(gameId)
  let raw: string | null = null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  const state = parseLocalGameSave<T>(raw, version, now)
  if (state === null && raw !== null) {
    try {
      storage.removeItem(key)
    } catch {
      // ignore
    }
  }
  return state
}

export function writeLocalGameSave<T>(gameId: string, version: number, state: T): void {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    const envelope: LocalGameSaveEnvelope<T> = { version, savedAt: Date.now(), state }
    storage.setItem(localGameSaveKey(gameId), JSON.stringify(envelope))
  } catch {
    // localStorage plein, état non sérialisable ou navigation privée : on
    // n'empêche jamais la partie de continuer pour une sauvegarde ratée.
  }
}

export function clearLocalGameSave(gameId: string): void {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    storage.removeItem(localGameSaveKey(gameId))
  } catch {
    // ignore
  }
}

export type ResumableLocalGame<T> = {
  /** false tant que localStorage n'a pas été lu : évite tout flash à l'hydratation */
  ready: boolean
  /** Sauvegarde PROPOSÉE, jamais appliquée d'office : le joueur tranche. */
  pending: T | null
  /** Accepte la reprise : renvoie l'état à réinjecter et retire la proposition. */
  accept: () => T | null
  /** Refuse la reprise : la sauvegarde est effacée, une partie neuve démarre. */
  discard: () => void
  save: (state: T) => void
  /** Fin de partie : une partie terminée ne doit rien laisser derrière elle. */
  clear: () => void
}

/**
 * Câblage React de la reprise locale, partagé par tous les jeux locaux :
 * la logique vit ici, chaque jeu ne dessine que sa propre bannière de reprise.
 */
export function useResumableLocalGame<T>(
  gameId: string,
  version: number,
  /**
   * Facultatif : dit si la sauvegarde est encore reprenable AUJOURD'HUI (même
   * table, mêmes réglages). Sans lui, on proposerait « Reprendre » pour une
   * sauvegarde que le jeu refusera ensuite — le joueur cliquerait et verrait
   * démarrer une partie neuve, sans comprendre.
   */
  isResumable?: (state: T) => boolean
): ResumableLocalGame<T> {
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<T | null>(null)
  // Le prédicat change d'identité à chaque rendu : on le lit par référence
  // pour ne pas relancer la lecture du stockage en boucle.
  const resumableRef = useRef(isResumable)
  resumableRef.current = isResumable

  useEffect(() => {
    const saved = readLocalGameSave<T>(gameId, version)
    const check = resumableRef.current
    if (saved !== null && check && !check(saved)) {
      // Périmée pour cette table : on la jette au lieu de la proposer.
      clearLocalGameSave(gameId)
      setPending(null)
    } else {
      setPending(saved)
    }
    setReady(true)
  }, [gameId, version])

  const accept = useCallback(() => {
    const state = pending
    setPending(null)
    return state
  }, [pending])

  const discard = useCallback(() => {
    clearLocalGameSave(gameId)
    setPending(null)
  }, [gameId])

  const save = useCallback(
    (state: T) => {
      writeLocalGameSave(gameId, version, state)
    },
    [gameId, version]
  )

  const clear = useCallback(() => {
    clearLocalGameSave(gameId)
    setPending(null)
  }, [gameId])

  return { ready, pending, accept, discard, save, clear }
}

/**
 * Garde de table : une sauvegarde ne se reprend QUE si elle a été faite avec
 * exactement les mêmes joueurs. Sans ce contrôle, reprendre une sauvegarde
 * d'une autre soirée rejoue des index de joueur hors bornes et crédite des
 * gorgées à des gens qui n'ont jamais joué la partie.
 * Comparaison par ensemble : l'ordre d'affichage de la table n'a pas à compter.
 */
export function isSameLocalTable(savedPlayerIds: unknown, players: { id: string }[]): boolean {
  if (!Array.isArray(savedPlayerIds)) return false
  if (savedPlayerIds.length !== players.length) return false
  const saved = new Set(savedPlayerIds.filter((id): id is string => typeof id === 'string'))
  const current = new Set(players.map(p => p.id))
  if (saved.size !== current.size) return false
  for (const id of current) {
    if (!saved.has(id)) return false
  }
  return true
}
