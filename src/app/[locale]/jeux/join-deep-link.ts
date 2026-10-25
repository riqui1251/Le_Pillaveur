import type { RoomDto } from '@/lib/online-room'
import { isOnlineGameFinished, parseOnlineGameState } from '@/lib/online-game-state'

/**
 * Que faire d'un lien d'invitation (?join=CODE, QR d'une télé) selon la table
 * où l'on est DÉJÀ assis ?
 *  - `stay` : c'est sa propre table (QR de la télé de SA partie, lien qu'on a
 *    soi-même partagé). Le join répondait 409 game_already_started à un
 *    joueur actif — « La partie est déjà lancée » affiché au hub, sans chemin
 *    de retour : on l'envoie simplement à son jeu.
 *  - `confirm` : une partie en cours ailleurs (briefing compris). Rejoindre
 *    l'en fait sortir (leaveOtherRooms : marqué parti, remplacé par un bot à
 *    la fin du délai de grâce) — on le lui demande d'abord.
 *  - `join` : rien à perdre (pas de table, table en attente, partie finie).
 */
export type DeepLinkJoinDecision = 'join' | 'stay' | 'confirm'

export function deepLinkJoinDecision(
  current: Pick<RoomDto, 'code' | 'status' | 'gameId' | 'gameStateJson'> | null | undefined,
  code: string
): DeepLinkJoinDecision {
  if (!current) return 'join'
  if (current.code === code) return 'stay'
  if (current.status === 'briefing') return 'confirm'
  if (current.status !== 'playing') return 'join'
  const gameId = current.gameId ?? ''
  const state = gameId ? parseOnlineGameState(gameId, current.gameStateJson) : null
  // État illisible : dans le doute, on demande plutôt que de faire quitter.
  return state && isOnlineGameFinished(gameId, state) ? 'join' : 'confirm'
}
