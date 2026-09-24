/**
 * Installation « sur l'écran d'accueil » — la partie PURE, testable sans
 * navigateur : à partir de ce que le navigateur dit de lui (user-agent,
 * mode d'affichage, points de contact), sur quelle surface on est et donc
 * ce que la page /application peut proposer.
 *
 * - `installed` : le site tourne déjà en plein écran (display-mode:
 *   standalone, ou navigator.standalone sur iOS) — rien à proposer ;
 * - `ios-safari` : Safari sur iPhone/iPad. Il ne lève JAMAIS
 *   `beforeinstallprompt` ; l'installation passe par Partager → « Sur l'écran
 *   d'accueil », qu'il faut expliquer ;
 * - `other` : tout le reste. Chrome, Edge et Samsung Internet (Android et
 *   bureau) lèvent `beforeinstallprompt` quand le manifeste est valide — le
 *   bouton n'apparaît qu'à la réception de l'événement (InstallButton.tsx).
 *   Chrome et Firefox sur iOS sont des habillages de WebKit sans ce bouton
 *   Partager dans leur menu principal : on ne leur promet rien.
 *
 * La lecture du navigateur (window, navigator, matchMedia) reste dans le
 * composant : ici, que des chaînes et des booléens.
 */

export type InstallSurface = 'installed' | 'ios-safari' | 'other'

export type InstallEnvironment = {
  userAgent: string
  /** `matchMedia('(display-mode: standalone)')` ou `navigator.standalone` (iOS). */
  standalone: boolean
  /**
   * `navigator.maxTouchPoints` : depuis iPadOS 13, l'iPad se présente en
   * « Macintosh » — seuls ses points de contact le trahissent.
   */
  maxTouchPoints?: number
}

/**
 * L'événement que Chrome & co lèvent quand le site est installable. Il n'est
 * pas dans lib.dom (spécification non finalisée) ; on n'en déclare que ce
 * qu'on utilise.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** iPhone, iPod, iPad — y compris l'iPad déguisé en Mac (Macintosh + écran tactile). */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return true
  return /\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1
}

/**
 * Safari sur iOS : un appareil iOS, un moteur WebKit qui se dit Safari, et
 * NI un autre navigateur (CriOS, FxiOS, EdgiOS, OPiOS…) NI une vue web
 * d'application (Facebook, Instagram, Messenger, LINE, Twitter…), qui n'ont
 * pas le menu Partager de Safari.
 */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (!isIosDevice(userAgent, maxTouchPoints)) return false
  if (!/\bSafari\//.test(userAgent) || !/\bVersion\/\d/.test(userAgent)) return false
  if (/\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|DuckDuckGo|Brave|YaBrowser)\b/.test(userAgent)) return false
  if (/\b(FBAN|FBAV|FB_IAB|Instagram|Messenger|Line|Twitter|Snapchat|MicroMessenger)\b/.test(userAgent)) return false
  return true
}

/** La surface d'installation, à partir de ce que le navigateur dit de lui. */
export function installSurface(env: InstallEnvironment): InstallSurface {
  if (env.standalone) return 'installed'
  if (isIosSafari(env.userAgent, env.maxTouchPoints)) return 'ios-safari'
  return 'other'
}

/**
 * Où le layout de langue range l'événement `beforeinstallprompt`. Chrome ne
 * le lève qu'UNE fois par document, dès que le manifeste est validé : sur la
 * page d'entrée, bien avant qu'on navigue (côté client, sans recharger) vers
 * /application. Un écouteur posé par la carte d'installation — ou par son
 * module, chargé avec la seule route /application — arrivait donc après
 * coup : la carte ne s'affichait jamais sur Android, sauf à ouvrir
 * /application directement.
 */
export const INSTALL_PROMPT_GLOBAL = '__lpInstallPrompt'

/**
 * Script INLINE du layout de langue (exécuté pendant l'analyse du HTML, avant
 * tout bundle) : il garde l'événement sur `window`, et l'oublie une fois le
 * site installé. Il n'appelle PAS preventDefault — sur les autres pages, le
 * navigateur garde son propre bandeau d'installation, comme avant ; seule la
 * carte de /application le remplace par son bouton (InstallButton.tsx).
 */
export const INSTALL_PROMPT_CAPTURE =
  `window.addEventListener('beforeinstallprompt',function(e){window.${INSTALL_PROMPT_GLOBAL}=e});` +
  `window.addEventListener('appinstalled',function(){window.${INSTALL_PROMPT_GLOBAL}=null})`

type PromptHolder = { [INSTALL_PROMPT_GLOBAL]?: BeforeInstallPromptEvent | null }

/** L'événement retenu (par le script du layout ou par la carte), ou null. */
export function heldInstallPrompt(win: object): BeforeInstallPromptEvent | null {
  return (win as PromptHolder)[INSTALL_PROMPT_GLOBAL] ?? null
}

/** Retient un événement — ou l'oublie (null) : il ne se rejoue qu'une fois. */
export function holdInstallPrompt(win: object, event: BeforeInstallPromptEvent | null): void {
  ;(win as PromptHolder)[INSTALL_PROMPT_GLOBAL] = event
}
