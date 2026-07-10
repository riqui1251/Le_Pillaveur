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
