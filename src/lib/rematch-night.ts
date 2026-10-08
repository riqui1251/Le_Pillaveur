/**
 * « ON REMET ÇA ? » — logique PURE de la carte de fin de partie
 * (src/components/online/RematchNightCard.tsx) et de la demande d'amis
 * groupée (POST /api/friends/table). Importable côté client comme côté
 * serveur : ni Prisma, ni réseau.
 *
 * Le constat qui la motive : 2 joueurs sur 57 reviennent pour une deuxième
 * soirée, alors qu'une première partie À PLUSIEURS fait rejouer 25 nouveaux
 * sur 36 le soir même. Le lien se perd entre deux soirées : personne ne s'est
 * ajouté en ami, rien ne rappelle le vendredi suivant. La carte propose ces
 * deux gestes, et seulement à une table où d'autres humains ont joué — contre
 * des bots, il n'y a personne à retrouver.
 */

/**
 * Bot de remplissage : `bot-N` dans l'état de chaque jeu (server-adapter de
 * chaque jeu, personas compris — le persona ne change que le NOM affiché),
 * jamais un compte. Même motif que la bannière d'XP (XpGainBanner).
 */
export const FILLER_BOT_ID_RE = /^bot-\d+$/

export function isFillerBotId(id: string): boolean {
  return FILLER_BOT_ID_RE.test(id)
}

/**
 * Les AUTRES comptes humains d'une table : bots et joueur local retirés,
 * doublons fondus. Les membres d'une salle sont déjà des comptes (les bots
 * vivent dans l'état du moteur, pas dans OnlineRoomMember) ; le filtre des
 * bots reste là par prudence, pour qu'aucun appelant ne fasse partir une
 * demande d'ami vers un identifiant qui n'existe pas en base.
 */
