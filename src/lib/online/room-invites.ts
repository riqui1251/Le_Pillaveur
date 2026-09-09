import { prisma } from '@/lib/prisma'
import { getBanState } from '@/lib/ban-server'

export type PendingInviteDto = {
  id: string
  roomId: string
  roomCode: string
  gameId: string | null
  hostDisplayName: string
  createdAt: string
}

/** Vrai si déjà membre de la salle, ou si une invite `pending` existe pour cet utilisateur. */
export async function canJoinInviteRoom(roomId: string, userId: string): Promise<boolean> {
  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  })
  if (member) return true

  const invite = await prisma.onlineRoomInvite.findUnique({
    where: { roomId_invitedUserId: { roomId, invitedUserId: userId } },
  })
  return invite?.status === 'pending'
}

/**
 * Invites en attente pour un utilisateur, en excluant/nettoyant celles dont
 * la salle a démarré ou a été supprimée entre-temps (pas de cron nécessaire :
 * le nettoyage se fait paresseusement à chaque lecture).
 */
export async function buildPendingInvitesForUser(userId: string): Promise<PendingInviteDto[]> {
  const invites = await prisma.onlineRoomInvite.findMany({
    where: { invitedUserId: userId, status: 'pending' },
    include: { room: { include: { host: { select: { displayName: true } } } } },
    orderBy: { createdAt: 'desc' },
  })

  const stale = invites.filter((i) => i.room.status !== 'waiting')
  if (stale.length > 0) {
    await prisma.onlineRoomInvite.updateMany({
      where: { id: { in: stale.map((i) => i.id) } },
      data: { status: 'revoked', respondedAt: new Date() },
    })
  }

  return invites
    .filter((i) => i.room.status === 'waiting')
    .map((i) => ({
      id: i.id,
      roomId: i.roomId,
      roomCode: i.room.code,
      gameId: i.room.gameId,
      hostDisplayName: i.room.host.displayName,
      createdAt: i.createdAt.toISOString(),
    }))
}

/** Partenaire de la table précédente, proposé au « Rejouer ». */
export type ReplayMate = {
  userId: string
  displayName: string
}

/** Au-delà, la proposition devient une liste illisible sur mobile. */
export const REPLAY_MATES_LIMIT = 6

/**
 * Qui reconvoquer pour rejouer, jeu par jeu : les HUMAINS de la dernière table
 * terminée, dans la limite de ceux qu'on peut réellement inviter aujourd'hui.
 * Fonction pure (les requêtes vivent dans buildReplayMatesForUser) : c'est la
 * règle qu'on veut tester, pas Prisma.
 *
 * Les bots ne sont jamais candidats — ils n'ont pas de compte, donc pas de
 * ligne de résultat ; ils n'entrent tout simplement pas dans `matchRows`.
 */
export function pickReplayMates(params: {
  selfUserId: string
  /** roomId de la dernière table terminée, par jeu */
  lastRoomIdByGame: Record<string, string>
  /** lignes (roomId, userId) des résultats de ces tables */
  matchRows: { roomId: string; userId: string }[]
  /** comptes réellement invitables (amitié acceptée, pas de bannissement) : userId → pseudo */
  invitableById: Map<string, string>
  limit?: number
}): Record<string, ReplayMate[]> {
  const { selfUserId, lastRoomIdByGame, matchRows, invitableById } = params
  const limit = params.limit ?? REPLAY_MATES_LIMIT

  const byRoom = new Map<string, ReplayMate[]>()
  const seen = new Set<string>()
  for (const row of matchRows) {
    if (row.userId === selfUserId) continue
    // Un même joueur peut avoir plusieurs lignes pour une table (rematch dans
    // la même salle) : une seule proposition par table.
    const key = `${row.roomId}|${row.userId}`
    if (seen.has(key)) continue
    seen.add(key)
    // Plus ami, compte supprimé ou banni : on ne le propose pas, plutôt que
    // de promettre une invitation qui échouerait à l'envoi.
    const displayName = invitableById.get(row.userId)
    if (!displayName) continue
    const list = byRoom.get(row.roomId)
    if (list) list.push({ userId: row.userId, displayName })
    else byRoom.set(row.roomId, [{ userId: row.userId, displayName }])
  }

  const result: Record<string, ReplayMate[]> = {}
  for (const [gameId, roomId] of Object.entries(lastRoomIdByGame)) {
    const mates = byRoom.get(roomId)
    if (mates && mates.length > 0) result[gameId] = mates.slice(0, limit)
  }
  return result
}

/**
 * Partenaires à reproposer pour chaque jeu de l'historique « Rejouer ».
 * Silencieusement vide si la dernière table n'était peuplée que de bots, ou
 * si plus personne n'est invitable — la rangée reste utilisable dans tous les cas.
 */
export async function buildReplayMatesForUser(
  userId: string,
  gameIds: string[]
): Promise<Record<string, ReplayMate[]>> {
  if (gameIds.length === 0) return {}

  // Dernière table TERMINÉE de chaque jeu : OnlineMatchResult est la seule
  // source qui retient le roomId (OnlineGameHistory ne compte que les lancements).
  const lastRooms = await prisma.onlineMatchResult.findMany({
    where: { userId, gameId: { in: gameIds } },
    orderBy: { finishedAt: 'desc' },
    distinct: ['gameId'],
    select: { gameId: true, roomId: true },
  })
  if (lastRooms.length === 0) return {}

  const lastRoomIdByGame: Record<string, string> = {}
  for (const row of lastRooms) lastRoomIdByGame[row.gameId] = row.roomId

  const matchRows = await prisma.onlineMatchResult.findMany({
    where: { roomId: { in: lastRooms.map((r) => r.roomId) }, userId: { not: userId } },
    orderBy: { finishedAt: 'asc' },
    select: { roomId: true, userId: true },
  })
  const candidateIds = [...new Set(matchRows.map((r) => r.userId))]
  if (candidateIds.length === 0) return {}

  // Mêmes conditions que la route d'invitation (amitié acceptée + pas de
  // bannissement) : ce qu'on propose est ce qui passera vraiment.
  const banFields = {
    id: true,
    displayName: true,
    banType: true,
    bannedUntil: true,
    banComment: true,
    bannedAt: true,
  } as const
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: userId, addresseeId: { in: candidateIds } },
        { addresseeId: userId, requesterId: { in: candidateIds } },
      ],
    },
    include: {
      requester: { select: banFields },
      addressee: { select: banFields },
    },
  })

  const invitableById = new Map<string, string>()
  for (const f of friendships) {
    const other = f.requesterId === userId ? f.addressee : f.requester
    if (getBanState(other).banned) continue
    invitableById.set(other.id, other.displayName)
  }

  return pickReplayMates({ selfUserId: userId, lastRoomIdByGame, matchRows, invitableById })
}
