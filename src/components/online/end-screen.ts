/**
 * ÉCRAN DE FIN PARTAGÉ — logique pure (testée sans React ni réseau), lue par
 * OnlineEndScreen.tsx.
 *
 * Deux calculs que les dix-huit écrans de fin faisaient chacun à leur façon :
 * - le compteur « Rejouer x/total » : il comptait les humains de l'ÉTAT
 *   MOTEUR, alors que la relance part au quorum des membres PRÉSENTS de la
 *   table (processRematchVote, online-room-launch.ts) — une table à quatre
 *   dont un joueur a fermé l'onglet affichait 3/4 et repartait pourtant à 3 ;
 * - le lien partagé : le code de la table, mais d'une table PUBLIQUE seulement
 *   (isTableShareable) — le partage d'un résultat part vers un fil public.
 */

/** Ce que le compteur lit d'un membre de la table (RoomMemberDto en est un). */
export type EndScreenMember = {
  userId: string
  /**
   * Présence vue par le serveur (`members[].present` du DTO, même fenêtre
   * que le quorum de la relance). Absente — DTO qui ne la porte pas —, le
   * membre compte comme présent : c'est la table telle que la base la
   * décrit, jamais une présence devinée côté client.
   */
  present?: boolean
}

export type RematchCounter = {
  /** Votes des membres qui font le quorum. */
  count: number
  /** Membres qui font le quorum (présents, le joueur local toujours compris). */
  total: number
  /** Le joueur local a-t-il voté ? */
  iVoted: boolean
  /**
   * Bouton en attente (voté, d'autres doivent encore voter). Seul à la table
   * — partie contre bots, ou les autres partis —, son vote relance aussitôt :
   * jamais d'attente à afficher.
   */
  waiting: boolean
}

/**
 * Compteur de la relance, calqué sur le quorum du serveur : seuls les
 * membres présents comptent, et seuls LEURS votes — un joueur qui a voté
 * puis quitté la table n'aide plus à relancer (son vote reste dans l'état
 * moteur, pas dans le compte). Le joueur local fait toujours partie du
 * quorum : il est devant l'écran, et le serveur compte toujours le votant.
 */
export function rematchCounter(
  members: readonly EndScreenMember[],
  votes: readonly string[],
  selfId: string | null | undefined
): RematchCounter {
  const quorum = new Set<string>()
  for (const m of members) {
    if (m.present !== false || m.userId === selfId) quorum.add(m.userId)
  }
  const voted = new Set(votes)
  let count = 0
  for (const id of quorum) if (voted.has(id)) count += 1
  const total = quorum.size
  const iVoted = Boolean(selfId) && voted.has(selfId as string)
  return { count, total, iVoted, waiting: iVoted && total > 1 }
}

/**
 * « Retour à la table » s'offre-t-il à ce joueur ? Même règle que le serveur
 * (mayBringBack, back-to-lobby/route.ts) : l'hôte ; ou n'importe quel membre
 * quand l'hôte n'est plus là — parti de la table, ou absent (`present`
 * faux, même fenêtre que la route). Le serveur tranche de toute façon
 * (not_host) : ceci évite seulement d'offrir un bouton qui serait refusé.
 */
export function mayBringTableBack(
  members: readonly EndScreenMember[],
  hostUserId: string | null | undefined,
  selfId: string | null | undefined
): boolean {
  if (!selfId || !hostUserId) return false
  if (hostUserId === selfId) return true
  const host = members.find((m) => m.userId === hostUserId)
  return !host || host.present === false
}

/** Ce que le partage lit de la table (RoomDto en est une). */
export type EndScreenTable = {
  code: string
  visibility: string
}

const ROOM_CODE_RE = /^[A-Z0-9]{6}$/

/**
 * Le partage de fin peut-il porter le code de la table ? Seulement pour une
 * table PUBLIQUE. Ce partage vante un résultat (« J'ai gagné… viens me
 * défier ») : il part vers une story ou un fil public, pas vers des amis
 * choisis. Le code d'une table privée (« accessible avec le code
 * uniquement ») y ouvrirait la table à n'importe qui, et l'aperçu de
 * /invite/CODE affiche le pseudo de l'HÔTE — qu'un autre joueur n'a pas à
 * diffuser. Une table sur invitation refuse de toute façon le code seul.
 * Inviter volontairement reste le rôle du partage du lobby.
 */
export function isTableShareable(table: EndScreenTable | null | undefined): boolean {
  if (!table) return false
  return ROOM_CODE_RE.test(table.code) && table.visibility === 'public'
}

/**
 * Lien partagé en fin de partie, SANS préfixe de langue (le destinataire
 * garde la sienne, le middleware la détecte) :
 * - table publique : /invite/CODE, comme le partage du lobby — la page sert
 *   l'aperçu de LA table puis redirige vers /jeux?join=CODE ;
 * - table privée ou sur invitation : la page du jeu (cf. isTableShareable) ;
 * - jeu inconnu : l'accueil.
 */
export function endShareUrl(
  origin: string,
  table: EndScreenTable | null | undefined,
  gamePath: string | null | undefined
): string {
  const base = origin.replace(/\/+$/, '')
  if (table && isTableShareable(table)) return `${base}/invite/${table.code}`
  return `${base}${gamePath && gamePath.startsWith('/') ? gamePath : '/'}`
}

/**
 * Texte copié quand le partage natif manque : le message puis le lien, sur
 * deux lignes (même forme que la copie du lobby).
 */
export function endShareClipboardText(text: string, url: string): string {
  const message = text.trim()
  return message ? `${message}\n${url}` : url
}
