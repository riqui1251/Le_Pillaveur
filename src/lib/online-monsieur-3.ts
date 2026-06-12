import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getFirstTurnUserId, getMemberUserIds } from '@/lib/online-members'
import { onlinePlayerId } from '@/lib/online-players'

export function buildMonsieur3InitialState(room: RoomWithMembers) {
  const memberUserIds = getMemberUserIds(room)
  const players = room.members.map((m) => ({
    id: onlinePlayerId(m.userId),
    name: m.user.displayName,
    isMonsieur3: false,
    score: 0,
  }))

  return {
    version: 1,
    memberUserIds,
    gameStarted: true,
    currentPlayer: 0,
    gamePhase: 'setup' as const,
    players,
    dice: { dice1: 1, dice2: 1 },
    rolling: false,
    message: 'Lancez le dé — le premier à faire un 3 devient Monsieur 3 !',
    rollHistory: [] as { player: string; dice: { dice1: number; dice2: number }; message: string }[],
    specialMessage: null,
    canRoll: true,
    setupRolls: [] as { playerName: string; roll: number }[],
    monsieur3Found: false,
    gameEnded: false,
    monsieur3Index: -1,
    victoryScreen: false,
    rematchVotes: [] as string[],
  }
}

export async function launchMonsieur3Room(roomId: string, room: RoomWithMembers) {
  const initialState = buildMonsieur3InitialState(room)
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
