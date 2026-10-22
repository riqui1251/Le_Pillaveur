/**
 * « Plus tard » à la question du micro, mémorisé PAR SALLE pour la session
 * de l'onglet (sessionStorage) : le refus tenait dans une ref du dock, perdue
 * au rechargement — et la carte revenait se poser sur l'écran à chaque page.
 * Une nouvelle table repose la question ; un nouvel onglet aussi.
 *
 * Stockage indisponible (navigation privée stricte, quota) : on retombe sur
 * la mémoire du dock, sans erreur.
 */

export const VOICE_PROMPT_LATER_KEY = 'lp-voice-prompt-later'
/** Assez pour une soirée de tables ; au-delà, les plus anciennes s'effacent. */
const MAX_ROOMS = 20

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): SessionStore | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function readRooms(store: SessionStore): string[] {
  try {
    const raw = store.getItem(VOICE_PROMPT_LATER_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** La question du micro a-t-elle déjà reçu « Plus tard » pour cette salle ? */
export function isVoicePromptDeferred(roomId: string, store: SessionStore | null = defaultStore()): boolean {
  if (!store) return false
  return readRooms(store).includes(roomId)
}

/** Note « Plus tard » pour cette salle. */
export function deferVoicePrompt(roomId: string, store: SessionStore | null = defaultStore()) {
  if (!store) return
  try {
    const rooms = readRooms(store).filter((id) => id !== roomId)
    rooms.push(roomId)
    store.setItem(VOICE_PROMPT_LATER_KEY, JSON.stringify(rooms.slice(-MAX_ROOMS)))
  } catch {
    // Quota ou stockage bloqué : la mémoire du dock suffit pour cette page.
  }
}
