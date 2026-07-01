import { prisma } from '@/lib/prisma'

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
