import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildPbcState, serializePbcState } from '@/lib/petit-bac/server-adapter'
import { currentPbcActorId } from '@/lib/petit-bac/engine'

type LaunchRoom = {
  hostUserId: string
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Petit Bac — SERVEUR-AUTORITAIRE.
 * Pas de bots de complément : le jeu repose sur des réponses tapées.
 */
export async function launchPetitBacRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildPbcState(room.members, undefined, settings.pbcRounds)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializePbcState(state),
      stateVersion: 1,
      currentTurnUserId: currentPbcActorId(state),
    },
  })
}
