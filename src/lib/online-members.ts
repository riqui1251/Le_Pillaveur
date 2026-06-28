import type { RoomWithMembers } from '@/lib/online-room-launch'

export const ONLINE_MEMBER_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
]

export function getMemberUserIds(room: RoomWithMembers): string[] {
  return room.members.map((m) => m.userId)
}

export function getFirstTurnUserId(room: RoomWithMembers): string | null {
  return room.members[0]?.userId ?? null
}
