import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { parseTCState, tcClientViewJson } from '@/lib/toucher-coule/server-adapter'
import { TC_MODES } from '@/lib/toucher-coule/engine'

const ROOM_CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const ROOM_CODE_LENGTH = 6

function generateRoomCode(): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH)
  let out = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length]
  }
  return out
}

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
  visibility: string
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

function computeReadyState(
  membersWithIds: { userId: string; isReady: boolean }[],
  gameId: string | null,
  settings: RoomSettings
) {
  const allReady = membersWithIds.length > 0 && membersWithIds.every((m) => m.isReady)
  if (gameId === 'toucher-coule') {
    // Les bots comblent les sièges vides : un seul joueur prêt suffit.
    const capacity = TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
    return { allReady, canLaunch: allReady && membersWithIds.length <= capacity }
  }
  return { allReady, canLaunch: allReady && membersWithIds.length >= 2 }
}

/**
 * Retire les champs secrets serveur (ex. `rngState` du moteur Petit Buveur)
 * avant tout envoi au client — anti-triche : empêche de prédire dés/cases.
 * No-op pour les jeux sans champ secret.
 */
export function stripEngineSecret(json: string | null): string | null {
  if (!json) return json
  try {
    const obj = JSON.parse(json)
    if (obj && typeof obj === 'object' && 'rngState' in obj) {
      delete (obj as Record<string, unknown>).rngState
      return JSON.stringify(obj)
    }
    return json
  } catch {
    return json
  }
}

/**
 * Variante PAR UTILISATEUR : certains jeux ont des secrets asymétriques
 * (Toucher-Coulé : les navires ennemis non touchés ne doivent jamais quitter
 * le serveur). Retombe sur `stripEngineSecret` pour les autres jeux.
 */
export function stripEngineSecretForUser(
  gameId: string | null,
  json: string | null,
  userId: string
): string | null {
  if (!json) return json
  if (gameId === 'toucher-coule') {
    const state = parseTCState(json)
    if (!state) return null
    return tcClientViewJson(state, userId)
  }
  return stripEngineSecret(json)
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

  const settings = parseRoomSettings(room.settingsJson)
  const { allReady, canLaunch } = computeReadyState(
    memberDtos.map((m) => ({ userId: m.userId, isReady: m.isReady })),
    room.gameId,
    settings
  )

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    visibility: room.visibility,
    gameId: room.gameId,
    hostUserId: room.hostUserId,
    members: memberDtos,
    allReady,
    canLaunch,
    settings,
    stateVersion: room.stateVersion,
    currentTurnUserId: room.currentTurnUserId,
    gameStateJson: stripEngineSecretForUser(room.gameId, room.gameStateJson, currentUserId),
  }
}

export async function buildLobbyList(): Promise<LobbyListItem[]> {
  const rooms = await prisma.onlineRoom.findMany({
    where: { status: 'waiting', gameId: { not: null }, visibility: 'public' },
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
