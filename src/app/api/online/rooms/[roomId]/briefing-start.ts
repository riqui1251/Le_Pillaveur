import { prisma } from '@/lib/prisma'
import { launchOnlineRoom, resetRoomToWaitingLobby } from '@/lib/online-room-launch'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { checkLaunchRoster } from './launch-roster'

/**
 * - `launched` : la partie a démarré ;
 * - `back_to_lobby` : l'effectif ne tenait plus, ou le lancement a échoué —
 *   la table est revenue en attente ;
 * - `skipped` : un autre passage a déjà réclamé la fin du briefing (dernier
 *   ack, tick de timeout ou sondage concurrents), ou la salle a disparu.
 */
export type BriefingStartOutcome = 'launched' | 'back_to_lobby' | 'skipped'

async function backToLobby(roomId: string): Promise<void> {
  await resetRoomToWaitingLobby(roomId)
  publishRoomChanged(roomId, { type: 'lobby' })
}

/**
 * Fin du briefing → vraie partie. Appelé par /briefing-ack (dernier ack ou
 * tick de timeout) et par GET /rooms/[roomId] (échéance passée sans qu'aucun
 * tick ne soit arrivé) : idempotent, seul le PREMIER passage
 * 'briefing' → 'playing' lance.
 *
 * L'effectif est relu APRÈS cette réclamation et recontrôlé : un joueur a pu
 * quitter pendant le tuto, et le moteur levait alors (trop peu de joueurs, une
 * équipe vide) en laissant la salle « playing » sans état — plus aucune route
 * ne la débloquait. Effectif insuffisant ou lancement en échec : la table
 * revient au lobby, où l'hôte voit la règle et relance.
 */
export async function startBriefedGame(roomId: string): Promise<BriefingStartOutcome> {
  const claimed = await prisma.onlineRoom.updateMany({
    where: { id: roomId, status: 'briefing' },
    data: { status: 'playing', briefingJson: null },
  })
  if (claimed.count !== 1) return 'skipped'

  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      gameId: true,
      hostUserId: true,
      settingsJson: true,
      // Le lancement ne lit du joueur que son pseudo (RoomWithMembers).
      members: {
        select: { userId: true, user: { select: { displayName: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })
  if (!room) return 'skipped'

  if (checkLaunchRoster(room, room.members.map((m) => m.userId))) {
    await backToLobby(roomId)
    return 'back_to_lobby'
  }

  try {
    await launchOnlineRoom(roomId, room)
  } catch (error) {
    // Nom de la classe seulement, comme withApiRoute : un message Prisma
    // recopie la ligne fautive (pseudos).
    console.error('[briefing] launch failed', error instanceof Error ? error.name : typeof error)
    await backToLobby(roomId)
    return 'back_to_lobby'
  }
  publishRoomChanged(roomId, { type: 'changed' })
  return 'launched'
}
