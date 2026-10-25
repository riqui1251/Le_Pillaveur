import { parseLocalPlayerNamesInput } from '@/lib/visitor-local-players'
import type { UserRole } from '@/lib/roles'

/**
 * Contrat du POST /api/analytics/ping (lot 5). PUR : aucune lecture de base,
 * aucun cookie — la route lit la requête, ce module décide quoi écrire.
 *
 * Trois corps reconnus, un par usage :
 * - `{ view: true }` : VUE, au montage de VisitTracker. Compte un lecteur
 *   (audience, pages de règles lues sans un clic) sans rien dire de son usage :
 *   jamais la dernière activité du compte.
 * - `{ beat: true }` : BATTEMENT, émis par VisitTracker seul, onglet visible et
 *   interaction réelle depuis 30 min au plus. SEUL signal de présence. Sous
 *   consentement de version 2 (lot 6), le client y ajoute `active` et
 *   `inGame`, qui ventilent le crédit de la visite du compte.
 * - `{ localPlayers: true, localPlayerNames }` : synchro des pseudos locaux
 *   (usePlayers, et après un battement tant qu'elle n'est pas confirmée). Ni
 *   présence, ni visite.
 *
 * Tout autre corps n'est AUCUN signal. En particulier les deux corps d'un
 * onglet resté sur l'ancien JavaScript, envoyés toutes les 60 s sans
 * condition : `{}` sans consentement, `{ localPlayerNames, syncLocalPlayers:
 * true }` avec. D'où un drapeau de synchro NEUF (`localPlayers`) : l'ancien
 * `syncLocalPlayers` est ignoré, et ces onglets n'écrivent plus rien.
 */
export type PingBody = {
  view: boolean
  beat: boolean
  /** Battement avec interaction réelle depuis 10 min au plus. Faux hors battement. */
  active: boolean
  /** Battement sur un écran de jeu, local ou en ligne (estimation du client). Faux hors battement. */
  inGame: boolean
  /** Vrai seulement avec une liste de pseudos exploitable : sans elle, rien à écrire. */
  syncLocalPlayers: boolean
  /** Pseudos nettoyés (parseLocalPlayerNamesInput) ; vide hors synchro. */
  localPlayerNames: string[]
}

/**
 * Lecture stricte : un drapeau ne vaut que `true` (pas "1", pas 1). Un corps
 * illisible (null, tableau, texte) vaut un corps vide. `active` et `inGame`
 * n'existent qu'avec un battement : seuls, ils ne disent rien. Une synchro sans
 * tableau de pseudos n'en est pas une : on n'efface pas la liste stockée faute
 * de l'avoir reçue. Un tableau vide, lui, est une vraie liste (tous les joueurs
 * locaux supprimés).
 */
export function parsePingBody(json: unknown): PingBody {
  const raw =
    json !== null && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {}
  const names =
    raw.localPlayers === true ? parseLocalPlayerNamesInput(raw.localPlayerNames) : undefined

  const beat = raw.beat === true

  return {
    view: raw.view === true,
    beat,
    active: beat && raw.active === true,
    inGame: beat && raw.inGame === true,
    syncLocalPlayers: names !== undefined,
    localPlayerNames: names ?? [],
  }
}

/**
 * Écritures qu'une requête de ping peut déclencher, dans l'ordre où la route
 * doit les faire.
 * - `account` : dernière activité du COMPTE — User.lastSeenAt, lastIp,
 *   lastCountry, lastDevice — et IpSeenLog `user:<id>`. Intérêt légitime
 *   (sécurité, statut « en ligne » des amis, purge des invités) : aucune durée.
 * - `account-visit` : visite du COMPTE (AccountVisit, recordAccountBeat) —
 *   durées visible, active et en partie, appareil. Consentement aux
 *   statistiques de visite et rôle 'user' seulement : le staff n'est jamais
 *   suivi.
 * - `visitor-cookie` : création du cookie lp_vid, absent de la requête.
 * - `visitor-view` : SitePresence (lastSeen, pays, appareil, lastIp ; userId
 *   et userSeenAt si session) et DailyVisitor.
 * - `visitor-beat` : la même chose. Les deux upserts sont identiques : lastIp
 *   suit TOUT signal qui avance lastSeen, sinon une vue connectée rattacherait
 *   au compte l'adresse d'une navigation sans session (isPresenceConnectedHere).
 *   Ce qui distingue le battement, c'est l'historique (`account`, `visitor-ip`).
 * - `visitor-ip` : IpSeenLog `visitor:<vid>` — battement SANS session (avec
 *   session, l'adresse va à l'historique du compte, écriture `account`).
 * - `local-players` : patch des pseudos locaux d'une SitePresence, sans la
 *   créer ni avancer lastSeen.
 */
