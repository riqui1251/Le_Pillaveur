import { getStoredPlayers } from '@/lib/players'
import { ANALYTICS_CONSENT_COOKIE, isAnalyticsConsentGranted } from '@/lib/auth-cookies'
import { beatBody, type BeatDetail } from '@/lib/heartbeat'

const PING_URL = '/api/analytics/ping'

/**
 * Consentement ACCORDÉ, lu comme le serveur (isAnalyticsConsentGranted) :
 * seule la valeur de version 2 compte. L'ancien '1', donné sous le libellé
 * « anonymes », ne vaut plus accord : le bandeau est reposé, et d'ici là ni
 * synchro des pseudos locaux ni détail du battement ne part.
 */
export function hasAnalyticsConsent(): boolean {
  if (typeof document === 'undefined') return false
  const prefix = `${ANALYTICS_CONSENT_COOKIE}=`
  const entry = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix))
  return isAnalyticsConsentGranted(entry?.slice(prefix.length))
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
 * - { beat: true } : battement d'une page réellement utilisée (VisitTracker),
 *   plus { active, inGame } avec le consentement ;
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
 *
 * `extra` (actif, en partie) n'est ajouté au corps QUE si le consentement est
 * accordé au moment de l'envoi (beatBody) : il nourrit le détail des visites
 * du compte, fondé sur ce seul consentement. Sans lui, { beat: true } seul.
 */
export function sendHeartbeat(extra?: BeatDetail): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  return postPing(beatBody(extra, hasAnalyticsConsent())).then(() => undefined)
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
 * Oublie la synchro confirmée : à appeler après un choix sur les statistiques
 * (AgeGate). Un refus efface la présence du navigateur et ses pseudos ; sans
 * cette remise à zéro, un nouvel accord dans le même document laissait la
 * présence recréée sans pseudos jusqu'au rechargement. Une réponse encore en
 * vol est ignorée (pendingNamesKey ne correspond plus).
 */
export function resetLocalPlayersSync(): void {
  syncedNamesKey = null
  pendingNamesKey = null
}

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
