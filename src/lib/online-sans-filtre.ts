import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildSFState, serializeSFState } from '@/lib/sans-filtre/server-adapter'
import { currentSFActorId } from '@/lib/sans-filtre/engine'

type LaunchRoom = {
  hostUserId: string
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Sans Filtre — SERVEUR-AUTORITAIRE.
 * Le contenu suit l'ambiance de l'HÔTE : en Soft, seules les cartes sages
 * (contenu FR-only, voir la charte dans src/lib/sans-filtre/data/cards.fr.ts).
 */
export async function launchSansFiltreRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const host = await prisma.user.findUnique({
    where: { id: room.hostUserId },
    select: { ambianceMode: true },
  })
  const ambiance = host?.ambianceMode === 'soft' ? 'soft' : 'alcool'
  const state = buildSFState(
    room.members,
    ambiance,
    settings.botsCount ?? 0,
    undefined,
    settings.sfRounds
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeSFState(state),
      stateVersion: 1,
      currentTurnUserId: currentSFActorId(state),
    },
  })
}
