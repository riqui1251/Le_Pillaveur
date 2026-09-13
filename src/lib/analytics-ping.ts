import { parseLocalPlayerNamesInput } from '@/lib/visitor-local-players'

/**
 * Contrat du POST /api/analytics/ping (lot 5). PUR : aucune lecture de base,
 * aucun cookie — la route lit la requête, ce module décide quoi écrire.
 *
 * Trois corps reconnus, un par usage :
 * - `{ view: true }` : VUE, au montage de VisitTracker. Compte un lecteur
 *   (audience, pages de règles lues sans un clic) sans rien dire de son usage :
 *   jamais la dernière activité du compte.
 * - `{ beat: true }` : BATTEMENT, émis par VisitTracker seul, onglet visible et
 *   interaction réelle depuis 30 min au plus. SEUL signal de présence.
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
  /** Vrai seulement avec une liste de pseudos exploitable : sans elle, rien à écrire. */
  syncLocalPlayers: boolean
  /** Pseudos nettoyés (parseLocalPlayerNamesInput) ; vide hors synchro. */
  localPlayerNames: string[]
}

/**
 * Lecture stricte : un drapeau ne vaut que `true` (pas "1", pas 1). Un corps
 * illisible (null, tableau, texte) vaut un corps vide. Une synchro sans
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

  return {
    view: raw.view === true,
    beat: raw.beat === true,
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
  | 'visitor-cookie'
  | 'visitor-view'
  | 'visitor-beat'
  | 'visitor-ip'
  | 'local-players'

export type PingContext = Pick<PingBody, 'view' | 'beat' | 'syncLocalPlayers'> & {
  /** Cookie de consentement aux statistiques de visite accepté. */
  hasConsent: boolean
  /** Session valide (compte connecté). */
  hasSession: boolean
  /** Cookie lp_vid présent dans la requête. */
  hasVisitorId: boolean
}

export function planPing(ctx: PingContext): PingWrite[] {
  const writes: PingWrite[] = []

  // Compte : battement seulement, avec OU sans consentement. Ni une vue (un
  // onglet restauré ou une page lue sans la toucher n'est pas une activité),
  // ni une synchro de joueurs (rafales à chaque stat de partie locale).
  if (ctx.beat && ctx.hasSession) writes.push('account')

  // Tout le reste suit le NAVIGATEUR : consentement obligatoire (art. 82 loi I&L).
  if (!ctx.hasConsent) return writes

  // Un battement contient la vue : jamais les deux upserts pour une requête.
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
