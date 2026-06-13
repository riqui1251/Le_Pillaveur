import { getStoredPlayers } from '@/lib/players'

export function collectLocalPlayerNamesForPing(): string[] {
  if (typeof window === 'undefined') return []
  return getStoredPlayers()
    .map((player) => player.name)
    .filter(Boolean)
    .slice(0, 30)
}

export function sendVisitPing(): void {
  if (typeof window === 'undefined') return

  const localPlayerNames = collectLocalPlayerNamesForPing()
  const hasBody = localPlayerNames.length > 0

  fetch('/api/analytics/ping', {
    method: 'POST',
    credentials: 'include',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify({ localPlayerNames }) : undefined,
  }).catch(() => {})
}
