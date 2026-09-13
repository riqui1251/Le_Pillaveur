import { getStoredPlayers } from '@/lib/players'
import { ANALYTICS_CONSENT_COOKIE } from '@/lib/auth-cookies'

const PING_URL = '/api/analytics/ping'

export function hasAnalyticsConsent(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .some((c) => c.trim() === `${ANALYTICS_CONSENT_COOKIE}=1`)
}

export function collectLocalPlayerNamesForPing(): string[] {
  if (typeof window === 'undefined') return []
  return getStoredPlayers()
    .map((player) => player.name)
    .filter(Boolean)
    .slice(0, 30)
}

/**
 * Trois messages distincts vers la même route, qu'on ne mélange plus : avant,
 * un corps unique partait du minuteur ET de chaque synchro de joueurs (y
 * compris à chaque mise à jour de stats en partie locale), et chacun comptait
 * comme de la présence.
 * - { view: true } : une vue de page, une fois par chargement ;
 * - { beat: true } : battement d'une page réellement utilisée (VisitTracker) ;
 * - { localPlayers: true, localPlayerNames } : pseudos locaux, jamais une
 *   présence (drapeau neuf : l'ancien `syncLocalPlayers` est ignoré).
 *
 * Réponse JSON, ou null si la requête ou sa lecture échoue : erreur avalée, la
 * mesure ne doit jamais gêner le jeu.
 */
function postPing(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return fetch(PING_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then(
      (json: unknown) =>
        json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : null,
      () => null,
    )
}

/** Requête « vue » de ce document ; null tant qu'elle n'est pas partie. */
let viewRequest: Promise<unknown> | null = null

/**
 * Vue de page : compte le lecteur qui ne touche à rien (pages de règles
 * arrivées par la recherche). Le serveur ne l'enregistre qu'avec le
 * consentement et ne touche jamais la dernière activité d'un compte.
 * Une seule par document, même si le traceur est remonté (StrictMode en dev).
 */
export function sendView(): void {
  if (typeof window === 'undefined' || viewRequest) return
  viewRequest = postPing({ view: true })
}

/**
 * Battement de présence — les conditions (visibilité, interaction, cadence)
 * sont vérifiées par l'appelant. Résolue à la réponse (jamais rejetée) : le
 * traceur y enchaîne la synchro des pseudos restée en attente.
 */
export function sendHeartbeat(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  return postPing({ beat: true }).then(() => undefined)
}

/**
 * Clé de la dernière liste de noms CONFIRMÉE par le serveur, au niveau du
 * module : partagée par toutes les instances de usePlayers (la page et le
 * composant de jeu en montent chacune une). null au départ : la première
 * liste d'un document part toujours, vide comprise (stockage local vidé alors
 * que le serveur garde l'ancienne liste). Un renvoi à l'identique ne coûte
 * aucune écriture côté serveur.
 */
let syncedNamesKey: string | null = null
/** Clé en cours d'envoi : deux appels rapprochés n'envoient pas deux fois la même liste. */
let pendingNamesKey: string | null = null

/**
 * Synchro des pseudos locaux. AUCUN fetch sans consentement (avant : un corps
 * vide qui ne servait qu'à gonfler la présence du compte) ; avec consentement,
 * seulement quand la liste des NOMS diffère de la dernière liste confirmée —
 * une mise à jour de stats ne déclenche donc rien.
 *
 * Confirmée seulement si le serveur répond `localPlayersSynced` : sans
 * présence du navigateur (premier passage, consentement donné en cours de
 * page), la synchro ne patche rien et reste à refaire. VisitTracker la relance
 * après chaque battement — qui, lui, crée la présence ; l'appel ne coûte rien
 * une fois la liste confirmée.
 */
export function syncLocalPlayersNow(): void {
  if (typeof window === 'undefined') return
  if (!hasAnalyticsConsent()) return

  const localPlayerNames = collectLocalPlayerNamesForPing()
  const key = JSON.stringify(localPlayerNames)
  if (key === syncedNamesKey || key === pendingNamesKey) return
  pendingNamesKey = key

  const send = () =>
    postPing({ localPlayers: true, localPlayerNames }).then((result) => {
      // Réponse d'une liste déjà remplacée par une plus récente : ignorée.
      if (pendingNamesKey !== key) return
      pendingNamesKey = null
      if (result?.localPlayersSynced === true) syncedNamesKey = key
    })
  // Après la vue du document : avec consentement, elle crée la fiche du
  // navigateur (et son cookie visiteur) que la synchro vient compléter.
  // Lancées ensemble au premier chargement, la synchro pouvait arriver avant
  // et se perdre.
  if (viewRequest) void viewRequest.then(send)
  else void send()
}
