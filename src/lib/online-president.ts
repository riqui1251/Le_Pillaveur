import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildPreState, parsePreState, serializePreState } from '@/lib/president/server-adapter'
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

  // Rematch : les POSITIONS survivent d'une partie à l'autre — le classement
  // final précédent désigne Président et Trou de départ (échange dès la
  // manche 1) ; si un porteur est parti, le plus proche au classement
  // récupère la position (géré par createPreState).
  const previous = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    select: { gameStateJson: true },
  })
  const previousState = parsePreState(previous?.gameStateJson ?? null)
  const previousRanking =
    previousState?.phase === 'finished' ? (previousState.lastRanking ?? null) : null

  const state = buildPreState(
    room.members,
    settings.botsCount ?? 0,
    undefined,
    settings.preManches,
    previousRanking
  )

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
