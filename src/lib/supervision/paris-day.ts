/**
 * Jour de Paris (AAAA-MM-JJ) → instant à MIDI UTC, loin de tout bord de jour :
 * formaté à l'heure de Paris (UTC+1 l'hiver, UTC+2 l'été), il retombe toujours
 * sur ce même jour — y compris les jours de changement d'heure.
 *
 * Module PUR. Une chaîne qui n'est pas un jour donne une date invalide
 * (getTime() NaN) : c'est à l'appelant de ne passer que des jours du serveur.
 */
export function parisDayToDate(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`)
}
