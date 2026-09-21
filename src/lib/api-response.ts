import { resolveOnlineErrorCode, type OnlineErrorCode } from '@/lib/online-errors'

/** Parse une réponse fetch en JSON sans planter si le corps est vide */
export async function parseApiJson<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text()
  if (!text.trim()) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      res.ok
        ? 'Réponse serveur invalide'
        : `Erreur serveur (${res.status})`
    )
  }
}

/**
 * Traduit le champ `error` d'une réponse d'API : un CODE stable devient la
 * phrase du namespace i18n `onlineLobby.errors`, une valeur inconnue est
 * rendue telle quelle (un ancien texte déjà localisé côté serveur, comme le
 * refus de pseudo, reste lisible), et l'absence de valeur retombe sur le
 * message générique de l'écran.
 *
 * Pensé pour être appelé depuis un composant avec `useTranslations` :
 * `apiErrorMessage(data.error, tErrors, tErrors('generic'))`.
 */
export function apiErrorMessage(
  value: string | null | undefined,
  translate: (code: OnlineErrorCode) => string,
  fallback: string
): string {
  if (!value) return fallback
  const code = resolveOnlineErrorCode(value)
  return code ? translate(code) : value
}
