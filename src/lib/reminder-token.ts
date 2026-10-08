/**
 * Forme d'un jeton du rappel du vendredi (User.reminderToken : 32 octets
 * aléatoires en base64url, 43 caractères). Module PUR, sans Prisma : les
 * pages de confirmation et de désinscription (composants serveur) l'importent
 * sans tirer la base ni le client d'e-mail. reminder-server.ts le réexporte.
 *
 * De quoi refuser une valeur absurde avant toute lecture en base — et avant
 * de la recopier dans un champ caché de formulaire.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/

export function isWellFormedReminderToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value)
}
