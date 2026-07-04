import { prisma } from '@/lib/prisma'
import { buildMenteurState, serializeMenteurState } from '@/lib/menteur/server-adapter'
import { currentMenteurActorId } from '@/lib/menteur/engine'

type LaunchRoom = {
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie du Menteur — SERVEUR-AUTORITAIRE.
 * Graine par partie : dés reproductibles côté serveur, jamais côté client.
 */
export async function launchMenteurRoom(roomId: string, room: LaunchRoom) {
  const state = buildMenteurState(room.members)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeMenteurState(state),
      stateVersion: 1,
      currentTurnUserId: currentMenteurActorId(state),
    },
  })
}
