import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getFirstTurnUserId } from '@/lib/online-members'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildPurpleState, serializePurpleState } from '@/lib/purple/server-adapter'

export async function launchPurpleRoom(roomId: string, room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildPurpleState(room.members, settings.botsCount ?? 0)
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializePurpleState(state),
      stateVersion: 1,
      currentTurnUserId: state.players[state.currentPlayer]?.id ?? getFirstTurnUserId(room),
    },
  })
}
