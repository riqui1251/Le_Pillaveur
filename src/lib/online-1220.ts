import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getFirstTurnUserId } from '@/lib/online-members'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildGame1220State, serializeGame1220State } from '@/lib/1220/server-adapter'

export async function launch1220Room(roomId: string, room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildGame1220State(room.members, settings.botsCount ?? 0)
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeGame1220State(state),
      stateVersion: 1,
      currentTurnUserId: getFirstTurnUserId(room),
    },
  })
}
