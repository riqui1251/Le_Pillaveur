/**
 * BATTEMENT DE PRÉSENCE — module PUR (aucun accès au DOM ni au réseau).
 *
 * Avant, VisitTracker pinguait toutes les 60 s sans condition, onglet caché
 * compris, et chaque synchro de joueurs locaux comptait aussi : « en ligne »,
 * lastSeenAt et la purge des invités mesuraient des onglets OUVERTS (un PC
 * resté allumé la nuit, un écran maintenu par le verrou des pages de jeu).
 *
 * Désormais un battement ne part que pour une page réellement utilisée :
 * - l'onglet est visible ;
 * - la dernière interaction RÉELLE (pointerdown, keydown, touchstart, wheel)
 *   date de 30 min au plus — le montage de la page n'en est pas une ;
 * - au plus un battement toutes les 60 s.
 *
 * Seuls des horodatages en mémoire entrent ici : ni contenu, ni nombre
 * d'interactions, rien de stocké ni d'envoyé.
 */

/**
 * Jour de Paris de la mise en production du battement honnête (lot 5) : date
 * de gel de l'ancien cumul User.totalPresenceSeconds, et de changement de sens
 * de lastSeenAt, affichée en Supervision. À recaler si le déploiement glisse,
 * avec la même date dans les 5 politiques de confidentialité (§3.3).
 */
export const HONEST_PRESENCE_SINCE = '2026-09-13'

/** Cadence maximale des battements (la fenêtre « en ligne » de 3 min tolère un battement perdu). */
export const BEAT_INTERVAL_MS = 60_000

/** Au-delà de 30 min sans interaction, la page est considérée comme abandonnée. */
export const INTERACTION_WINDOW_MS = 30 * 60_000

/**
 * Interactions réelles : un geste de la personne devant l'écran, jamais le
 * montage de la page. Partagées par le traceur et le verrou d'écran des jeux.
 */
export const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

export type BeatInput = {
  /** document.visibilityState === 'visible' */
  visible: boolean
  /** Date.now() de la dernière interaction réelle ; null tant qu'il n'y en a eu aucune. */
  lastInteractionAt: number | null
  /** Date.now() du dernier battement émis ; null avant le premier. */
  lastBeatAt: number | null
  now: number
}

/**
 * Interaction réelle dans les 30 dernières minutes (borne comprise) ?
 * Une interaction « dans le futur » (horloge système reculée) reste récente :
 * elle vient d'avoir lieu. Le traceur la recale aussitôt sur l'horloge
 * actuelle (clampToNow), sans quoi la fenêtre s'allongerait de tout l'écart.
 */
export function hasRecentInteraction(lastInteractionAt: number | null, now: number): boolean {
  if (lastInteractionAt === null || !Number.isFinite(lastInteractionAt)) return false
  return now - lastInteractionAt <= INTERACTION_WINDOW_MS
}

/**
 * Recale un horodatage « dans le futur » sur maintenant. Date.now() n'est pas
 * monotone : si l'horloge recule d'une heure juste après un geste, ce geste
 * resterait « récent » pendant 1 h 30 et les battements continueraient sans
 * personne. Recalé, il vient d'avoir lieu et la fenêtre de 30 min repart de
 * l'horloge actuelle. (performance.now() ne compte pas la veille partout.)
 */
export function clampToNow(at: number | null, now: number): number | null {
  return at !== null && at > now ? now : at
}

/**
 * Délai avant qu'un battement soit de nouveau permis par la cadence : 0 avant
 * le premier battement ou dès que 60 s sont écoulées. Un dernier battement
 * « dans le futur » (horloge reculée) ne bloque pas le flux pendant tout
 * l'écart : on le traite comme écoulé.
 */
export function msUntilNextBeat(lastBeatAt: number | null, now: number): number {
  if (lastBeatAt === null || !Number.isFinite(lastBeatAt)) return 0
  const elapsed = now - lastBeatAt
  if (elapsed < 0 || elapsed >= BEAT_INTERVAL_MS) return 0
  return BEAT_INTERVAL_MS - elapsed
}

/** Faut-il émettre un battement maintenant ? */
export function shouldBeat({ visible, lastInteractionAt, lastBeatAt, now }: BeatInput): boolean {
  if (!visible) return false
  if (!hasRecentInteraction(lastInteractionAt, now)) return false
  return msUntilNextBeat(lastBeatAt, now) === 0
}
