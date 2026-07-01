import { prisma } from '@/lib/prisma'
import type { Friendship } from '@prisma/client'

export type FriendDto = {
  friendshipId: string
  userId: string
  displayName: string
  accountCode: string | null
  isOnline: boolean
}

export type FriendRequestDto = {
  id: string
  userId: string
  displayName: string
  accountCode: string | null
  createdAt: string
}

/** Recherche bidirectionnelle — seul point de vérité pour "existe-t-il une relation entre A et B ?". */
export async function getFriendshipBetween(
  userIdA: string,
  userIdB: string
): Promise<Friendship | null> {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userIdA, addresseeId: userIdB },
        { requesterId: userIdB, addresseeId: userIdA },
      ],
    },
  })
}

export async function areFriends(userIdA: string, userIdB: string): Promise<boolean> {
  const friendship = await getFriendshipBetween(userIdA, userIdB)
  return friendship?.status === 'accepted'
}

export type SendFriendRequestResult = {
  status: 'sent' | 'auto-accepted' | 'already-friends' | 'already-pending'
  friendship: Friendship
}

/**
 * Envoie une demande d'ami, avec gestion de la course croisée : si la cible
 * a déjà envoyé une demande en attente, on l'accepte directement au lieu de
 * créer une seconde ligne conflictuelle (une seule ligne canonique par paire).
 */
export async function sendFriendRequest(
  requesterId: string,
  targetUserId: string
): Promise<SendFriendRequestResult> {
  const existing = await prisma.friendship.findUnique({
    where: { requesterId_addresseeId: { requesterId, addresseeId: targetUserId } },
  })
  if (existing) {
    if (existing.status === 'accepted') return { status: 'already-friends', friendship: existing }
    if (existing.status === 'pending') return { status: 'already-pending', friendship: existing }
    const reactivated = await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: 'pending', respondedAt: null },
    })
    return { status: 'sent', friendship: reactivated }
  }

  const reverse = await prisma.friendship.findUnique({
    where: { requesterId_addresseeId: { requesterId: targetUserId, addresseeId: requesterId } },
  })
  if (reverse) {
    if (reverse.status === 'accepted') return { status: 'already-friends', friendship: reverse }
    if (reverse.status === 'pending') {
      const accepted = await prisma.friendship.update({
        where: { id: reverse.id },
        data: { status: 'accepted', respondedAt: new Date() },
      })
      return { status: 'auto-accepted', friendship: accepted }
    }
    // reverse.status === 'declined' — la cible avait décliné notre relation dans l'autre sens ;
    // on crée notre propre demande fraîche plutôt que de réactiver la leur.
  }

  const created = await prisma.friendship.create({
    data: { requesterId, addresseeId: targetUserId, status: 'pending' },
  })
  return { status: 'sent', friendship: created }
}

export async function listFriends(userId: string): Promise<FriendDto[]> {
  const friendships = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: {
      requester: { select: { id: true, displayName: true, accountCode: true } },
      addressee: { select: { id: true, displayName: true, accountCode: true } },
    },
  })

  const pairs = friendships.map((f) => ({
    friendshipId: f.id,
    other: f.requesterId === userId ? f.addressee : f.requester,
  }))
  const recentCutoff = new Date(Date.now() - 2 * 60 * 1000)
  const presences = await prisma.sitePresence.findMany({
    where: { userId: { in: pairs.map((p) => p.other.id) }, lastSeen: { gt: recentCutoff } },
    select: { userId: true },
  })
  const onlineIds = new Set(presences.map((p) => p.userId))

  return pairs.map(({ friendshipId, other }) => ({
    friendshipId,
    userId: other.id,
    displayName: other.displayName,
    accountCode: other.accountCode,
    isOnline: onlineIds.has(other.id),
  }))
}

export async function listPendingRequests(
  userId: string
): Promise<{ incoming: FriendRequestDto[]; outgoing: FriendRequestDto[] }> {
  const [incoming, outgoing] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: userId, status: 'pending' },
      include: { requester: { select: { id: true, displayName: true, accountCode: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendship.findMany({
      where: { requesterId: userId, status: 'pending' },
      include: { addressee: { select: { id: true, displayName: true, accountCode: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    incoming: incoming.map((f) => ({
      id: f.id,
      userId: f.requester.id,
      displayName: f.requester.displayName,
      accountCode: f.requester.accountCode,
      createdAt: f.createdAt.toISOString(),
    })),
    outgoing: outgoing.map((f) => ({
      id: f.id,
      userId: f.addressee.id,
      displayName: f.addressee.displayName,
      accountCode: f.addressee.accountCode,
      createdAt: f.createdAt.toISOString(),
    })),
  }
}
