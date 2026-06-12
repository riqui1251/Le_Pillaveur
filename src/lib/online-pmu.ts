import { prisma } from '@/lib/prisma'
import type { PmuHorseState } from '@/lib/online-game-state'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getFirstTurnUserId, getMemberUserIds } from '@/lib/online-members'

const INITIAL_HORSES: Omit<PmuHorseState, 'position' | 'playerIds'>[] = [
  { name: 'Tonnerre', emoji: '🔴', colorFrom: '#ef4444', colorTo: '#f97316' },
  { name: 'Éclair', emoji: '🔵', colorFrom: '#3b82f6', colorTo: '#6366f1' },
  { name: 'Tempête', emoji: '🟢', colorFrom: '#10b981', colorTo: '#14b8a6' },
  { name: 'Ouragan', emoji: '🟡', colorFrom: '#f59e0b', colorTo: '#eab308' },
]

export function makePmuHorses(): PmuHorseState[] {
  return INITIAL_HORSES.map((h) => ({ ...h, position: 0, playerIds: [] }))
}

export function buildPmuInitialState(room: RoomWithMembers) {
  const memberUserIds = getMemberUserIds(room)

  return {
    version: 1,
    memberUserIds,
    gameStarted: true,
    currentPlayer: 0,
    phase: 'mode-select' as const,
    mode: 'paris' as const,
    horses: makePmuHorses(),
    bets: {} as Record<string, number>,
    payoutTargets: {} as Record<string, string>,
    distSips: 0,
    winnerIndex: null,
    raceSeed: null,
    rematchVotes: [] as string[],
  }
}

export async function launchPmuRoom(roomId: string, room: RoomWithMembers) {
  const initialState = buildPmuInitialState(room)
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
