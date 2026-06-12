import { prisma } from '@/lib/prisma'
import { emptySyncedView, parseRoomSettings } from '@/lib/online-game-state'
import { PLAYER_ICONS } from '@/lib/players'

const DEFAULT_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
]

type RoomWithMembers = {
  id: string
  hostUserId: string
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/** État initial synchronisé — Petit Buveur en ligne */
export function buildPetitBuveurInitialState(room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const memberUserIds = room.members.map((m) => m.userId)

  const players = room.members.map((m, i) => ({
    id: `online-${m.userId}`,
    name: m.user.displayName,
    createdAt: Date.now(),
    position: 0,
    drinks: 0,
    protected: false,
    cursed: 0,
    skipNextTurn: false,
    anchored: false,
    preferences: {
      color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      icon: m.userId === room.hostUserId ? '👑' : PLAYER_ICONS[i % PLAYER_ICONS.length],
    },
  }))

  return {
    version: 1,
    memberUserIds,
    players,
    currentPlayer: 0,
    turnCount: 1,
    gameDifficulty: settings.difficulty ?? 'normal',
    lastCase: null,
    gameStarted: true,
    winner: null,
    rematchVotes: [] as string[],
    view: emptySyncedView(),
  }
}

export { resetRoomToWaitingLobby } from '@/lib/online-room-launch'

/** Lance (ou relance) une partie Petit Buveur avec les membres actuels */
export async function launchPetitBuveurRoom(roomId: string, room: RoomWithMembers) {
  const initialState = buildPetitBuveurInitialState(room)
  const memberUserIds = room.members.map((m) => m.userId)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: JSON.stringify(initialState),
      stateVersion: 1,
      currentTurnUserId: memberUserIds[0] ?? null,
    },
  })
}
