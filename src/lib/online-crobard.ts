import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildCrobardState, serializeCrobardState } from '@/lib/crobard/server-adapter'
import { currentCrobardActorId } from '@/lib/crobard/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Crobard — SERVEUR-AUTORITAIRE. Les mots
 * sont tirés dans la LANGUE de la salle (posée à sa création).
 */
export async function launchCrobardRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildCrobardState(
    room.members,
    settings.lang,
    settings.botsCount ?? 0,
    undefined,
    settings.crobardRounds
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeCrobardState(state),
      stateVersion: 1,
      currentTurnUserId: currentCrobardActorId(state),
    },
  })
}
