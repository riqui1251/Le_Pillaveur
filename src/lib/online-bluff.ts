import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildBluffState, serializeBluffState } from '@/lib/bluff/server-adapter'
import { currentBluffActorId } from '@/lib/bluff/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie du Grand Bluff — SERVEUR-AUTORITAIRE.
 * Les questions sont tirées dans la LANGUE de la salle (réutilise le pool quiz).
 */
export async function launchBluffRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildBluffState(
    room.members,
    settings.lang,
    settings.botsCount ?? 0,
    undefined,
    settings.bluffRounds
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeBluffState(state),
      stateVersion: 1,
      currentTurnUserId: currentBluffActorId(state),
    },
  })
}
