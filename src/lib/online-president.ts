import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildPreState, serializePreState } from '@/lib/president/server-adapter'
import { currentPreActorId } from '@/lib/president/engine'

type LaunchRoom = {
  hostUserId: string
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Président — SERVEUR-AUTORITAIRE.
 * Les bots (plus petit combo valide) complètent la table jusqu'à 4.
 */
export async function launchPresidentRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildPreState(room.members, settings.botsCount ?? 0, undefined, settings.preManches)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializePreState(state),
      stateVersion: 1,
      currentTurnUserId: currentPreActorId(state),
    },
  })
}
