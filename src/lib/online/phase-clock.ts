/**
 * HORLOGE DE PHASE serveur — pour les jeux à phases chronométrées
 * (vote 60 s, question de quiz 15 s, débat du Loup-Garou 3 min…).
 *
 * Principe (même philosophie que l'anti-AFK) : **l'horloge SERVEUR est la
 * seule autorité**. Le moteur pose `phaseEndsAt` (epoch ms) en entrant dans
 * une phase ; les clients affichent le compte à rebours et envoient une
 * action générique `advance` à l'échéance. Le serveur ne l'accepte que si
 * l'échéance est réellement passée. Deux ticks concurrents ne peuvent pas
 * faire avancer deux fois : le premier change la phase (et `phaseKey`), le
 * second devient un no-op (PHASE_CHANGED) — l'idempotence est structurelle,
 * renforcée par la concurrence optimiste `expectedVersion` de la route action.
 *
 * Un état à phases chronométrées embarque :
 *   `phase: string` — nom de la phase courante ;
 *   `phaseSeq: number` — compteur MONOTONE incrémenté à CHAQUE transition
 *     (deux visites de la même phase → deux clés différentes) ;
 *   `phaseEndsAt: number | null` — échéance epoch ms (null = pas de limite).
 */

export type TimedPhaseState = {
  phase: string
  phaseSeq: number
  phaseEndsAt: number | null
}

/** Clé d'identité d'une phase — sert à détecter « la phase a déjà avancé ». */
export function phaseKey(state: TimedPhaseState): string {
  return `${state.phase}#${state.phaseSeq}`
}

/** Champs à poser en ENTRANT dans une phase chronométrée. */
export function enterPhase(
  prevSeq: number,
  phase: string,
  durationMs: number | null,
  now: number = Date.now()
): Pick<TimedPhaseState, 'phase' | 'phaseSeq' | 'phaseEndsAt'> {
  return {
    phase,
    phaseSeq: prevSeq + 1,
    phaseEndsAt: durationMs === null ? null : now + durationMs,
  }
}

export type AdvanceCheck =
  | { ok: true }
  | { ok: false; error: 'NOT_EXPIRED' | 'PHASE_CHANGED' | 'NO_DEADLINE' }

/**
 * Valide une demande `advance` d'un client.
 * @param claimedKey clé de phase vue par le client (`phaseKey` de SA vue) —
 *   si elle ne correspond plus, la phase a déjà avancé (tick concurrent).
 */
export function checkAdvance(
  state: TimedPhaseState,
  claimedKey: string,
  now: number = Date.now()
): AdvanceCheck {
  if (claimedKey !== phaseKey(state)) return { ok: false, error: 'PHASE_CHANGED' }
  if (state.phaseEndsAt === null) return { ok: false, error: 'NO_DEADLINE' }
  if (now < state.phaseEndsAt) return { ok: false, error: 'NOT_EXPIRED' }
  return { ok: true }
}

/** Millisecondes restantes (≥ 0) — pour l'affichage client. */
export function phaseTimeLeftMs(state: TimedPhaseState, now: number = Date.now()): number {
  if (state.phaseEndsAt === null) return Number.POSITIVE_INFINITY
  return Math.max(0, state.phaseEndsAt - now)
}
