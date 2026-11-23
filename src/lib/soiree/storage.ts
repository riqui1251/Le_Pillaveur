import { getSafeStorage } from '@/lib/storage'
import { isSoireeLength, isSoireeVibe } from './program'
import { recordRoundStats, SOIREE_STATE_VERSION, withinRoundCap, withoutRetiredGames, type Soiree } from './state'
import type { SoireeHistoryEntry } from './summary'

// La soirée vit sur l'appareil : un seul téléphone tourne autour de la table,
// rien ne part au serveur (choix du 22/11/2026 : stats « sur ce téléphone »).

export const SOIREE_STORAGE_KEY = 'lp-soiree-v1'
export const SOIREE_BANDES_KEY = 'lp-soiree-bandes-v1'
export const SOIREE_HISTORY_KEY = 'lp-soiree-history-v1'
/** Émis sur `window` à chaque écriture de la soirée en cours (bandeau des pages de jeu, page soirée). */
export const SOIREE_EVENT = 'lp-soiree-change'

const HISTORY_MAX = 60
const BANDES_MAX = 12

/** Une bande gardée : des joueurs locaux (src/lib/players.ts) qui reviennent ensemble. */
export type SoireeBande = {
  id: string
  name: string
  playerIds: string[]
  createdAt: number
  lastPlayedAt: number
}

function readJson(key: string): unknown {
  const storage = getSafeStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota ou navigation privée : la soirée continue, sans mémoire.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')

export function isSoiree(value: unknown): value is Soiree {
  if (!isRecord(value) || value.version !== SOIREE_STATE_VERSION) return false
  if (typeof value.id !== 'string' || !isStringArray(value.playerIds) || !isRecord(value.playerNames)) return false
  if (!isSoireeVibe(value.vibe) || typeof value.soft !== 'boolean') return false
  if (!(isSoireeLength(value.length) || value.length === 'carte')) return false
  if (typeof value.current !== 'number' || !Array.isArray(value.rounds)) return false
  if (!['programme', 'playing', 'entracte', 'finished'].includes(value.phase as string)) return false
  return value.rounds.every(
    (r) => isRecord(r) && typeof r.gameId === 'string' && typeof r.status === 'string' && isStringArray(r.playerIds) && isRecord(r.results)
  )
}

export function readSoiree(): Soiree | null {
  const value = readJson(SOIREE_STORAGE_KEY)
  return isSoiree(value) ? withinRoundCap(withoutRetiredGames(value)) : null
}

export function writeSoiree(soiree: Soiree | null): void {
  writeJson(SOIREE_STORAGE_KEY, soiree)
  if (typeof window === 'undefined') return
  const notify = () => {
    try {
      window.dispatchEvent(new Event(SOIREE_EVENT))
    } catch {
      // Event indisponible (très vieux navigateur) : la page relira au montage.
    }
  }
  // Prévenu après coup, jamais pendant le rendu d'un autre composant : un jeu
  // peut remonter ses gorgées en plein rendu (React l'interdit et le signale).
  if (typeof queueMicrotask === 'function') queueMicrotask(notify)
  else window.setTimeout(notify, 0)
}

/**
 * Branché sur updatePlayerStats (src/hooks/usePlayers.ts) : ce qu'un jeu
 * local remonte en fin de partie entre dans la manche en cours de la
 * soirée, s'il s'agit de son jeu. Sans soirée, ne fait rien.
 */
export function noteSoireeStats(
  playerId: string,
  gameId: string,
  stats: { gamesPlayed?: number; wins?: number; totalDrinks?: number }
): void {
  const soiree = readSoiree()
  if (!soiree) return
  const next = recordRoundStats(soiree, gameId, playerId, stats)
  if (next) writeSoiree(next)
}

function isBande(value: unknown): value is SoireeBande {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isStringArray(value.playerIds) &&
    typeof value.createdAt === 'number' &&
    typeof value.lastPlayedAt === 'number'
  )
}

export function readBandes(): SoireeBande[] {
  const value = readJson(SOIREE_BANDES_KEY)
  return Array.isArray(value) ? value.filter(isBande) : []
}

/** Ajoute ou met à jour une bande, la plus récente en tête. */
export function saveBande(bande: SoireeBande): SoireeBande[] {
  const next = [bande, ...readBandes().filter((b) => b.id !== bande.id)].slice(0, BANDES_MAX)
  writeJson(SOIREE_BANDES_KEY, next)
  return next
}

export function removeBande(id: string): SoireeBande[] {
  const next = readBandes().filter((b) => b.id !== id)
  writeJson(SOIREE_BANDES_KEY, next)
  return next
}

function isHistoryEntry(value: unknown): value is SoireeHistoryEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.date === 'number' &&
    typeof value.soft === 'boolean' &&
    Array.isArray(value.players) &&
    Array.isArray(value.rounds) &&
    Array.isArray(value.totals)
  )
}

export function readHistory(): SoireeHistoryEntry[] {
  const value = readJson(SOIREE_HISTORY_KEY)
  return Array.isArray(value) ? value.filter(isHistoryEntry) : []
}

/** Une soirée n'entre qu'une fois ; les plus anciennes sortent au-delà de HISTORY_MAX. */
export function pushHistory(entry: SoireeHistoryEntry): SoireeHistoryEntry[] {
  const next = [entry, ...readHistory().filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX)
  writeJson(SOIREE_HISTORY_KEY, next)
  return next
}

export function newSoireeId(now: number = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
