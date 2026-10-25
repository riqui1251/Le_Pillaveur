/**
 * Briefing tuto synchronisé : entre le lancement du lobby et le vrai début de
 * partie, le salon passe en statut `briefing` — chaque joueur lit les règles
 * et se déclare prêt. La partie ne démarre que quand TOUT LE MONDE a fini
 * (ou au timeout, filet anti-AFK). Le rematch saute le briefing.
 */

export const BRIEFING_TIMEOUT_MS = 90_000

export type RoomBriefing = {
  startedAt: number
  acks: string[]
}

export function parseBriefing(json: string | null | undefined): RoomBriefing | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as RoomBriefing
    if (typeof raw?.startedAt !== 'number' || !Array.isArray(raw.acks)) return null
    return { startedAt: raw.startedAt, acks: raw.acks.filter((a) => typeof a === 'string') }
  } catch {
    return null
  }
}

export function serializeBriefing(briefing: RoomBriefing): string {
  return JSON.stringify(briefing)
}

/** Échéance du briefing passée, sur l'horloge de l'appelant. */
export function isBriefingExpired(briefing: RoomBriefing, now: number): boolean {
  return now - briefing.startedAt >= BRIEFING_TIMEOUT_MS
}

/**
 * Délai avant le prochain tick `{ timeout: true }` d'un client. Le premier
 * part juste après l'échéance (300 ms à 1 s, étalés entre les joueurs) ; les
 * suivants toutes les 2 à 3 s tant que la table reste en briefing. Un envoi
 * unique se perdait pour de bon : téléphone en avance sur l'horloge du serveur
 * (tick refusé, trop tôt) ou requête coupée, et la table attendait sans fin.
 */
export function briefingTickDelay(deadline: number, now: number, random: number, retry: boolean): number {
  if (retry) return 2_000 + random * 1_000
  return Math.max(250, deadline - now + 300 + random * 700)
}
