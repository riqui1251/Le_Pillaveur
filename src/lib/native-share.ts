/**
 * Partage d'un lien et copie de texte, dans le navigateur ET dans
 * l'application mobile (coquille Capacitor).
 *
 * L'Android WebView n'implémente pas `navigator.share` : dans l'app,
 * « Partager » retombait toujours sur la copie, sans jamais ouvrir la feuille
 * de partage Android (WhatsApp, SMS…) que le même bouton ouvre dans Chrome
 * mobile. Quand la coquille embarque @capacitor/share, Capacitor injecte en
 * mode server.url un proxy `window.Capacitor.Plugins.Share` dans la page —
 * comme SocialLogin (voir native-google-login.ts) : le site n'importe pas le
 * plugin. On l'essaie donc EN PREMIER, puis `navigator.share`, puis la copie.
 * Une app installée sans le plugin garde simplement le repli.
 */

type SharePlugin = {
  share: (options: {
    title?: string
    text?: string
    url?: string
    dialogTitle?: string
  }) => Promise<unknown>
}

function getNativeShare(): SharePlugin | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    Capacitor?: {
      isNativePlatform?: () => boolean
      Plugins?: { Share?: SharePlugin }
    }
  }
  if (!w.Capacitor?.isNativePlatform?.()) return null
  const plugin = w.Capacitor.Plugins?.Share
  return typeof plugin?.share === 'function' ? plugin : null
}

/** Texte d'une erreur, qu'elle soit une Error ou l'objet rejeté par le pont Capacitor. */
function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message)
  return String(err)
}

/** Le plugin natif rejette « Share canceled » quand le joueur referme la feuille. */
function isNativeCancel(err: unknown): boolean {
  return /cancel/i.test(errorText(err))
}

/** `navigator.share` signale la fermeture de la feuille par une AbortError. */
function isAbort(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'name' in err && err.name === 'AbortError')
}

/**
 * Copie par une zone de texte hors écran et `execCommand('copy')` : obsolète,
 * mais c'est le seul chemin quand le presse-papiers asynchrone manque (page
 * en HTTP) ou est refusé (permission, WebView ancienne).
 */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false
  const previous = document.activeElement as HTMLElement | null
  const area = document.createElement('textarea')
  area.value = text
  // readonly : pas de clavier virtuel qui surgit sur mobile. Hors écran mais
  // pas masquée : execCommand ne copie pas une sélection invisible.
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '-9999px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy') === true
  } catch {
    return false
  } finally {
    area.remove()
    // select() a volé le focus au bouton : on le lui rend (clavier, lecteur d'écran).
    previous?.focus?.({ preventScroll: true })
  }
}

/**
 * Copie `text` dans le presse-papiers. Ne rejette jamais : `false` veut dire
 * que TOUT a échoué, et c'est à l'appelant de le montrer au joueur plutôt que
 * de le laisser croire que c'est copié.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refusé : on tente l'ancienne méthode ci-dessous.
  }
  return legacyCopy(text)
}

/**
 * Issue d'un partage :
 * - `shared` : une feuille de partage s'est ouverte et le joueur a choisi ;
 * - `cancelled` : il l'a refermée — rien à afficher, surtout pas la copie ;
 * - `copied` : pas de feuille disponible, le lien est dans le presse-papiers ;
 * - `failed` : ni feuille ni copie — à signaler au joueur.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed'

export type ShareLinkOptions = {
  title: string
  text: string
  url: string
  /** Ce qui part dans le presse-papiers faute de feuille de partage. */
  clipboardText: string
}

async function runShare({ title, text, url, clipboardText }: ShareLinkOptions): Promise<ShareOutcome> {
  const native = getNativeShare()
  if (native) {
    try {
      await native.share({ title, text, url, dialogTitle: title })
      return 'shared'
    } catch (err) {
      if (isNativeCancel(err)) return 'cancelled'
      // Autre refus du plugin : la suite a encore une chance.
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (isAbort(err)) return 'cancelled'
      // Refus sans fermeture par le joueur (geste expiré, données refusées) :
      // mieux vaut copier que ne rien faire du tout.
    }
  }
  return (await copyText(clipboardText)) ? 'copied' : 'failed'
}

let inFlight: Promise<ShareOutcome> | null = null

/**
 * Partage natif de l'app, sinon du navigateur, sinon copie. Ne rejette jamais.
 *
 * Un second toucher pendant que la feuille est ouverte ne relance rien : le
 * plugin (« sharing is in progress ») comme navigator.share (InvalidStateError)
 * le refuseraient, et ce refus basculerait sur la copie — un « Lien copié »
 * trompeur sous une feuille encore ouverte.
 */
export function shareLink(options: ShareLinkOptions): Promise<ShareOutcome> {
  if (inFlight) return inFlight
  const current = runShare(options).finally(() => {
    inFlight = null
  })
  inFlight = current
  return current
}
