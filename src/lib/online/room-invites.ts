import { prisma } from '@/lib/prisma'
import { getBanState } from '@/lib/ban-server'
import { SAME_MATCH_WINDOW_MS } from '@/lib/online/match-history'

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
 * Qui reconvoquer pour rejouer, jeu par jeu : les HUMAINS de la dernière partie
 * terminée, dans la limite de ceux qu'on peut réellement inviter aujourd'hui.
 * Fonction pure (les requêtes vivent dans buildReplayMatesForUser) : c'est la
 * règle qu'on veut tester, pas Prisma.
 *
 * Les bots ne sont jamais candidats — ils n'ont pas de compte, donc pas de
 * ligne de résultat ; ils n'entrent tout simplement pas dans `matchRows`.
 */
export function pickReplayMates(params: {
  selfUserId: string
  /** lignes (jeu, joueur) des résultats de la DERNIÈRE partie de chaque jeu */
  matchRows: { gameId: string; userId: string }[]
  /** comptes réellement invitables (amitié acceptée, pas de bannissement) : userId → pseudo */
  invitableById: Map<string, string>
  limit?: number
}): Record<string, ReplayMate[]> {
  const { selfUserId, matchRows, invitableById } = params
  const limit = params.limit ?? REPLAY_MATES_LIMIT

  // Par JEU, jamais par salle : une salle passée d'un jeu à l'autre garde son
  // identifiant, et la rangée du second jeu reproposait les joueurs du premier.
  const byGame = new Map<string, ReplayMate[]>()
  const seen = new Set<string>()
  for (const row of matchRows) {
    if (row.userId === selfUserId) continue
    const key = `${row.gameId}|${row.userId}`
    if (seen.has(key)) continue
    seen.add(key)
    // Plus ami, compte supprimé ou banni : on ne le propose pas, plutôt que
    // de promettre une invitation qui échouerait à l'envoi.
    const displayName = invitableById.get(row.userId)
    if (!displayName) continue
    const list = byGame.get(row.gameId)
    if (list) list.push({ userId: row.userId, displayName })
    else byGame.set(row.gameId, [{ userId: row.userId, displayName }])
  }

  const result: Record<string, ReplayMate[]> = {}
  for (const [gameId, mates] of byGame) result[gameId] = mates.slice(0, limit)
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

  // Dernière partie TERMINÉE de chaque jeu : OnlineMatchResult est la seule
  // source qui retient le roomId (OnlineGameHistory ne compte que les lancements).
  const lastMatches = await prisma.onlineMatchResult.findMany({
    where: { userId, gameId: { in: gameIds } },
    orderBy: { finishedAt: 'desc' },
    distinct: ['gameId'],
    select: { gameId: true, roomId: true, finishedAt: true },
  })
  if (lastMatches.length === 0) return {}

  // Les partenaires de CETTE partie seulement (même jeu, même salle, même
  // fin : la borne de listRecentTables). Une salle rejouée ou passée à un
  // autre jeu garde son roomId : la lire en entier reproposait un joueur
  // parti avant la dernière manche, ou venu pour un autre jeu.
  const matchRows = await prisma.onlineMatchResult.findMany({
    where: {
      userId: { not: userId },
      OR: lastMatches.map((match) => ({
        roomId: match.roomId,
        gameId: match.gameId,
        finishedAt: {
          gte: new Date(match.finishedAt.getTime() - SAME_MATCH_WINDOW_MS),
          lte: new Date(match.finishedAt.getTime() + SAME_MATCH_WINDOW_MS),
        },
      })),
    },
    orderBy: { finishedAt: 'asc' },
    select: { gameId: true, userId: true },
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

  return pickReplayMates({ selfUserId: userId, matchRows, invitableById })
}
