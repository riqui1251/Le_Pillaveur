/**
 * Connexion Google — flux « Google Identity Services » (ID token).
 * L'ID client OAuth est une valeur PUBLIQUE (il est visible dans le HTML de
 * toute page utilisant le bouton Google) : le hardcoder ici est sans risque
 * et évite de le faufiler dans le build Docker via une variable d'env.
 * Module sans dépendance serveur, importable côté client.
 */
export const GOOGLE_CLIENT_ID =
  '237366141299-m9f6f566bvul01689suook615u25nlc8.apps.googleusercontent.com'

/** Réponse du callback GIS côté client (credential = ID token JWT). */
export type GoogleCredentialResponse = {
  credential?: string
}

/** Surface minimale de l'API `google.accounts.id` injectée par le script GIS. */
export type GoogleAccountsId = {
  initialize: (config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
  }) => void
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'large' | 'medium' | 'small'
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      logo_alignment?: 'left' | 'center'
      width?: number
      locale?: string
    }
  ) => void
}

export function getGoogleAccountsId(): GoogleAccountsId | null {
  const w = window as Window & {
    google?: { accounts?: { id?: GoogleAccountsId } }
  }
  return w.google?.accounts?.id ?? null
}