export function otherHumanIds(memberIds: readonly string[], selfId: string | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of memberIds) {
    if (!id || id === selfId || isFillerBotId(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * La carte a-t-elle un sens à cette table ? Au moins deux comptes humains —
 * le joueur local, membre de la table, et un autre. Un joueur absent de la
 * liste (table quittée, état pas encore relu) n'a rien à proposer.
 */
export function isMultiHumanTable(memberIds: readonly string[], selfId: string | null | undefined): boolean {
  if (!selfId || !memberIds.includes(selfId)) return false
  return otherHumanIds(memberIds, selfId).length > 0
}

/** Relation déjà en base entre le joueur et un autre compte (ligne Friendship). */
export type TablemateFriendship = {
  requesterId: string
  addresseeId: string
  status: string
}

/**
 * Parmi `candidateIds`, ceux à qui « Ajouter la tablée en amis » ferait
 * quelque chose : ni ami, ni déjà sollicité par le joueur. Une demande REÇUE
 * en attente compte comme ajoutable — le geste l'accepte (auto-acceptation
 * de sendFriendRequest), c'est même le cas le plus utile.
 *
 * Volontairement AVEUGLE au blocage, au bannissement et au délai après un
 * refus : en tenir compte ici ferait disparaître le bouton à une table de
 * deux, ce qui dirait au joueur « on t'a bloqué » ou « on t'a refusé ». Ces
 * cas sont écartés à l'envoi, dans une réponse qui ne les distingue pas.
 */
export function addableTablemateIds(
  selfId: string,
  candidateIds: readonly string[],
  friendships: readonly TablemateFriendship[]
): string[] {
  const settled = new Set<string>()
  for (const f of friendships) {
    const other = f.requesterId === selfId ? f.addresseeId : f.requesterId
    if (f.status === 'accepted') settled.add(other)
    else if (f.status === 'pending' && f.requesterId === selfId) settled.add(other)
  }
  return candidateIds.filter((id) => !settled.has(id))
}

/** Statut du rappel du vendredi tel que le lit la carte (GET /api/me/reminder). */
export type ReminderCardStatus = 'on' | 'off' | 'pending' | 'unavailable' | 'error' | 'loading'

/** Ce que la carte affiche pour le rappel. */
export type RematchReminderLine = 'offer' | 'on' | 'pending' | 'none'

/**
 * « Non merci » au rappel, retenu sur l'APPAREIL (localStorage, try/catch) :
 * l'instant du refus, en millisecondes. Sans lui, la carte redemandait
 * l'accord à CHAQUE fin de partie à plusieurs, sans limite de temps — une
 * sollicitation répétée du consentement, sur un écran déjà dense.
 */
export const REMATCH_REMINDER_DECLINE_KEY = 'lp-rematch-reminder-declined'

/** Un refus vaut douze semaines : passé ce délai, la question peut revenir, une fois. */
export const REMATCH_REMINDER_DECLINE_MS = 12 * 7 * 24 * 60 * 60 * 1000

/**
 * Le refus enregistré tient-il encore ? Pure, testée. Valeur illisible, ou
 * datée de l'avenir (horloge changée), ou plus vieille que le délai : non.
 */
export function isReminderDeclineActive(raw: string | null | undefined, now: number): boolean {
  if (!raw) return false
  const at = Number(raw)
  if (!Number.isFinite(at) || at <= 0 || at > now) return false
  return now - at < REMATCH_REMINDER_DECLINE_MS
}

export type RematchNightView = {
  /** Bouton « Ajouter la tablée en amis ». */
  friends: boolean
  reminder: RematchReminderLine
}

/**
 * Décision d'affichage, prise UNE fois par l'écran de fin. Null : rien à
 * proposer — la carte ne s'affiche pas.
 *
 * La carte n'apparaît que s'il reste un GESTE à faire : quelqu'un à ajouter,
 * ou le rappel à accepter. Une bande d'habitués déjà tous amis et déjà
 * inscrite n'a pas à relire « On remet ça ? » à chaque fin de partie. Une
 * fois affichée, elle montre aussi l'état du rappel (« activé », « e-mail de
 * confirmation envoyé ») — mais ces lignes seules ne la font pas apparaître.
 *
 * Pas de ligne du rappel (« none ») :
 *  - invité ou compte sans e-mail : sa ligne « Sauvegarde ton compte » est
 *    déjà sous l'XP (XpGainBanner) — la répéter ici doublait le même appel
 *    sur un écran déjà dense ;
 *  - envoi d'e-mails non configuré ('unavailable') : aucune promesse à faire ;
 *  - « Non merci » donné il y a moins de douze semaines (`declined`) ;
 *  - statut illisible (panne) : plutôt qu'un geste qui échouerait.
 */
export function rematchNightView(input: {
  addable: number
  reminder: ReminderCardStatus
  isGuest: boolean
  hasEmail: boolean
  /** « Non merci » encore valable (isReminderDeclineActive). */
  declined?: boolean
}): RematchNightView | null {
  const friends = input.addable > 0
  let reminder: RematchReminderLine
  if (input.isGuest || !input.hasEmail) reminder = 'none'
  else if (input.reminder === 'on') reminder = 'on'
  else if (input.reminder === 'pending') reminder = 'pending'
  else if (input.reminder === 'off') reminder = input.declined ? 'none' : 'offer'
  else reminder = 'none'
  if (!friends && reminder !== 'offer') return null
  return { friends, reminder }
}

/** Réponse de POST /api/friends/table, telle que la carte la lit. */
export type TableFriendRequestsResult = {
  /** Demandes nouvellement envoyées. */
  requested: number
  /** Demandes reçues de la tablée, acceptées du même geste. */
  accepted: number
}

/**
 * Lecture tolérante de la réponse : un serveur d'une autre version ne doit
 * rien casser. Null sur une réponse illisible.
 */
export function parseTableFriendRequestsResult(json: unknown): TableFriendRequestsResult | null {
  const body = json as { requested?: unknown; accepted?: unknown } | null
  if (!body || typeof body.requested !== 'number' || typeof body.accepted !== 'number') return null
  return { requested: Math.max(0, body.requested), accepted: Math.max(0, body.accepted) }
}
