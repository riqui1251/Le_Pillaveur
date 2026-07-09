import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildMenteurState, serializeMenteurState } from '@/lib/menteur/server-adapter'
import { currentMenteurActorId } from '@/lib/menteur/engine'

type LaunchRoom = {
  settingsJson: string | null
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
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildMenteurState(room.members, settings.botsCount ?? 0, undefined, {
    palifico: settings.menteurPalifico,
    calza: settings.menteurCalza,
  })

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
