import { readLocalAmbianceMode } from '@/lib/ambiance-mode'
import { nameValidationI18nKey, validateAccountDisplayName } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'

/**
 * Création d'un compte INVITÉ (un pseudo, lié à ce navigateur) — une seule
 * porte pour le guichet de table (JoinGate) et la feuille de connexion
 * (AuthSheet) : le jour où la route ou ses codes bougent, il n'y a qu'un
 * endroit à suivre. Chaque écran dit le résultat avec ses propres phrases.
 */

export type GuestNameRejection = ReturnType<typeof nameValidationI18nKey>

/**
 * Pseudo refusé AVANT tout envoi : la clé de `common.nameValidation` à
 * afficher, ou null s'il passe. Un juron est signalé à la modération.
 */
export function rejectGuestName(displayName: string): GuestNameRejection | null {
  const trimmed = displayName.trim()
  const validation = validateAccountDisplayName(trimmed)
  if (validation.ok) return null
  void reportProfanityIfNeeded(trimmed, validation.reason, 'guest')
  return nameValidationI18nKey(validation.reason)
}

export type GuestSessionResult =
  /** Session posée : invité tout juste créé, ou compte déjà connecté que la route renvoie tel quel. */
  | { kind: 'created' }
  /** Âge jamais certifié sur ce navigateur (403 age_gate_required). */
  | { kind: 'age-gate' }
  /** Quota du réseau atteint (grosse tablée, CGNAT) : délai donné par la route. */
  | { kind: 'rate-limited'; retryAfterSec: number }
  /** Autre refus : `error` tel que la route l'a renvoyé, à passer à apiErrorMessage. */
  | { kind: 'refused'; error: string | null }
  | { kind: 'network' }

export async function createGuestSession(displayName: string, locale: string): Promise<GuestSessionResult> {
  let res: Response
  try {
    res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // Ambiance de l'appareil : dans l'app, un invité sans choix naît
      // « Sans alcool » (politique Google Play) ; le compte prime ensuite.
      body: JSON.stringify({ displayName: displayName.trim(), locale, ambianceMode: readLocalAmbianceMode() }),
    })
  } catch {
    return { kind: 'network' }
  }
  const data = await res.json().catch(() => null)
  if (res.status === 403 && data?.code === 'age_gate_required') return { kind: 'age-gate' }
  if (data?.code === 'rate_limited') {
    return { kind: 'rate-limited', retryAfterSec: typeof data.retryAfterSec === 'number' ? data.retryAfterSec : 60 }
  }
  if (!res.ok) {
    // `error` et pas `code` : les refus de pseudo y mettent une phrase DÉJÀ
    // traduite par le serveur (elle dit ce qui cloche), qu'apiErrorMessage
    // laisse passer telle quelle — leur `code` (« profanity ») n'a, lui, pas
    // de traduction. Ailleurs, `error` porte un code (« service_unavailable »).
    return { kind: 'refused', error: typeof data?.error === 'string' ? data.error : null }
  }
  return { kind: 'created' }
}
