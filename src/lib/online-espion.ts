import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildEspionState, serializeEspionState } from '@/lib/espion/server-adapter'
import { currentEspionActorId } from '@/lib/espion/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Qui est l'Espion ? — SERVEUR-AUTORITAIRE.
 * Les lieux sont tirés dans la LANGUE de la salle (posée à sa création).
 */
export async function launchEspionRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const discussionMs =
    settings.espionDiscussionMin != null ? settings.espionDiscussionMin * 60_000 : undefined
  const state = buildEspionState(
    room.members,
    settings.lang,
    settings.botsCount ?? 0,
    undefined,
    discussionMs,
    settings.espionRoundsToWin
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeEspionState(state),
      stateVersion: 1,
      currentTurnUserId: currentEspionActorId(state),
    },
  })
}
