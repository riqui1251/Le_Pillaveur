import { GAMES, getGameById } from '@/lib/games'
import { stripLocalePrefix } from '@/i18n/routing'

// ─── Mesure ANONYME des parties LOCALES — côté joueur ────────────────────────
// Pourquoi : 61 % des comptes Google / e-mail n'ont jamais joué en ligne, et
// les jeux LOCAUX (un téléphone qui tourne autour de la table) n'écrivaient
// rien nulle part — on ignorait jusqu'à quel jeu local se lance, et lequel
// est quitté avant la fin. Le journal des parties en ligne ne peut pas les
// voir : pas de salle, pas de compte requis.
//
// Ce qui part : `{ gameId, event }`, rien d'autre. Ni compte, ni pseudo, ni
// identifiant d'appareil, ni cookie (credentials 'omit' sur le repli fetch ;
// un sendBeacon emporte les cookies du site, la route ne les lit pas). Le
// serveur n'en garde que deux compteurs par jeu et par jour de Paris
// (LocalGameDaily) — aucune donnée personnelle, donc pas de consentement à
// demander : rien ne permet de rattacher un compteur à une personne.
//
// Module PUR à l'import (aucun accès à `window` hors des fonctions) : la
// route l'importe pour partager le contrat — mêmes événements, même règle de
// « jeu local » des deux côtés.

/** Route de réception (src/app/api/analytics/local-game/route.ts). */
export const LOCAL_GAME_ENDPOINT = '/api/analytics/local-game'

/**
 * 'start' : la page du jeu s'ouvre avec une table locale (layout des pages de
 * jeu, via useRecordRecentLocalGame). 'end' : la PREMIÈRE partie lancée de
 * cette ouverture atteint son écran de fin (FirstGameFeedbackCard en mode
 * local, montée dans les 10 écrans de fin) — les revanches jouées ensuite sur
 * la même page n'en ajoutent pas (voir createLocalGameReporter).
 */
export const LOCAL_GAME_EVENTS = ['start', 'end'] as const
export type LocalGameEvent = (typeof LOCAL_GAME_EVENTS)[number]

/** Le seul contenu d'un envoi. */
export type LocalGameReport = { gameId: string; event: LocalGameEvent }

/**
 * Jeux locaux SANS écran de fin : une partie de 1220, de Purple ou de la Roue
 * des gorgées ne « se termine » pas, on la quitte — ils n'envoient donc jamais
 * de 'end'. Listés ici pour que la Supervision le dise sur leur ligne au lieu
 * d'afficher un « 0 terminée » qui passerait pour un abandon. À tenir à jour
 * si un de ces jeux gagne un écran de fin (et y monte FirstGameFeedbackCard).
 */
export const LOCAL_GAMES_WITHOUT_END_SCREEN: readonly string[] = ['1220', 'purple', 'roue-des-gorgees']

/**
 * Un jeu que l'on mesure : connu du catalogue et jouable sur un seul
 * téléphone (pas `onlineOnly`). Les jeux MASQUÉS en font partie — leurs
 * pages restent ouvertes et quatre d'entre eux ont un écran de fin : les
 * écarter ici compterait leurs fins sans leurs lancements.
 */
export function isMeasuredLocalGameId(gameId: unknown): gameId is string {
  if (typeof gameId !== 'string' || gameId.length === 0 || gameId.length > 64) return false
  const game = getGameById(gameId)
  return Boolean(game && !game.onlineOnly)
}

export function isLocalGameEvent(value: unknown): value is LocalGameEvent {
  return typeof value === 'string' && (LOCAL_GAME_EVENTS as readonly string[]).includes(value)
}

/**
 * Le jeu local dont `pathname` est la page EXACTE (sans préfixe de langue,
 * tel que le rend usePathname de next-intl), masqués compris — ou null. À
 * distinguer de localGameIdFromPath (recent-local-games.ts), qui écarte les
 * jeux masqués de la rangée « Vos derniers jeux ».
 */
export function measuredLocalGameIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const game = GAMES.find((g) => g.path === pathname)
  return game && isMeasuredLocalGameId(game.id) ? game.id : null
}

/**
 * Écran TV (/tv, /fr/tv/CODE…) : l'afficheur d'une salle n'est pas un
 * lancement — il montre une partie déjà comptée (ou une partie en ligne).
 * Aucun écran TV ne monte aujourd'hui un point de mesure ; le garde-fou tient
 * pour celui qui en monterait un.
 */