export type PingWrite =
  | 'account'
  | 'account-visit'
  | 'visitor-cookie'
  | 'visitor-view'
  | 'visitor-beat'
  | 'visitor-ip'
  | 'local-players'

export type PingContext = Pick<PingBody, 'view' | 'beat' | 'syncLocalPlayers'> & {
  /** Consentement aux statistiques de visite accepté sous le libellé actuel ('2', isAnalyticsConsentGranted). */
  hasConsent: boolean
  /** Session valide (compte connecté). */
  hasSession: boolean
  /**
   * Rôle du compte de la session (null sans session). Explicite pour que la
   * règle « le staff n'est jamais suivi » se lise et se teste ici.
   */
  accountRole: UserRole | null
  /** Cookie lp_vid présent dans la requête. */
  hasVisitorId: boolean
}

export function planPing(ctx: PingContext): PingWrite[] {
  const writes: PingWrite[] = []

  // Compte : battement seulement, avec OU sans consentement. Ni une vue (un
  // onglet restauré ou une page lue sans la toucher n'est pas une activité),
  // ni une synchro de joueurs (rafales à chaque stat de partie locale).
  if (ctx.beat && ctx.hasSession) writes.push('account')

  // Tout le reste exige le consentement (art. 82 loi I&L).
  if (!ctx.hasConsent) return writes

  // Visite du compte : détail des durées par visite, fondé sur le consentement
  // seul. Rôle 'user' uniquement : les passages du staff (Supervision, tests)
  // ne sont pas un usage du jeu et ne sont jamais enregistrés.
  if (ctx.beat && ctx.hasSession && ctx.accountRole === 'user') writes.push('account-visit')

  // Le reste suit le NAVIGATEUR. Un battement contient la vue : jamais les
  // deux upserts pour une requête.
  const presence: PingWrite | null = ctx.beat ? 'visitor-beat' : ctx.view ? 'visitor-view' : null
  if (presence) {
    if (!ctx.hasVisitorId) writes.push('visitor-cookie')
    writes.push(presence)
    if (ctx.beat && !ctx.hasSession) writes.push('visitor-ip')
  }

  // Patch d'une présence existante, ou créée juste au-dessus par la même
  // requête. Sans identifiant de navigateur, rien à patcher : une synchro ne
  // crée ni cookie ni présence.
  if (ctx.syncLocalPlayers && (ctx.hasVisitorId || presence)) writes.push('local-players')

  return writes
}

/**
 * Quotas du ping, route PUBLIQUE et la plus appelée du site (bornes en
 * mémoire, rate-limit.ts).
 * - Toutes requêtes : 120 par minute et par RÉSEAU (clé /64 en IPv6). Un
 *   navigateur envoie une vue par page et un battement par minute : de quoi
 *   laisser passer des dizaines d'onglets derrière la même box.
 * - CRÉATIONS de présence (cookie lp_vid neuf, ou lp_vid inconnu de la base) :
 *   chacune ajoute une ligne SitePresence, DailyVisitor et IpSeenLog. 20 par
 *   heure et par réseau, compté AVANT le plafond global pour qu'un réseau
 *   refusé n'use pas le plafond commun ; puis un plafond GLOBAL horaire contre
 *   des réseaux nombreux (un /48 IPv6 fournit 65 536 clés /64). Au-delà, la
 *   présence n'est simplement pas créée (le navigateur réessaie au battement
 *   suivant) : la mesure sous-estime, la base ne grossit plus. À relever si
 *   le site grandit.
 */
export const PING_NETWORK_LIMIT_PER_MINUTE = 120
export const PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR = 20
export const PING_NEW_PRESENCE_GLOBAL_CAP_PER_HOUR = 500

/**
 * Forme d'un lp_vid tel que createVisitorId le pose (16 octets en hexadécimal,
 * depuis toujours). Le cookie arrive du client : sans ce contrôle, une valeur
 * forgée de plusieurs Ko était recopiée telle quelle en base (SitePresence,
 * DailyVisitor, IpSeenLog `visitor:<vid>`).
 */
export function isVisitorId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)
}
