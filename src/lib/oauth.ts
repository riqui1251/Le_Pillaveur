/**
 * Connexion Discord, Facebook et Apple — module PUR, importable côté client.
 *
 * Flux OAuth 2.0 « code d'autorisation » mené par le SERVEUR : le client ne
 * voit jamais de jeton du fournisseur. POST /api/auth/oauth/<fournisseur>
 * prépare l'aller (état anti-rejeu dans un cookie) et renvoie l'adresse du
 * fournisseur ; GET …/callback échange le code, puis connecte, pérennise un
 * invité ou supprime le compte selon l'intention, et redirige.
 */

import { isOnlineErrorCode, type OnlineErrorCode } from '@/lib/online-errors'

export const OAUTH_PROVIDERS = ['discord', 'facebook', 'apple'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return OAUTH_PROVIDERS.some((provider) => provider === value)
}

/**
 * - login   : connexion, ou création du compte au premier passage ;
 * - upgrade : pérennisation du compte INVITÉ en cours (GuestUpgradeCard) ;
 * - delete  : preuve d'identité qui confirme la suppression du compte en
 *   cours, pour un compte sans mot de passe (AccountInfo).
 */
export const OAUTH_INTENTS = ['login', 'upgrade', 'delete'] as const
export type OAuthIntent = (typeof OAUTH_INTENTS)[number]

export function isOAuthIntent(value: unknown): value is OAuthIntent {
  return OAUTH_INTENTS.some((intent) => intent === value)
}

/**
 * Paramètre d'URL par lequel la route de retour, qui ne peut que rediriger,
 * transmet son code de refus (registre online-errors) à la page /compte. Un
 * par intention : chaque écran ne lit que le sien.
 */
export function oauthErrorParam(intent: OAuthIntent): string {
  if (intent === 'upgrade') return 'upgradeError'
  if (intent === 'delete') return 'deleteError'
  return 'authError'
}

/**
 * Relit le code de refus de l'URL courante et l'en retire (un rechargement ne
 * le réaffiche pas). Un code inconnu devient `oauth_failed` : l'URL se
 * fabrique à la main, son texte ne doit jamais s'afficher tel quel.
 */
export function takeOAuthErrorFromUrl(intent: OAuthIntent): OnlineErrorCode | null {
  if (typeof window === 'undefined') return null
  const param = oauthErrorParam(intent)
  const url = new URL(window.location.href)
  const raw = url.searchParams.get(param)
  if (!raw) return null
  url.searchParams.delete(param)
  window.history.replaceState(window.history.state, '', url.toString())
  return isOnlineErrorCode(raw) ? raw : 'oauth_failed'
}
