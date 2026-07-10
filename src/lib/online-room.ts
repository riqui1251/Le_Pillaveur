import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { parseOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'
import { levelForXp } from '@/lib/online/cosmetics'
import { parseBriefing, type RoomBriefing } from '@/lib/online/briefing'

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
  /** Personnalisation du joueur en ligne (icône/effet/cadre du compte). */
  preferences: OnlinePreferences
  /** Niveau de progression en ligne (dérivé de l'XP). */
  level: number
  /** Rôle brut du compte — sert à dériver l'écusson de rang (crestTierForRole). */
  role: string
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
  /** Briefing tuto en cours (statut 'briefing') : qui a fini de lire. */
  briefing: RoomBriefing | null
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
  // Bornes du registre (jeux serveur-autoritaires) ; 2 joueurs par défaut.
  // L'hôte peut AJOUTER des bots (settings.botsCount) : le minimum s'applique
  // au TOTAL humains + bots.
  const adapter = getGameAdapter(gameId)
  const min = adapter?.minPlayers ?? 2
  const max = adapter?.maxPlayers ?? Number.MAX_SAFE_INTEGER
  const bots = adapter?.botsFillable ? Math.max(0, settings.botsCount ?? 0) : 0
  const total = membersWithIds.length + bots
  return {
    allReady,
    canLaunch: allReady && total >= min && membersWithIds.length <= max && total <= max,
  }
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
 * le serveur). Passe par le registre d'adaptateurs ; retombe sur
 * `stripEngineSecret` pour les jeux client-autoritaires.
 */
export function stripEngineSecretForUser(
  gameId: string | null,
  json: string | null,
  userId: string
): string | null {
  if (!json) return json
  const adapter = getGameAdapter(gameId)
  if (adapter) {
    const state = adapter.parse(json)
    if (!state) return null
    return adapter.clientViewJson(state, userId)
  }
  return stripEngineSecret(json)
}

/**
 * Variante SPECTATEUR NEUTRE (écran TV partagé, aucun viewer précis) : masque
 * tous les secrets pour un observateur sans camp (TC : navires intacts des
 * DEUX équipes cachés). Registre d'adaptateurs, même repli que ci-dessus.
 */
export function stripEngineSecretForSpectator(gameId: string | null, json: string | null): string | null {
  if (!json) return json
  const adapter = getGameAdapter(gameId)
  if (adapter) {
    const state = adapter.parse(json)
    if (!state) return null
    return adapter.spectatorViewJson(state)
  }
  return stripEngineSecret(json)
}

/** DTO minimal en LECTURE SEULE pour l'écran TV — pas de notion de « soi ». */
export type TvRoomDto = {
  code: string
  status: string
  gameId: string | null
  hostUserId: string
  members: Array<{
    userId: string
    displayName: string
    isHost: boolean
    isReady: boolean
    preferences: OnlinePreferences
    level: number
    role: string
  }>
  settings: RoomSettings
  stateVersion: number
  currentTurnUserId: string | null
  gameStateJson: string | null
}

/**
 * Construit le DTO TV d'une salle À PARTIR DE SON CODE (le code = jeton d'accès
 * pour un écran non authentifié). État de jeu passé par le masquage spectateur.
 */
export async function buildTvRoomDto(code: string): Promise<TvRoomDto | null> {
  const room = await prisma.onlineRoom.findUnique({
    where: { code },
    include: {
      members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
    },
  })
  if (!room) return null

  return {
    code: room.code,
    status: room.status,
    gameId: room.gameId,
    hostUserId: room.hostUserId,
    members: room.members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      isHost: m.userId === room.hostUserId,
      isReady: m.isReady,
      preferences: parseOnlinePreferences(m.user.onlinePreferencesJson),
      level: levelForXp(m.user.onlineXp),
      role: m.user.role,
    })),
    settings: parseRoomSettings(room.settingsJson),
    stateVersion: room.stateVersion,
    currentTurnUserId: room.currentTurnUserId,
    gameStateJson: stripEngineSecretForSpectator(room.gameId, room.gameStateJson),
  }
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
    preferences: parseOnlinePreferences(m.user.onlinePreferencesJson),
    level: levelForXp(m.user.onlineXp),
    role: m.user.role,
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
    briefing: room.status === 'briefing' ? parseBriefing(room.briefingJson) : null,
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

/**
 * Supprime une salle si elle n'a plus aucun membre — évite les lobbys
 * fantômes quand un joueur en quitte une pour en créer/rejoindre une autre
 * (create/join retirent sa membership sans jamais passer par DELETE).
 */
export async function deleteRoomIfEmpty(roomId: string): Promise<void> {
  const remaining = await prisma.onlineRoomMember.count({ where: { roomId } })
  if (remaining === 0) {
    await prisma.onlineRoom.delete({ where: { id: roomId } }).catch(() => {})
  }
}
