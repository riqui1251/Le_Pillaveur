/**
 * COMPTE À REBOURS DE PHASE — logique pure, sans React.
 *
 * Les phases chronométrées (vote, question de quiz, fenêtre de retour d'un
 * parti…) portent une échéance serveur `endsAt` (epoch ms). L'affichage n'a
 * besoin que de trois choses : le temps restant, les secondes à montrer et la
 * fraction de barre. Tout se déduit de (endsAt, now) : aucune horloge partagée
 * dans l'arbre, aucun état à faire vivre à chaque tick.
 */

export type CountdownSnapshot = {
  /** Temps restant (ms), jamais négatif. */
  leftMs: number
  /** Secondes affichées, arrondies à la seconde SUPÉRIEURE (« 42 » tant qu'il reste 41,001 s). */
  seconds: number
  /** Fraction restante de la phase (0..1) ; 0 sans durée totale connue. */
  ratio: number
  /** Échéance dépassée — ou absente. */
  expired: boolean
}

/** Photographie du compte à rebours à l'instant `now`. */
export function countdownSnapshot(
  endsAt: number | null | undefined,
  now: number,
  totalMs?: number
): CountdownSnapshot {
  if (endsAt == null) return { leftMs: 0, seconds: 0, ratio: 0, expired: true }
  const leftMs = Math.max(0, endsAt - now)
  return {
    leftMs,
    seconds: Math.ceil(leftMs / 1000),
    ratio: totalMs && totalMs > 0 ? Math.min(1, leftMs / totalMs) : 0,
    expired: leftMs === 0,
  }
}

/** Plancher entre deux ticks : pas de boucle serrée si l'horloge recule d'un poil. */
export const COUNTDOWN_MIN_TICK_MS = 16

/**
 * Délai jusqu'au PROCHAIN changement de la seconde affichée. Le chiffre
 * bascule quand le temps restant franchit un multiple de 1 000 ms : la
 * frontière est donc celle de l'échéance, pas celle de l'horloge murale —
 * caler sur `1000 - now % 1000` montrerait chaque seconde avec un retard
 * constant pouvant atteindre 999 ms. Pile sur la frontière, la suivante est
 * dans 1 000 ms.
 */
export function nextSecondTickMs(endsAt: number, now: number): number {
  const rest = (((endsAt - now) % 1000) + 1000) % 1000
  return Math.max(COUNTDOWN_MIN_TICK_MS, rest === 0 ? 1000 : rest)
}
