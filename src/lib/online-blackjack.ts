import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildBjState, serializeBjState } from '@/lib/blackjack/server-adapter'
import { currentBjActorId } from '@/lib/blackjack/engine'

export async function launchBlackjackRoom(roomId: string, room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildBjState(room.members, settings.botsCount ?? 0)
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeBjState(state),
      stateVersion: 1,
      currentTurnUserId: currentBjActorId(state),
    },
  })
}