export function isTvPath(pathname: string): boolean {
  const path = stripLocalePrefix(pathname)
  return path === '/tv' || path.startsWith('/tv/')
}

/**
 * Fenêtre de dédoublonnage des LANCEMENTS d'un même jeu. Le point de mesure se
 * garde déjà lui-même (verrou en ref contre le double effet du mode strict) ;
 * ceci est le filet de la page : un layout remonté dans la foulée. Deux vrais
 * lancements d'un même jeu à moins de 10 s n'existent pas. Limite connue : un
 * changement de langue sur la page du jeu, plus de 10 s après l'ouverture,
 * remonte le layout et compte un second lancement — rare, et il ne fait
 * jamais passer les fins au-dessus des lancements.
 */
export const LOCAL_GAME_DEDUPE_MS = 10_000

export type LocalGameSender = (report: LocalGameReport) => void

/**
 * Fabrique un rapporteur avec sa propre mémoire. Renvoie `true` quand l'envoi
 * est parti. Séparé de l'instance de la page pour être testé sans `window`
 * (environnement node de vitest), chaque test repartant d'une mémoire vierge.
 *
 * Les deux compteurs doivent se COMPARER — c'est tout l'objet de la mesure :
 * savoir quel jeu est quitté avant la fin. Une fin n'est donc envoyée que si
 * un lancement du même jeu est parti depuis la dernière fin envoyée (« partie
 * ouverte ») : la fin la referme, et les revanches jouées ensuite sur la même
 * page, qui ne relancent rien, n'ajoutent plus de fin. Ainsi fins ≤
 * lancements pour chaque jeu, et leur rapport se lit directement : la part
 * des ouvertures menées jusqu'à un écran de fin. Sans cette règle, un jeu à
 * revanches rapides affichait plus de fins que de lancements, et l'abandon
 * d'un autre jeu se noyait dans les totaux.
 *
 * Mémoire de la page (module chargé une fois) : une ouverture abandonnée
 * reste ouverte jusqu'au lancement suivant du même jeu, qui ne fait que la
 * reprendre — une fin ultérieure n'est comptée qu'une fois.
 */
export function createLocalGameReporter(
  send: LocalGameSender,
  now: () => number = () => Date.now()
): (gameId: string, event: LocalGameEvent, pathname: string) => boolean {
  const lastStartAt = new Map<string, number>()
  /** Jeux dont un lancement est parti sans fin envoyée depuis. */
  const openGames = new Set<string>()
  return (gameId, event, pathname) => {
    if (!isMeasuredLocalGameId(gameId) || !isLocalGameEvent(event)) return false
    if (isTvPath(pathname)) return false
    if (event === 'end') {
      // Revanche (ou fin sans lancement compté) : rien à refermer.
      if (!openGames.has(gameId)) return false
      openGames.delete(gameId)
    } else {
      const at = now()
      const previous = lastStartAt.get(gameId)
      if (previous !== undefined && at - previous < LOCAL_GAME_DEDUPE_MS) return false
      lastStartAt.set(gameId, at)
      openGames.add(gameId)
    }
    try {
      send({ gameId, event })
    } catch {
      // Une mesure ne doit jamais casser l'écran qui l'envoie.
    }
    return true
  }
}

/**
 * Envoi réel : `sendBeacon` d'abord — il survit au « Retour au menu » touché
 * dans la foulée de l'écran de fin, et à la fermeture de l'onglet —, sinon
 * `fetch` en keepalive. Réponse jamais lue : rien ne doit remonter jusqu'au
 * joueur, ni erreur ni délai. Même forme que client-error-report.ts.
 */
function sendToServer(report: LocalGameReport): void {
  const body = JSON.stringify(report)
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(LOCAL_GAME_ENDPOINT, new Blob([body], { type: 'application/json' }))) return
    } catch {
      // Navigateur qui refuse ce type de corps en beacon : repli fetch.
    }
  }
  if (typeof fetch !== 'function') return
  void fetch(LOCAL_GAME_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {})
}

/** Le rapporteur de la page : une mémoire par chargement. */
const pageReporter = createLocalGameReporter(sendToServer)

/**
 * Note un lancement ou une fin de partie LOCALE. Silencieux en toutes
 * circonstances (rendu serveur, jeu en ligne, écran TV, doublon, réseau).
 */
export function reportLocalGame(gameId: string, event: LocalGameEvent): void {
  if (typeof window === 'undefined') return
  try {
    pageReporter(gameId, event, window.location.pathname)
  } catch {
    // Fire-and-forget.
  }
}
