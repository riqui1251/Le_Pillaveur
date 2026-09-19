/**
 * Chat en delta — une conversation ouverte est sondée toutes les 3 s, mais
 * chaque relève ne rapatrie plus les 50 derniers messages avec leur
 * expéditeur : seulement ce qui est plus récent que le dernier message que le
 * client connaît, plus les dernières secondes du canal (recouvrement, voir la
 * route). Au repos (le cas de loin le plus courant), la réponse est vide et
 * le serveur n'a lu qu'un index.
 *
 * L'id des messages est un cuid : pas d'ordre garanti entre deux insertions,
 * donc le curseur est composé (createdAt, id) — createdAt porte l'ordre, l'id
 * ne départage qu'une égalité à la milliseconde. Prisma range les DateTime de
 * SQLite en millisecondes entières : l'ISO renvoyé au client puis reparsé
 * retombe exactement sur la valeur stockée, l'égalité stricte tient.
 *
 * Fonctions pures, partagées par la route (lecture du curseur) et les deux
 * panneaux (ChatPanel du header, chat de salle de Loup-Garou) — testées sans
 * DOM ni base.
 */

/** Le strict nécessaire pour ordonner et dédoublonner : id + createdAt ISO. */
export type ChatDeltaMessage = { id: string; createdAt: string }

/**
 * Au-delà, la liste tenue en mémoire n'apporte plus rien au joueur (personne
 * ne remonte trois heures de chat au pouce) mais pèse sur le DOM d'un
 * téléphone. L'ouverture n'en charge que 50 ; le delta fait grossir la liste
 * au fil de la soirée, on la tronque par le haut.
 */
export const MAX_KEPT_MESSAGES = 200

/**
 * Ordre chronologique stable : createdAt (ISO UTC de `toISOString()`, même
 * longueur, comparable tel quel) puis id.
 */
export function compareMessages(a: ChatDeltaMessage, b: ChatDeltaMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  if (a.id !== b.id) return a.id < b.id ? -1 : 1
  return 0
}

/**
 * Fond le delta reçu dans la liste connue : triée, sans doublon, tronquée aux
 * `keep` plus récents. Le doublon est la norme : un sondage parti avant
 * l'envoi d'un message et revenu après le renvoie une seconde fois, et la
 * route renvoie de toute façon les dernières secondes du canal à chaque
 * relève (recouvrement du curseur, cf. api/chat/messages). Un message est
 * immuable : à id connu, la version en place reste. Rien de NOUVEAU → la
 * liste d'origine, même référence, pour que l'appelant s'épargne un rendu —
 * et le rafraîchissement du badge qui l'accompagne.
 */
export function mergeMessages<T extends ChatDeltaMessage>(
  existing: readonly T[],
  incoming: readonly T[],
  keep = MAX_KEPT_MESSAGES
): T[] {
  if (incoming.length === 0) return existing as T[]
  const byId = new Map<string, T>()
  for (const m of existing) byId.set(m.id, m)
  let added = false
  for (const m of incoming) {
    if (byId.has(m.id)) continue
    byId.set(m.id, m)
    added = true
  }
  if (!added) return existing as T[]
  const merged = [...byId.values()].sort(compareMessages)
  return merged.length > keep ? merged.slice(merged.length - keep) : merged
}

/**
 * Fragment de requête du curseur : le message le plus récent connu (par
 * l'ordre ci-dessus, pas par position — la liste vient de `mergeMessages`,
 * mais on ne s'y fie pas), ou rien à l'ouverture (le serveur renvoie alors
 * les 50 derniers). Préfixé de `&` : il se colle derrière `scope=…`.
 */
export function chatCursorQuery(messages: readonly ChatDeltaMessage[]): string {
  const latest = messages.reduce<ChatDeltaMessage | null>(
    (max, m) => (!max || compareMessages(m, max) > 0 ? m : max),
    null
  )
  if (!latest) return ''
  return `&after=${encodeURIComponent(latest.id)}&afterAt=${encodeURIComponent(latest.createdAt)}`
}

/** Curseur lu par la route : (createdAt, id) du dernier message connu du client. */
export type ChatCursor = { id: string; createdAt: Date }

/** Un cuid fait 25 caractères ; au-delà, ce n'est pas un id de message. */
const MAX_CURSOR_ID_LENGTH = 64

/**
 * Lit le curseur de la requête. Indulgent : absent ou malformé, il vaut
 * « ouverture de la conversation » (50 derniers) — refuser la requête ne
 * protégerait rien, le client fusionne et dédoublonne de toute façon.
 */
export function parseChatCursor(after: string | null, afterAt: string | null): ChatCursor | null {
  if (!after || !afterAt || after.length > MAX_CURSOR_ID_LENGTH) return null
  const createdAt = new Date(afterAt)
  if (Number.isNaN(createdAt.getTime())) return null
  return { id: after, createdAt }
}
