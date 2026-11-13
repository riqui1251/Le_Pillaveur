/**
 * Rythme du tic-tac de la mèche. Il accélère avec le temps écoulé depuis l'allumage, rapporté à la
 * borne HAUTE de la plage de la mèche — jamais à l'échéance tirée : un tic-tac calé sur elle
 * annoncerait l'explosion. Partagé par le jeu local et l'écran en ligne (qui ne connaît que
 * `roundStartedAt` et les bornes publiques).
 */

export const PC_TICK_SLOWEST_MS = 900
export const PC_TICK_FASTEST_MS = 200

/** Délai avant le prochain tic, `elapsedMs` après l'allumage, pour une mèche d'au plus `maxFuseMs`. */
export function pcTickIntervalMs(elapsedMs: number, maxFuseMs: number): number {
  const ratio = maxFuseMs > 0 ? Math.min(1, Math.max(0, elapsedMs / maxFuseMs)) : 1
  return Math.round(PC_TICK_SLOWEST_MS - (PC_TICK_SLOWEST_MS - PC_TICK_FASTEST_MS) * ratio)
}
