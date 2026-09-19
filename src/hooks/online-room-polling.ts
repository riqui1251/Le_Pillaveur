import type { RoomDto } from '@/lib/online-room'

/**
 * LOGIQUE PURE du sondage de salle (cf. useOnlineRoom) : cadences, tri des
 * événements du flux SSE et fusion garde-versionnée des états serveur. Ni
 * React ni réseau ici — c'est ce qui la rend testable, et c'est ici que se
 * lisent les règles qui protègent la salle contre les réponses qui se
 * croisent (un sondage lent qui atterrit après une action plus récente).
 */

// ─── Cadences ────────────────────────────────────────────────────────────────

/**
 * AUCUNE salle : il n'y a rien à surveiller, seulement à découvrir qu'un autre
 * appareil (ou une invitation acceptée ailleurs) nous a mis à table. Sonder
 * `/rooms/me` toutes les 2 s pour ça, c'était 43 000 requêtes par jour et par
 * compte resté ouvert sur le hub, pour un événement qui n'arrive presque
 * jamais — et sans le moindre flux SSE à alimenter, faute de salle.
 */
export const POLL_IDLE_MS = 10_000

/**
 * Le flux SSE porte le temps réel ; le sondage n'est qu'un FILET pour
 * l'événement perdu en silence. Le tenir à 1,5-2 s flux ouvert, c'était
 * ~40 requêtes par minute et par joueur pour n'apprendre rien — la charge
 * d'un samedi soir sur un seul VPS, et la batterie des téléphones. D'où DEUX
 * cadences par état, relues à CHAQUE planification :
 *  - flux VIVANT (événement `ready` reçu, aucune erreur depuis) : cadence
 *    longue. En partie, 15 s : c'est la seule borne à la fraîcheur quand le
 *    flux meurt SANS que le navigateur s'en aperçoive (téléphone qui passe
 *    du Wi-Fi à la 4G — la coupure TCP peut rester invisible des minutes, le
 *    keep-alive serveur n'y change rien). Un coup adverse qui n'apparaît
 *    qu'au bout de 15 s reste supportable ; à 30 s la table paraît figée.
 *    En lobby, 25 s : ce qui y bouge (un ami qui entre, un « prêt ») n'est
 *    pas pressé, et c'est là qu'on attend le plus longtemps.
 *  - flux MORT (jamais ouvert, ou en erreur) : les cadences historiques, le
 *    sondage redevient le seul canal.
 */
export const POLL_LOBBY_MS = 2000
export const POLL_LOBBY_STREAM_OK_MS = 25_000
/** Partie en cours, flux mort — en attente du tour adverse. */
export const POLL_PLAYING_WAIT_MS = 1500
/** Partie en cours, flux mort — c'est notre tour (secours si push raté). */
export const POLL_PLAYING_ACTIVE_MS = 1500
export const POLL_PLAYING_STREAM_OK_MS = 15_000

/**
 * Un `changed` reçu PENDANT qu'une de nos actions est en vol est presque
 * toujours l'écho de cette action : le serveur pousse la trame SSE avant
 * d'écrire la réponse HTTP, donc elle arrive la première. On attend la
 * réponse (qui porte la vue) plutôt que de redemander l'état — mais pas
 * indéfiniment : passé ce délai, on sonde quand même, pour qu'un coup adverse
 * ne reste pas suspendu à une action qui traîne sur un mauvais réseau.
 */
export const DEFERRED_REFRESH_MAX_MS = 1500

/**
 * Battement du flux SSE — l'événement `ping` de api/online/rooms/[roomId]/stream,
 * qui importe cette constante — et chien de garde côté client (useOnlineRoom) :
 * passé deux battements sans rien recevoir, le flux est tenu pour mort. C'est
 * le seul moyen de voir un flux « zombie » (Wi-Fi → 4G : la coupure TCP peut
 * rester invisible du navigateur pendant des minutes, sans `error`). Un
 * keep-alive en COMMENTAIRE SSE n'y suffisait pas : l'API EventSource ne le
 * remonte jamais au script. Deux battements et pas un : un `ping` un peu en
 * retard (charge serveur, minuteur d'onglet) ne doit pas ramener tous les
 * clients à la cadence serrée d'un coup.
 */
export const STREAM_HEARTBEAT_MS = 25_000
export const STREAM_WATCHDOG_MS = 2 * STREAM_HEARTBEAT_MS

export type PollRoom = Pick<RoomDto, 'status' | 'currentTurnUserId'>

/** Délai avant le prochain sondage, selon la salle et l'état du flux. */
export function pollDelayMs(
  room: PollRoom | null,
  userId: string | undefined,
  streamAlive: boolean
): number {
  if (!room) return POLL_IDLE_MS
  if (room.status !== 'playing') {
    return streamAlive ? POLL_LOBBY_STREAM_OK_MS : POLL_LOBBY_MS
  }
  if (streamAlive) return POLL_PLAYING_STREAM_OK_MS
  if (userId && room.currentTurnUserId && room.currentTurnUserId !== userId) {
    return POLL_PLAYING_WAIT_MS
  }
  return POLL_PLAYING_ACTIVE_MS
}

