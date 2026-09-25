import type { DepartureReason } from '@/lib/online-errors'

export type { DepartureReason } from '@/lib/online-errors'

/**
 * Registre des départs FORCÉS (mono-instance) : pourquoi un joueur n'est plus
 * à sa table, le temps qu'il revienne le lire.
 *
 * Le 403 de GET /rooms/[roomId] ne disait rien : le client devinait la raison
 * d'après la table qu'il affichait (membershipLostKey, useOnlineRoom.ts) — un
 * joueur expulsé au lobby lisait « Tu n'es plus dans cette table », un absent
 * retiré par la relance ne savait pas qu'on avait rejoué sans lui. Ceux qui
 * retirent un joueur (kickMember, purge des absents, relance, remplacement par
 * un bot) notent ici la raison ; le 403 la rend et l'efface.
 *
 * Mémoire et non base : la raison ne sert qu'au retour du joueur, dans les
 * minutes qui suivent — la perdre à un redémarrage ne coûte que le message
 * générique, qui reste juste. Même vie que le bus temps réel (room-bus.ts) :
 * une Map par processus, gardée sur globalThis pour survivre au HMR de dev. En
 * multi-instances, à revoir en même temps que le bus.
 *
 * RGPD : un identifiant de compte, un identifiant de salle et une raison —
 * jamais de pseudo, jamais journalisé.
 */

type Departure = { roomId: string; reason: DepartureReason; at: number }

const globalForDepartures = globalThis as unknown as {
  __lpDepartures?: Map<string, Departure>
}

const departures = globalForDepartures.__lpDepartures ?? new Map<string, Departure>()

if (!globalForDepartures.__lpDepartures) {
  globalForDepartures.__lpDepartures = departures
}

/**
 * Durée de vie d'une raison. Un onglet caché ne sonde plus : le joueur ne
 * découvre son départ qu'en revenant au premier plan. Dix minutes couvrent la
 * cigarette sur le balcon ; au-delà, le message générique suffit.
 */
export const DEPARTURE_TTL_MS = 10 * 60 * 1000

/**
 * Plafond du registre : une ligne par compte au plus, et une soirée chargée
 * n'en retire pas mille en dix minutes. Borne de sûreté contre une boucle
 * (purge qui s'emballe) : au-delà, la plus ancienne raison saute.
 */
export const MAX_DEPARTURES = 2000

/**
 * Oublie les raisons périmées. L'ordre d'insertion de la Map est celui des
 * enregistrements (recordDeparture réinsère la clé) : on s'arrête à la
 * première encore valable.
 */
function sweep(now: number): void {
  for (const [userId, departure] of departures) {
    if (now - departure.at < DEPARTURE_TTL_MS) break
    departures.delete(userId)
  }
}

/**
 * Note qu'un joueur a été retiré de la table `roomId`. Une seule raison par
 * compte : la plus récente remplace l'autre (on ne siège qu'à une table).
 * Contrat public : la relance (dropAbsentMembers, online-room-launch.ts)
 * l'appelle pour ses absents avec 'rematched_without_you'.
 */
export function recordDeparture(
  userId: string,
  roomId: string,
  reason: DepartureReason,
  now: number = Date.now()
): void {
  sweep(now)
  // Réinsérée en queue : la Map reste triée du plus ancien au plus récent.
  departures.delete(userId)
  while (departures.size >= MAX_DEPARTURES) {
    const oldest = departures.keys().next().value
    if (oldest === undefined) break
    departures.delete(oldest)
  }
  departures.set(userId, { roomId, reason, at: now })
}

/**
 * Raison du départ de ce compte de CETTE table, ou null — et elle est
 * CONSOMMÉE : le 403 suivant (onglet qui sonde encore) retombe sur le
 * message générique, qui ne ment pas. La raison d'une autre table reste en
 * place.
 */
export function takeDeparture(
  userId: string,
  roomId: string,
  now: number = Date.now()
): DepartureReason | null {
  const departure = departures.get(userId)
  if (!departure) return null
  if (now - departure.at >= DEPARTURE_TTL_MS) {
    departures.delete(userId)
    return null
  }
  if (departure.roomId !== roomId) return null
  departures.delete(userId)
  return departure.reason
}

/**
 * Le joueur est revenu à cette table (/join) : la raison de son départ
 * précédent ne vaut plus — sinon un départ ultérieur, pour une autre cause,
 * lui serait expliqué par l'ancienne.
 */
export function forgetDeparture(userId: string, roomId: string): void {
  if (departures.get(userId)?.roomId === roomId) departures.delete(userId)
}

/** Taille du registre, pour une sonde ou un test : un nombre, aucun identifiant. */
export function departureCount(): number {
  return departures.size
}
