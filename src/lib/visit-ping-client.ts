import { getStoredPlayers } from '@/lib/players'
import { ANALYTICS_CONSENT_COOKIE } from '@/lib/auth-cookies'

export function hasAnalyticsConsent(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .some((c) => c.trim() === `${ANALYTICS_CONSENT_COOKIE}=1`)
}

export function collectLocalPlayerNamesForPing(): string[] {
  if (typeof window === 'undefined') return []
  return getStoredPlayers()
    .map((player) => player.name)
    .filter(Boolean)
    .slice(0, 30)
}

/**
 * Ping de présence. Les pseudos locaux ne partent qu'avec le consentement
 * analytics : sans lui, le serveur ne journalise de toute façon rien côté
 * visiteur (il met seulement à jour la présence d'un compte connecté).
 */
export function syncLocalPlayersNow(): void {
  if (typeof window === 'undefined') return

  const consent = hasAnalyticsConsent()
  const body = consent
    ? { localPlayerNames: collectLocalPlayerNamesForPing(), syncLocalPlayers: true }
    : {}

  fetch('/api/analytics/ping', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}

export function sendVisitPing(): void {
  syncLocalPlayersNow()
}
