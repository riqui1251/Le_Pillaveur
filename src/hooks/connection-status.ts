/**
 * LOGIQUE PURE de l'état de connexion DIT AU JOUEUR (cf. useOnlineRoom, qui
 * relève les signaux, et ConnectionBanner, qui affiche le verdict). Ni React
 * ni réseau ici — testable à sec, et c'est ici que se lit la règle.
 *
 * Le constat de départ : quand le Wi-Fi tombe, le flux SSE se ferme, le
 * sondage repasse à 1,5 s en silence et le joueur regarde un plateau figé
 * sans un mot — l'erreur « réseau » n'apparaît qu'à sa prochaine action, et
 * s'efface 3 s plus tard. Une tablée de copains un samedi soir doit SAVOIR
 * que ce n'est pas le jeu qui plante, et que ça revient tout seul.
 */

export type ConnectionStatus = 'online' | 'reconnecting' | 'offline'

/** Ce qu'on sait de la connexion, relevé par useOnlineRoom au fil des événements. */
export type ConnectionSignals = {
  /**
   * Ce que dit le navigateur (navigator.onLine + événements window
   * online/offline). Fiable dans un sens seulement : `false` est certain
   * (mode avion, Wi-Fi coupé), `true` ne garantit rien — sur un ordinateur
   * une interface active sans accès à Internet dit « en ligne ».
   */
  browserOnline: boolean
  /** Sommes-nous dans une salle — c'est-à-dire : un flux SSE est censé vivre ? */
  inRoom: boolean
  /** Le flux est vivant : `ready` reçu, ni erreur ni chien de garde depuis. */
  streamAlive: boolean
  /**
   * Le flux a émis `error` depuis le dernier `ready` — le navigateur l'a VU
   * tomber. C'est le signal fort : il n'attend pas le sondage suivant.
   * Effacé par un `ready`, ou par un sondage qui passe (un flux que le
   * serveur refuse mais un HTTP qui répond, c'est une partie qui MARCHE, au
   * rythme du sondage serré — pas une panne à annoncer sans fin).
   */
  streamErrored: boolean
  /**
   * Le dernier sondage n'a pas JOINT le serveur : fetch a levé, ou la
   * réponse vient d'une passerelle qui n'a personne derrière (cf.
   * serverReached). Un 403/404 est une salle disparue, un 500 un bug — le
   * serveur, lui, est là. Effacé dès qu'une vraie réponse revient.
   */
  pollFailed: boolean
}

/**
 * Une réponse HTTP prouve-t-elle que le SERVEUR DU JEU a répondu ? Presque
 * toujours — un 4xx ou un 500 sort de l'application. Sauf les trois statuts
 * de passerelle : 502/503/504, c'est le proxy qui parle à la place d'un
 * processus Node absent ou muet (redéploiement, redémarrage). La table est
 * alors aussi figée que sans réseau, et ça revient tout seul : c'est bien
 * « reconnexion… » qu'il faut dire, pas « tout va bien ».
 */
export function serverReached(status: number): boolean {
  return status !== 502 && status !== 503 && status !== 504
}

/**
 * Le verdict, par ordre de certitude :
 *  1. le navigateur se dit hors ligne → `offline`, point ;
 *  2. pas de salle, ou flux vivant → `online` (rien à dire au joueur) ;
 *  3. flux mort ET (le navigateur l'a vu tomber OU le sondage échoue) →
 *     `reconnecting` ;
 *  4. flux mort mais RIEN d'autre → `online` quand même.
 *
 * Le cas 4 est celui du chien de garde (online-room-polling) : un téléphone
 * qui passe du Wi-Fi à la 4G garde un flux « zombie » que l'OS met des
 * minutes à fermer — le chien de garde le déclare mort et le sondage serré
 * reprend… par la 4G, où tout PASSE. Annoncer « connexion perdue » pendant
 * ces minutes-là, à une table où les coups arrivent bien, c'est le message
 * qui fait douter du jeu. On n'annonce donc une coupure que sur un signal
 * qui l'atteste : l'erreur vue par le navigateur, ou un sondage qui n'arrive
 * plus à joindre le serveur. Et on ne rentre pas dans l'ordre inverse : le
 * flux qui s'ouvre tout juste (pas encore de `ready`) n'est pas une coupure.
 */
export function connectionStatus(s: ConnectionSignals): ConnectionStatus {
  if (!s.browserOnline) return 'offline'
  if (!s.inRoom || s.streamAlive) return 'online'
  return s.streamErrored || s.pollFailed ? 'reconnecting' : 'online'
}

/** Point de départ : tout va bien tant qu'aucun signal n'a dit le contraire. */
export const INITIAL_CONNECTION_SIGNALS: ConnectionSignals = {
  browserOnline: true,
  inRoom: false,
  streamAlive: false,
  streamErrored: false,
  pollFailed: false,
}
