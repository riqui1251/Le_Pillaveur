import type { Player } from '@/lib/players'
import type { RoomMemberDto } from '@/lib/online-room'

const ONLINE_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500',
  'bg-pink-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500',
]

export function onlinePlayerId(userId: string): string {
  return `online-${userId}`
}

export function isOnlinePlayerId(id: string): boolean {
  return id.startsWith('online-')
}

export function onlineUserIdFromPlayerId(id: string): string | null {
  return isOnlinePlayerId(id) ? id.slice('online-'.length) : null
}

export function membersToPlayers(members: RoomMemberDto[]): Player[] {
  return members.map((m, index) => ({
    id: onlinePlayerId(m.userId),
    name: m.displayName,
    createdAt: Date.now(),
    stats: { gamesPlayed: 0, wins: 0, totalDrinks: 0 },
    preferences: {
      color: ONLINE_COLORS[index % ONLINE_COLORS.length],
      icon: m.isHost ? '👑' : '🌐',
    },
  }))
}
