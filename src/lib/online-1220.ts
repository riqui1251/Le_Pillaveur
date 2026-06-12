import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getFirstTurnUserId, getMemberUserIds } from '@/lib/online-members'
import { onlinePlayerId } from '@/lib/online-players'

function defaultChoices() {
  return { parity: 'pair' as const, band: '11-20' as const, drinkNumber: 7, giveNumber: 13 }
}

export function build1220InitialState(room: RoomWithMembers) {
  const memberUserIds = getMemberUserIds(room)
  const draft: Record<string, ReturnType<typeof defaultChoices>> = {}
  for (const m of room.members) draft[onlinePlayerId(m.userId)] = defaultChoices()

  return {
    version: 1,
    memberUserIds,
    gameStarted: true,
    currentPlayer: 0,
    phase: 'setup' as const,
    draft,
    setupReady: [] as string[],
    configs: null,
    d12: 6,
    d20: 10,
    rolling: false,
    history: [] as { d12: number; d20: number; results: { playerId: string; name: string; text: string[] }[] }[],
    rematchVotes: [] as string[],
  }
}

export async function launch1220Room(roomId: string, room: RoomWithMembers) {
  const initialState = build1220InitialState(room)
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: JSON.stringify(initialState),
      stateVersion: 1,
      currentTurnUserId: getFirstTurnUserId(room),
    },
  })
}
