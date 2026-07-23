import { GOOGLE_CLIENT_ID } from './google-auth'

/**
 * Vérification SERVEUR d'un ID token Google via l'endpoint tokeninfo
 * (signature, expiration et intégrité contrôlées par Google). On re-vérifie
 * ensuite l'audience et l'émetteur. Partagé par la connexion Google et la
 * pérennisation d'un compte invité.
 */

export type GoogleTokenClaims = {
  aud?: string
  iss?: string
  sub?: string
  email?: string
  email_verified?: string
  name?: string
  given_name?: string
}

export async function verifyGoogleIdToken(credential: string): Promise<GoogleTokenClaims | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: controller.signal, cache: 'no-store' }
    )
    if (!res.ok) return null
    const claims = (await res.json()) as GoogleTokenClaims
    if (claims.aud !== GOOGLE_CLIENT_ID) return null
    if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return null
    if (claims.email_verified !== 'true') return null
    if (!claims.email || !claims.sub) return null
    return claims
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
