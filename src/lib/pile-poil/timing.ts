/**
 * Horodatage d'un appui sur l'horloge de `performance.now()`.
 *
 * `event.timeStamp` date le toucher lui-même, avant tout rendu : c'est lui
 * qui mesure, pas l'instant où React traite l'événement. Les vieux
 * navigateurs le donnent en ms depuis 1970 (bien au-delà de
 * `performance.now()`), ou à 0 : on retombe alors sur l'instant présent.
 */
export function pressStamp(eventTimeStamp: number, now: number): number {
  if (!Number.isFinite(eventTimeStamp) || eventTimeStamp <= 0 || eventTimeStamp > now) return now
  return eventTimeStamp
}

/** Durée d'un essai entre deux appuis horodatés par `pressStamp` (jamais négative). */
export function measuredMs(startStamp: number, stopStamp: number): number {
  return Math.max(0, stopStamp - startStamp)
}

/**
 * En deçà, un STOP n'est pas un essai : c'est le second toucher d'un double
 * toucher sur « Démarrer » (le STOP pleine largeur apparaît sous le doigt),
 * ou une Entrée pressée deux fois. Aucune cible n'est sous 5 s : aucun vrai
 * essai n'est refusé.
 */
export const MIN_RUN_MS = 1_000

/** Le STOP compte-t-il ? Trop tôt, il est ignoré et le chrono continue. */
export function isPlausibleStop(startStamp: number, stopStamp: number): boolean {
  return measuredMs(startStamp, stopStamp) >= MIN_RUN_MS
}
