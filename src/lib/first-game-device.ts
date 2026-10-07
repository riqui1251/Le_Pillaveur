import { getSafeStorage } from '@/lib/storage'
import { AGE_VERIFIED_COOKIE } from '@/lib/auth-cookies'

// ─── Avis de PREMIÈRE partie : mémoire de l'appareil ─────────────────────────
// Pourquoi : 10 avis en 4 mois. Le formulaire « Signaler / Suggérer » attend
// qu'on vienne le chercher ; le seul moment où un nouveau a un avis tout frais
// est la fin de sa toute première partie. On le lui demande donc là, UNE fois.
//
// En LIGNE, le serveur sait qui débute (succès first_game récent, compte
// jeune, jamais sollicité — cf. src/lib/first-game-feedback.ts). En LOCAL, il
// n'y a pas de serveur : c'est l'appareil qui doit savoir s'il découvre le
// site. D'où ce drapeau, posé à la toute PREMIÈRE page vue (avant toute
// partie) par FirstGameDeviceInit :
//  - 'fresh'   : rien sur l'appareil ne trahit une visite passée → un nouveau,
//                pendant 24 h seulement (voir FIRST_GAME_FRESH_WINDOW_MS) ;
//  - 'veteran' : l'appareil a déjà servi → un habitué, qu'on ne sollicite pas
//                en local (au déploiement, tout appareil passé par le portail
//                d'âge l'est, même si son stockage a été vidé) ;
//  - 'asked'   : la question a été posée (réponse, « Non merci », ou deux
//                affichages sans réponse) → plus jamais, en local comme en ligne.
// `seen` compte les affichages : un écran de fin démonté par la revanche avant
// toute réponse laisse UNE seconde chance, pas plus. `since` date la pose du
// drapeau, c'est-à-dire la première visite.
//
// v:2 — la v:1 n'avait pas de `since` : un appareil neuf qui ne jouait qu'à
// des jeux sans carte (Purple, 1220…) restait « nouveau » indéfiniment, et
// « Alors, cette première partie ? » tombait des semaines plus tard. Jamais
// déployée : une v:1 relue vaut absence, le drapeau est simplement recalculé.
// Un compte CONNECTÉ, lui, est en plus jugé par le serveur (cf. la carte) :
// un habitué sur un téléphone neuf est 'fresh' avant de se connecter.

/** Clé localStorage (même famille « lp-… » que les autres mémoires de l'appareil). */
export const FIRST_GAME_DEVICE_KEY = 'lp-first-game-feedback'

/** Au deuxième affichage sans réponse, l'appareil passe à 'asked'. */
export const FIRST_GAME_FEEDBACK_MAX_SHOWN = 2

/**
 * Durée pendant laquelle un appareil neuf reste « nouveau » après sa première
 * visite. Un premier contact se joue dans la soirée ; au-delà, la première
 * partie à porter une carte n'est plus forcément la première partie tout
 * court (les jeux sans carte n'éteignent pas le drapeau). Même ordre de
 * grandeur que la fenêtre du serveur après first_game.
 */
export const FIRST_GAME_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

export type FirstGameDeviceState = 'fresh' | 'veteran' | 'asked'

export type FirstGameDeviceFlag = { v: 2; state: FirstGameDeviceState; seen: number; since: number }

export type FirstGamePlayMode = 'online' | 'local'

const STATES: readonly FirstGameDeviceState[] = ['fresh', 'veteran', 'asked']

// Traces d'une activité PASSÉE, relevées dans le code (pas devinées) :
/** Tutoriel d'un jeu en ligne déjà vu (GameTutorialModal, une clé par jeu). */
export const TUTORIAL_SEEN_PREFIX = 'lp-tutorial-seen-'
/** Derniers jeux locaux ouverts avec une table (RECENT_LOCAL_GAMES_KEY). */
export const RECENT_LOCAL_GAMES_STORAGE_KEY = 'lp-recent-local-games'
/** Une session a déjà existé sur l'appareil (AuthForm). */
export const HAS_LOGGED_IN_KEY = 'lp-has-logged-in'
/** Partie locale en cours sauvegardée (localGameSaveKey de game-session.ts). */
export const LOCAL_SAVE_PREFIX = 'lp-local-save:'
/** Joueurs locaux et leurs statistiques (STORAGE_KEY de players.ts). */
export const LOCAL_PLAYERS_KEY = 'game_players'

