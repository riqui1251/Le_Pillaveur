import { prisma } from '@/lib/prisma'
import { isOnline } from '@/lib/presence'
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
  status: 'sent' | 'auto-accepted' | 'already-friends' | 'already-pending' | 'declined-cooldown'
  friendship: Friendship
}

/**
 * Délai avant de pouvoir relancer quelqu'un qui a refusé. Sans lui, un refus
 * n'arrêtait rien : la même demande pouvait revenir dans la seconde, en
 * boucle. Sept jours laissent la place à un refus par erreur sans transformer
 * la fonction en harcèlement à un clic.
 */
export const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/** Le refus est-il encore trop frais pour relancer ? (fonction pure, testée) */
export function isDeclineCooldownActive(
  respondedAt: Date | null,
  now: Date = new Date()
): boolean {
  // Refus d'avant l'introduction du délai (pas d'horodatage) : on laisse passer.
  if (!respondedAt) return false
  return now.getTime() - respondedAt.getTime() < DECLINE_COOLDOWN_MS
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
    if (isDeclineCooldownActive(existing.respondedAt)) {
      return { status: 'declined-cooldown', friendship: existing }
    }
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

/**
 * Statut « en ligne » d'un ami : dernière activité du COMPTE (User.lastSeenAt)
 * de moins de 3 min, la définition partagée de presence.ts. Il reposait sur
 * SitePresence, qui n'est écrite qu'avec le consentement aux statistiques : un
 * ami qui les avait refusées n'apparaissait jamais en ligne, et un navigateur
 * resté lié à un compte déconnecté l'affichait en ligne à tort. Seul le
 * booléen sort d'ici, jamais la date elle-même.
 */
export async function listFriends(userId: string): Promise<FriendDto[]> {
  const friendSelect = { id: true, displayName: true, accountCode: true, lastSeenAt: true } as const
  const friendships = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: {
      requester: { select: friendSelect },
      addressee: { select: friendSelect },
    },
  })

  const now = Date.now()
  return friendships.map((f) => {
    const other = f.requesterId === userId ? f.addressee : f.requester
    return {
      friendshipId: f.id,
      userId: other.id,
      displayName: other.displayName,
      accountCode: other.accountCode,
      isOnline: isOnline(other.lastSeenAt, now),
    }
  })
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
