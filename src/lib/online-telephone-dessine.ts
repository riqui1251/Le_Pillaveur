import { prisma } from '@/lib/prisma'
import { buildTelephoneState, serializeTelephoneState } from '@/lib/telephone-dessine/server-adapter'
import { currentTelephoneActorId } from '@/lib/telephone-dessine/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Téléphone Dessiné — SERVEUR-AUTORITAIRE.
 * Aucun contenu à tirer : le contenu, ce sont les joueurs.
 */
export async function launchTelephoneDessineRoom(roomId: string, room: LaunchRoom) {
  const state = buildTelephoneState(room.members)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeTelephoneState(state),
      stateVersion: 1,
      currentTurnUserId: currentTelephoneActorId(state),
    },
  })
}
