/** Issue de PATCH /api/auth/online-display-name : `error` est la valeur brute du refus, à passer à apiErrorMessage. */
export type OnlineDisplayNameResult = { ok: true } | { ok: false; error: string | undefined }

/**
 * Enregistre le pseudo EN LIGNE du compte. `error` porte un CODE quand le
 * refus vient de l'enveloppe des routes (401 auth_required, 500
 * server_error) ; les refus de pseudo, eux, y mettent une phrase DÉJÀ
 * traduite par le serveur, qu'apiErrorMessage laisse passer telle quelle —
 * d'où `error` et non `code`, qui vaudrait « profanity » ou
 * « display_name_taken », sans traduction.
 */
export async function patchOnlineDisplayName(value: string): Promise<OnlineDisplayNameResult> {
  const response = await fetch('/api/auth/online-display-name', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ onlineDisplayName: value }),
  })
  if (response.ok) return { ok: true }
  const data: unknown = await response.json().catch(() => ({}))
  const error = (data as { error?: unknown } | null)?.error
  return { ok: false, error: typeof error === 'string' ? error : undefined }
}
