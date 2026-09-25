/**
 * Libellés courts de la Supervision — module PUR, importable côté client comme
 * côté serveur. Sortis de la page pour être testés à leurs bornes.
 */

/**
 * Un taux non calculable (cohorte vide) s'affiche « — », jamais « 0 % ».
 * Un quotient 0/0 ou x/0 (NaN, Infinity) est tout aussi non calculable.
 */
export function rateLabel(rate: number | null): string {
  return rate == null || !Number.isFinite(rate) ? '—' : `${Math.round(rate * 100)} %`
}

/**
 * Durée d'inactivité à partir de laquelle on parle de table figée (F46) :
 * « 7 min » sous l'heure (jamais « 0 min »), « 2 h 05 » au-delà.
 */
export function idleLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`
}
