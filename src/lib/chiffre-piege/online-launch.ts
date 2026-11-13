import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildChiffrePiegeState, serializeChiffrePiegeState } from './server-adapter'
import { currentChiffrePiegeActorId } from './online-state'

/**
 * Réglages lus par le lanceur. `cpMax` / `cpRounds` arrivent dans RoomSettings
 * avec le câblage du lobby ; validés par le builder (défauts du jeu local :
 * 1 à 100, 5 manches), comme après un changement de jeu qui ne les garde pas.
 */
type ChiffrePiegeRoomSettings = { botsCount?: number; cpMax?: unknown; cpRounds?: unknown }

/** Lance (ou relance) une partie du Chiffre Piégé — serveur-autoritaire, graine neuve à chaque lancement. */
export async function launchChiffrePiegeRoom(roomId: string, room: RoomWithMembers) {
  const settings: ChiffrePiegeRoomSettings = parseRoomSettings(room.settingsJson)
  const state = buildChiffrePiegeState(room.members, settings.botsCount ?? 0, undefined, {
    max: settings.cpMax,
    rounds: settings.cpRounds,
  })
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeChiffrePiegeState(state),
      stateVersion: 1,
      currentTurnUserId: currentChiffrePiegeActorId(state),
    },
  })
}
