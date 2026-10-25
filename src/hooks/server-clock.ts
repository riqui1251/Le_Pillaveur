/**
 * HEURE DU SERVEUR, VUE DU TÉLÉPHONE.
 *
 * Les échéances d'une partie (phaseEndsAt, continueAt, départ d'un joueur…)
 * sont des dates SERVEUR. Comparées au Date.now() d'un téléphone en avance de
 * 5 s, le chrono affichait 0:00 alors qu'il restait 5 s, et « Manche
 * suivante » se débloquait trop tôt (refus READING_TIME du serveur) ; en
 * retard, le joueur croyait avoir encore le temps d'une phase déjà close.
 *
 * Le décalage se mesure sans toucher à l'API : l'en-tête HTTP `Date` des
 * réponses de sondage. Il est tronqué à la seconde, mais chaque réponse BORNE
 * le décalage — le serveur l'a écrite entre l'envoi et la réception, à une
 * heure comprise dans la seconde annoncée. Les bornes de réponses successives
 * se recoupent et se resserrent bien en dessous de la seconde.
 */

/**
 * Décalages (heure serveur − heure locale, ms) compatibles avec les réponses
 * reçues : le vrai est dans [low, high].
 */
export type ClockOffsetBounds = { low: number; high: number }

/**
 * En dessous, on ne corrige pas : la seconde de l'en-tête, un cache de date
 * un peu en retard côté serveur ou un proxy suffisent à fabriquer quelques
 * centaines de millisecondes. Un téléphone à l'heure garde son horloge, tel
 * qu'avant cette correction.
 */
export const CLOCK_OFFSET_MIN_MS = 1000

/** L'en-tête `Date` ne porte que la seconde : l'heure réelle est dans [D, D + 1 s[. */
const DATE_HEADER_RESOLUTION_MS = 1000

/**
 * Bornes du décalage d'après UNE réponse : envoyée à `sentAt`, reçue à
 * `receivedAt` (horloge locale), en-tête `Date` lu tel quel. null si l'en-tête
 * manque ou ne se lit pas.
 */
export function clockOffsetBounds(
  dateHeader: string | null | undefined,
  sentAt: number,
  receivedAt: number
): ClockOffsetBounds | null {
  if (!dateHeader) return null
  const serverSecond = Date.parse(dateHeader)
  if (!Number.isFinite(serverSecond) || !(receivedAt >= sentAt)) return null
  return {
    low: serverSecond - receivedAt,
    high: serverSecond + DATE_HEADER_RESOLUTION_MS - sentAt,
  }
}

/**
 * Recoupe les bornes connues avec celles d'une nouvelle réponse. Disjointes,
 * l'horloge locale a sauté (heure réglée à la main, resynchronisation) : on
 * repart de la mesure neuve plutôt que de garder une correction fausse.
 */
export function mergeClockOffsetBounds(
  prev: ClockOffsetBounds | null,
  next: ClockOffsetBounds
): ClockOffsetBounds {
  if (!prev) return next
  const low = Math.max(prev.low, next.low)
  const high = Math.min(prev.high, next.high)
  return low <= high ? { low, high } : next
}

/**
 * Décalage appliqué : la plus petite correction compatible avec les bornes
 * (celle qui ramène le moins loin de l'horloge locale), nulle sous
 * CLOCK_OFFSET_MIN_MS.
 */
export function clockOffsetMs(bounds: ClockOffsetBounds | null): number {
  if (!bounds) return 0
  const nearest = Math.min(Math.max(0, bounds.low), bounds.high)
  return Math.abs(nearest) < CLOCK_OFFSET_MIN_MS ? 0 : nearest
}

// État du module, côté navigateur seulement : noteServerDate n'est appelé que
// depuis les sondages du client (jamais pendant un rendu serveur).
let bounds: ClockOffsetBounds | null = null
let offsetMs = 0

/** Relève l'en-tête `Date` d'une réponse de sondage partie à `sentAt`. */
export function noteServerDate(
  res: { headers: { get(name: string): string | null } },
  sentAt: number,
  receivedAt: number = Date.now()
): void {
  const sample = clockOffsetBounds(res.headers.get('date'), sentAt, receivedAt)
  if (!sample) return
  bounds = mergeClockOffsetBounds(bounds, sample)
  offsetMs = clockOffsetMs(bounds)
}

/** Heure du serveur estimée (epoch ms) : à comparer aux échéances serveur. */
export function serverNow(): number {
  return Date.now() + offsetMs
}
