/**
 * Connexion Google DANS l'application mobile (coquille Capacitor).
 *
 * Google bloque son bouton GIS et le flux OAuth dans les webviews embarquées
 * (« disallowed_useragent ») : dans l'app, on passe par la fenêtre Google
 * NATIVE via le plugin @capgo/capacitor-social-login, compilé dans la
 * coquille. Le site n'importe pas le plugin : en mode server.url, Capacitor
 * injecte un proxy `window.Capacitor.Plugins.SocialLogin` dans la page.
 * L'ID token obtenu a pour audience le même GOOGLE_CLIENT_ID (web) — les
 * routes /api/auth/google et /api/auth/guest/upgrade le vérifient tel quel.
 */
import { GOOGLE_CLIENT_ID } from '@/lib/google-auth'

type SocialLoginPlugin = {
  initialize: (options: { google: { webClientId: string } }) => Promise<void>
  login: (options: {
    provider: 'google'
    options: { scopes?: string[] }
  }) => Promise<{ result?: { idToken?: string | null } }>
}

function getSocialLogin(): SocialLoginPlugin | null {
  const w = window as Window & {
    Capacitor?: {
      isNativePlatform?: () => boolean
      Plugins?: { SocialLogin?: SocialLoginPlugin }
    }
  }
  if (!w.Capacitor?.isNativePlatform?.()) return null
  return w.Capacitor.Plugins?.SocialLogin ?? null
}

/**
 * Vrai uniquement dans la coquille mobile ET si le plugin est présent (les
 * anciennes versions de l'app sans le plugin gardent le comportement web).
 * À appeler après montage (jamais côté serveur).
 */
export function isNativeGoogleAvailable(): boolean {
  return getSocialLogin() !== null
}

let initPromise: Promise<void> | null = null

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /cancel|annul|dismiss|closed/i.test(msg)
}

/**
 * Ouvre la fenêtre Google native et renvoie l'ID token (credential),
 * ou `null` si le joueur a simplement refermé la fenêtre.
 */
export async function nativeGoogleSignIn(): Promise<string | null> {
  const plugin = getSocialLogin()
  if (!plugin) throw new Error('native_google_unavailable')
  if (!initPromise) {
    initPromise = plugin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID } })
  }
  try {
    await initPromise
  } catch (err) {
    initPromise = null
    throw err
  }
  try {
    const res = await plugin.login({
      provider: 'google',
      options: { scopes: ['email', 'profile'] },
    })
    const idToken = res?.result?.idToken
    if (!idToken) throw new Error('native_google_no_token')
    return idToken
  } catch (err) {
    if (isUserCancel(err)) return null
    throw err
  }
}
