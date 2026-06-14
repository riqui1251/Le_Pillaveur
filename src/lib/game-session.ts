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