// ─── Événements du flux ──────────────────────────────────────────────────────

export type RoomEventDecision =
  | { kind: 'refresh' }
  | { kind: 'ignore' }
  | { kind: 'defer'; stateVersion: number }

/**
 * Que faire d'un événement du flux ? Seul `changed` porte parfois la version
 * qu'il annonce (RoomEvent.stateVersion, cf. src/lib/online/room-bus.ts) ;
 * `lobby`, `finished` et les `changed` sans version (lancement, relance,
 * briefing) rafraîchissent TOUJOURS.
 *
 * On n'ignore un `changed` que si sa version est EXACTEMENT celle qu'on
 * connaît : c'est l'écho d'un état déjà appliqué (notre action, ou un sondage
 * qui a devancé la trame). Une version PLUS PETITE n'est pas « du passé » : la
 * relance d'une partie remet `stateVersion` à 1 dans la MÊME salle (statut
 * `playing` conservé, cf. launchOnlineRoom), et un client resté sur l'ancienne
 * partie verrait alors défiler des versions inférieures — les ignorer le
 * figerait jusqu'au prochain sondage.
 */
export function roomEventDecision(input: {
  type: string
  data: unknown
  knownVersion: number | null
  actionInFlight: boolean
}): RoomEventDecision {
  if (input.type !== 'changed') return { kind: 'refresh' }
  const version = roomEventVersion(input.data)
  if (version === null || input.knownVersion === null) return { kind: 'refresh' }
  if (version === input.knownVersion) return { kind: 'ignore' }
  if (input.actionInFlight) return { kind: 'defer', stateVersion: version }
  return { kind: 'refresh' }
}

/**
 * Version annoncée par la trame `data:` d'un événement (JSON d'un RoomEvent),
 * ou null si elle en est dépourvue ou illisible — auquel cas on rafraîchit,
 * jamais l'inverse.
 */
export function roomEventVersion(data: unknown): number | null {
  if (typeof data !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return null
    const version = (parsed as { stateVersion?: unknown }).stateVersion
    return typeof version === 'number' && Number.isFinite(version) ? version : null
  } catch {
    return null
  }
}

// ─── Fusion garde-versionnée ─────────────────────────────────────────────────

/** Vue de partie telle que la renvoie le serveur (GET /state ou POST /action). */
export type ServerView = {
  roomId: string
  stateVersion: number
  gameStateJson: string | null
  currentTurnUserId: string | null
}

/**
 * Applique la vue renvoyée par une ACTION. Garde stricte : on n'écrase la
 * salle que par une version PLUS RÉCENTE — un sondage concurrent a pu
 * répondre entre-temps avec un état postérieur (tick de bot), qu'il ne faut
 * pas ramener en arrière. Une version égale n'apporte rien : même état.
 */
export function mergeServerView(prev: RoomDto | null, view: ServerView): RoomDto | null {
  if (!prev || prev.id !== view.roomId) return prev
  if (view.stateVersion <= prev.stateVersion) return prev
  return {
    ...prev,
    stateVersion: view.stateVersion,
    gameStateJson: view.gameStateJson,
    currentTurnUserId: view.currentTurnUserId,
  }
}

export type PolledState = Omit<ServerView, 'roomId'>

/**
 * Applique la réponse d'un SONDAGE (GET /state). Un sondage lit l'état
 * complet du serveur : il fait foi, SAUF s'il s'est fait doubler — la salle a
 * changé de version pendant qu'il était en vol (réponse d'action appliquée
 * entre-temps) et il rapporte une version plus ancienne. Sans cette garde, ce
 * sondage périmé réécrivait l'état d'avant l'action, et l'écho SSE de
 * l'action, déjà ignoré, ne venait plus le corriger.
 *
 * On ne compare PAS bêtement les numéros : une version plus petite alors que
 * rien n'a bougé localement est une RELANCE (stateVersion repart à 1), et
 * elle doit passer. Même version et même contenu : on rend `prev` tel quel,
 * pas de rendu pour rien.
 */
export function mergePolledState(
  prev: RoomDto | null,
  roomId: string,
  data: PolledState,
  knownAtRequest: number | null
): RoomDto | null {
  if (!prev || prev.id !== roomId) return prev
  const movedMeanwhile = knownAtRequest !== null && prev.stateVersion !== knownAtRequest
  if (movedMeanwhile && data.stateVersion < prev.stateVersion) return prev
  if (
    prev.stateVersion === data.stateVersion &&
    prev.gameStateJson === data.gameStateJson &&
    prev.currentTurnUserId === data.currentTurnUserId
  ) {
    return prev
  }
  return {
    ...prev,
    stateVersion: data.stateVersion,
    gameStateJson: data.gameStateJson,
    currentTurnUserId: data.currentTurnUserId,
  }
}