// Les clés sont recopiées plutôt qu'importées : ce module est monté sur TOUTES
// les pages (Providers), il ne doit pas tirer le catalogue des jeux ni la
// modération des pseudos. Le test vérifie qu'elles collent aux modules d'origine.
// (Le nom du cookie d'âge, lui, vient d'un module de constantes sans dépendance.)

/** Ce que ce module lit du stockage — un localStorage, ou son double en test. */
export type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

/** Relit le drapeau stocké ; tout ce qui n'a pas exactement la forme attendue vaut absence. */
export function parseFirstGameDeviceFlag(raw: string | null): FirstGameDeviceFlag | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { v, state, seen, since } = parsed as Record<string, unknown>
  if (v !== 2) return null
  if (typeof state !== 'string' || !STATES.includes(state as FirstGameDeviceState)) return null
  if (typeof seen !== 'number' || !Number.isInteger(seen) || seen < 0) return null
  if (typeof since !== 'number' || !Number.isFinite(since) || since < 0) return null
  return { v: 2, state: state as FirstGameDeviceState, seen, since }
}

function nonEmptyJsonArray(raw: string | null): boolean {
  if (!raw) return false
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0
  } catch {
    return false
  }
}

/** Au moins un joueur local qui a terminé une partie (stats.gamesPlayed > 0). */
function hasLocalPlayerWithGames(raw: string | null): boolean {
  if (!raw) return false
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return false
    return parsed.some((player) => {
      const played = (player as { stats?: { gamesPlayed?: unknown } } | null)?.stats?.gamesPlayed
      return typeof played === 'number' && played > 0
    })
  } catch {
    return false
  }
}

/**
 * Le portail d'âge a-t-il déjà été franchi ? Son cookie (lp_age_verified) est
 * la trace de visite la plus solide : posé par le SERVEUR (une purge du
 * stockage script par Safari ne l'emporte pas), lisible en JS, valable un an,
 * et forcément absent à la toute première page vue — le portail n'y a pas
 * encore été franchi.
 */
function hasAgeVerifiedCookie(cookies: string): boolean {
  return cookies.split(';').some((part) => part.trim().startsWith(`${AGE_VERIFIED_COOKIE}=`))
}

/**
 * L'appareil montre-t-il une activité passée ? Un seul indice suffit : mieux
 * vaut ne pas solliciter un nouveau (on perd un avis) que présenter « ta
 * première partie » à un habitué (on perd la confiance). `cookies` : la
 * chaîne de document.cookie.
 */
export function hasPastActivity(storage: DeviceStorage, cookies = ''): boolean {
  if (hasAgeVerifiedCookie(cookies)) return true
  if (storage.getItem(HAS_LOGGED_IN_KEY) !== null) return true
  if (nonEmptyJsonArray(storage.getItem(RECENT_LOCAL_GAMES_STORAGE_KEY))) return true
  if (hasLocalPlayerWithGames(storage.getItem(LOCAL_PLAYERS_KEY))) return true
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && (key.startsWith(TUTORIAL_SEEN_PREFIX) || key.startsWith(LOCAL_SAVE_PREFIX))) return true
  }
  return false
}

/** Drapeau d'un appareil qui n'en avait pas encore : habitué ou nouveau, rien d'affiché. */
export function initialFirstGameDeviceFlag(
  storage: DeviceStorage,
  cookies = '',
  now: number = Date.now()
): FirstGameDeviceFlag {
  return { v: 2, state: hasPastActivity(storage, cookies) ? 'veteran' : 'fresh', seen: 0, since: now }
}

/**
 * Appareil encore « nouveau » à `now` : 'fresh' ET dans les 24 h de la
 * première visite. Une date à venir (horloge recalée) compte comme récente,
 * comme côté serveur.
 */
export function isFreshFirstGameDevice(flag: FirstGameDeviceFlag, now: number = Date.now()): boolean {
  return flag.state === 'fresh' && now - flag.since <= FIRST_GAME_FRESH_WINDOW_MS
}

/**
 * Faut-il poser la question sur CET écran de fin ?
 * - local : un appareil neuf (24 h après sa première visite au plus), deux
 *   affichages au plus ; avec un compte connecté, le serveur doit en plus
 *   le juger éligible (`serverEligible` : compte jeune, jamais sollicité) —
 *   sans compte, `serverEligible` est absent et l'appareil décide seul ;
 * - en ligne : le serveur a déjà écarté les vieux comptes et les comptes déjà
 *   sollicités (`serverEligible`) ; l'appareil ne fait qu'éviter la répétition
 *   (un habitué du local peut tout à fait découvrir le jeu en ligne).
 */
