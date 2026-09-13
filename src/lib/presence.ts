/**
 * PRÉSENCE « EN LIGNE » — module PUR, importable côté client comme côté serveur.
 *
 * UNE seule définition de « en ligne » pour tout le site : amis, compteur
 * public, liste Comptes, carte visiteur. Elle était recopiée à six endroits,
 * avec deux fenêtres (5 min et 2 min) : un même joueur pouvait être « en
 * ligne » en Supervision et « hors ligne » chez ses amis pendant 3 minutes.
 *
 * 3 min tolèrent un ping perdu (cadence de 60 s) sans laisser la pastille
 * allumée 5 min après la fermeture de l'onglet. À 2 min, le statut clignotait
 * au moindre battement manqué.
 *
 * Pour un COMPTE, la date à comparer est User.lastSeenAt (écrite seulement
 * avec une session valide, avec ou sans consentement). SitePresence.lastSeen
 * est l'activité d'un NAVIGATEUR : notion distincte, jamais présentée comme la
 * présence du compte.
 */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000

/** Borne basse de la fenêtre : « en ligne » = vu à cet instant ou après (filtre `gte`). */
export function onlineSince(now: number = Date.now()): Date {
  return new Date(now - ONLINE_WINDOW_MS)
}

/**
 * Vu dans la fenêtre ? Accepte une Date (Prisma) ou une chaîne ISO (JSON côté
 * client). Absente ou illisible : hors ligne, jamais « en ligne » par défaut.
 */
export function isOnline(
  lastSeen: Date | string | null | undefined,
  now: number = Date.now()
): boolean {
  if (lastSeen == null) return false
  const seenAt = lastSeen instanceof Date ? lastSeen.getTime() : Date.parse(lastSeen)
  if (Number.isNaN(seenAt)) return false
  return seenAt >= now - ONLINE_WINDOW_MS
}
