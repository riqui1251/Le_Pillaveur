import { isOAuthProvider, type OAuthProvider } from '@/lib/oauth'

/**
 * Moyen de confirmation exigé par la route de suppression : mot de passe,
 * Google (compte lié à Google, sans mot de passe) ou la seule session
 * (invité).
 */
export type DeleteMethod = 'password' | 'google' | 'session'

/**
 * Réponse de la sonde GET /api/auth/delete-account (null : sonde échouée).
 * Repli prudent sur le mot de passe : c'est le cas le plus courant, et le
 * serveur reste seul juge de la preuve exigée. `providers` : services
 * (Discord, Facebook) liés au compte, qui peuvent eux aussi confirmer la
 * suppression d'un compte sans mot de passe.
 */
export function parseDeleteProbe(data: unknown): { method: DeleteMethod; providers: OAuthProvider[] } {
  const body = data as { method?: unknown; providers?: unknown } | null
  const method = body?.method === 'google' || body?.method === 'session' ? body.method : 'password'
  const providers = Array.isArray(body?.providers) ? body.providers.filter(isOAuthProvider) : []
  return { method, providers }
}

/** Clé (sous `account.deleteAccount`) du message d'un refus de POST /api/auth/delete-account. */
export function deleteErrorKey(code: unknown): 'wrongPassword' | 'googleRequired' | 'founderProtected' | 'genericError' {
  if (code === 'wrong_password') return 'wrongPassword'
  if (code === 'google_confirmation_required') return 'googleRequired'
  if (code === 'founder_protected') return 'founderProtected'
  return 'genericError'
}
