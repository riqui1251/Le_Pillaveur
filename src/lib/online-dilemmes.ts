import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildDilState, serializeDilState } from '@/lib/dilemmes/server-adapter'
import { currentDilActorId } from '@/lib/dilemmes/engine'

type LaunchRoom = {
  hostUserId: string
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Dilemmes — SERVEUR-AUTORITAIRE. Le contenu
 * suit l'ambiance de l'HÔTE (Soft = cartes sages, contenu FR-only).
 */
export async function launchDilemmesRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const host = await prisma.user.findUnique({
    where: { id: room.hostUserId },
    select: { ambianceMode: true },
  })
  const ambiance = host?.ambianceMode === 'soft' ? 'soft' : 'alcool'
  const state = buildDilState(
    room.members,
    ambiance,
    settings.botsCount ?? 0,
    undefined,
    settings.dilRounds,
    Boolean(settings.dilCoquin)
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeDilState(state),
      stateVersion: 1,
      currentTurnUserId: currentDilActorId(state),
    },
  })
}
