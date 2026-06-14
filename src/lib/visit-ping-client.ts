import { getStoredPlayers } from '@/lib/players'

export function collectLocalPlayerNamesForPing(): string[] {
  if (typeof window === 'undefined') return []
  return getStoredPlayers()
    .map((player) => player.name)
    .filter(Boolean)
    .slice(0, 30)
}

/** Envoie immédiatement les joueurs locaux au serveur (visiteur anonyme ou connecté). */
export function syncLocalPlayersNow(): void {
  if (typeof window === 'undefined') return

  const localPlayerNames = collectLocalPlayerNamesForPing()

  fetch('/api/analytics/ping', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localPlayerNames, syncLocalPlayers: true }),
  }).catch(() => {})
}

export function sendVisitPing(): void {
  syncLocalPlayersNow()
}