export function shouldAskFirstGameFeedback({
  device,
  mode,
  serverEligible,
  now = Date.now(),
}: {
  device: FirstGameDeviceFlag | null
  mode: FirstGamePlayMode
  serverEligible?: boolean
  now?: number
}): boolean {
  // Sans mémoire de l'appareil (stockage refusé), rien ne bornerait les
  // affichages : on ne demande pas.
  if (!device) return false
  if (device.seen >= FIRST_GAME_FEEDBACK_MAX_SHOWN) return false
  if (mode === 'local') return isFreshFirstGameDevice(device, now) && serverEligible !== false
  return serverEligible === true && device.state !== 'asked'
}

/** Un affichage de plus ; au plafond, l'appareil est considéré comme sollicité. */
export function flagAfterShown(flag: FirstGameDeviceFlag): FirstGameDeviceFlag {
  const seen = flag.seen + 1
  return { ...flag, state: seen >= FIRST_GAME_FEEDBACK_MAX_SHOWN ? 'asked' : flag.state, seen }
}

/** Réponse donnée (note envoyée ou « Non merci ») : plus jamais. */
export function flagAfterAsked(flag: FirstGameDeviceFlag): FirstGameDeviceFlag {
  return { ...flag, state: 'asked' }
}

/**
 * Le compte connecté n'est pas un nouveau (ancien, ou déjà sollicité) : un
 * appareil 'fresh' devient 'veteran' — plus de question en local, ni de
 * requête à chaque écran de fin. 'asked' reste 'asked'.
 */
export function flagAsVeteran(flag: FirstGameDeviceFlag): FirstGameDeviceFlag {
  return flag.state === 'fresh' ? { ...flag, state: 'veteran' } : flag
}

// ─── Accès au stockage (navigateur) ──────────────────────────────────────────
// Jamais bloquant : un stockage plein ou refusé n'empêche ni de jouer ni
// d'afficher l'écran de fin — la question n'est simplement pas posée.

function writeFlag(storage: DeviceStorage, flag: FirstGameDeviceFlag): void {
  try {
    storage.setItem(FIRST_GAME_DEVICE_KEY, JSON.stringify(flag))
  } catch {
    // quota ou stockage en lecture seule : tant pis
  }
}

/** document.cookie, ou '' hors navigateur (ou s'il est inaccessible). */
function documentCookies(): string {
  try {
    return typeof document === 'undefined' ? '' : document.cookie
  } catch {
    return ''
  }
}

/**
 * Lit le drapeau, et le POSE s'il manque (ou s'il est illisible). Appelé à la
 * première page vue par FirstGameDeviceInit, et par la carte elle-même en
 * secours (stockage vidé entre-temps). Null hors navigateur ou stockage refusé.
 */
export function initFirstGameDeviceFlag(
  storage: DeviceStorage | null = getSafeStorage(),
  cookies: string = documentCookies(),
  now: number = Date.now()
): FirstGameDeviceFlag | null {
  if (!storage) return null
  try {
    const existing = parseFirstGameDeviceFlag(storage.getItem(FIRST_GAME_DEVICE_KEY))
    if (existing) return existing
    const flag = initialFirstGameDeviceFlag(storage, cookies, now)
    writeFlag(storage, flag)
    return flag
  } catch {
    return null
  }
}

function updateFlag(
  storage: DeviceStorage | null,
  next: (flag: FirstGameDeviceFlag) => FirstGameDeviceFlag
): void {
  const flag = initFirstGameDeviceFlag(storage)
  if (!storage || !flag) return
  writeFlag(storage, next(flag))
}

/** La carte vient de s'afficher : seen + 1 (et 'asked' au deuxième affichage). */
export function noteFirstGameFeedbackShown(storage: DeviceStorage | null = getSafeStorage()): void {
  updateFlag(storage, flagAfterShown)
}

/** Le joueur a répondu (note envoyée ou « Non merci ») : l'appareil ne redemandera plus. */
export function markFirstGameFeedbackAsked(storage: DeviceStorage | null = getSafeStorage()): void {
  updateFlag(storage, flagAfterAsked)
}

/** Le serveur écarte le compte connecté : l'appareil cesse d'être « nouveau » (cf. flagAsVeteran). */
export function markFirstGameDeviceVeteran(storage: DeviceStorage | null = getSafeStorage()): void {
  updateFlag(storage, flagAsVeteran)
}
