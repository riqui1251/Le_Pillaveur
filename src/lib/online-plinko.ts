import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getFirstTurnUserId, getMemberUserIds } from '@/lib/online-members'

export function buildPlinkoInitialState(room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const difficulty = settings.plinkoDifficulty ?? 'medium'
  const memberUserIds = getMemberUserIds(room)

  return {
    version: 1,
    memberUserIds,
    gameStarted: true,
    currentPlayer: 0,
    difficulty,
    isCumulativeMode: false,
    pinPositions: [] as { x: number; y: number; row: number; type?: string; value?: number }[],
    slotSipValues: [] as number[],
    specialPins: [] as { x: number; y: number; row: number; type?: string; value?: number }[],
    currentPlayerIndex: 0,
    isAnimating: false,
    turnResult: null,
    playerResults: {} as Record<string, { drinks: number; given: number }>,
    roundDrinksCount: 0,
    gameOver: false,
    resultDisplayPhase: null,
    boardSeed: null,
    rematchVotes: [] as string[],
  }
}

export async function launchPlinkoRoom(roomId: string, room: RoomWithMembers) {
  const initialState = buildPlinkoInitialState(room)
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
