import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildImposteurState, serializeImposteurState } from '@/lib/imposteur/server-adapter'
import { currentImposteurActorId } from '@/lib/imposteur/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de l'Imposteur — SERVEUR-AUTORITAIRE.
 * La paire de mots est tirée dans la LANGUE de la salle (posée à la création).
 */
export async function launchImposteurRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildImposteurState(room.members, settings.lang, settings.botsCount ?? 0)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeImposteurState(state),
      stateVersion: 1,
      currentTurnUserId: currentImposteurActorId(state),
    },
  })
}
