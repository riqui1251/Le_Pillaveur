import { prisma } from '@/lib/prisma'
import { generateRoomCode } from '@/lib/auth-server'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'

export type RoomMemberDto = {
  userId: string
  displayName: string
  isHost: boolean
  isReady: boolean
  isSelf: boolean
}

export type RoomDto = {
  id: string
  code: string
  status: string
  gameId: string | null
  hostUserId: string
  members: RoomMemberDto[]
  allReady: boolean
  canLaunch: boolean
  settings: RoomSettings
  stateVersion: number
  currentTurnUserId: string | null
  gameStateJson: string | null
}

export type LobbyListItem = {
  id: string
  code: string
  gameId: string
  hostName: string
  memberCount: number
  members: { displayName: string; isReady: boolean }[]
}

function computeReadyState(membersWithIds: { userId: string; isReady: boolean }[]) {
  const allReady = membersWithIds.length > 0 && membersWithIds.every((m) => m.isReady)
  return { allReady, canLaunch: allReady && membersWithIds.length >= 2 }
}

export async function buildRoomDto(roomId: string, currentUserId: string): Promise<RoomDto | null> {
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!room) return null

  const memberDtos = room.members.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    isHost: m.userId === room.hostUserId,
    isReady: m.isReady,
    isSelf: m.userId === currentUserId,
  }))

  const { allReady, canLaunch } = computeReadyState(
    memberDtos.map((m) => ({ userId: m.userId, isReady: m.isReady }))
  )

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    gameId: room.gameId,
    hostUserId: room.hostUserId,
    members: memberDtos,
    allReady,
    canLaunch,
    settings: parseRoomSettings(room.settingsJson),
    stateVersion: room.stateVersion,
    currentTurnUserId: room.currentTurnUserId,
    gameStateJson: room.gameStateJson,
  }
}

export async function buildLobbyList(): Promise<LobbyListItem[]> {
  const rooms = await prisma.onlineRoom.findMany({
    where: { status: 'waiting', gameId: { not: null } },
    include: {
      host: { select: { displayName: true } },
      members: {
        include: { user: { select: { displayName: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rooms.map((room) => ({
    id: room.id,
    code: room.code,
    gameId: room.gameId!,
    hostName: room.host.displayName,
    memberCount: room.members.length,
    members: room.members.map((m) => ({
      displayName: m.user.displayName,
      isReady: m.isReady,
    })),
  }))
}

export async function createUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode()
    const exists = await prisma.onlineRoom.findUnique({ where: { code } })
    if (!exists) return code
  }
  throw new Error('Impossible de générer un code de salle')
}

export async function touchMemberPresence(roomId: string, userId: string): Promise<void> {
  await prisma.onlineRoomMember.updateMany({
    where: { roomId, userId },
    data: { lastSeenAt: new Date() },
  })
}
