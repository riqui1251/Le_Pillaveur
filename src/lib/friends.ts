import { prisma } from '@/lib/prisma'
import { isOnline } from '@/lib/presence'
import { getBanState } from '@/lib/ban-server'
import { listBlockedCounterpartIds } from '@/lib/moderation/blocks'
import { addableTablemateIds, otherHumanIds } from '@/lib/rematch-night'
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

// ---------------------------------------------------------------------------
// « Ajouter la tablée en amis » (carte « On remet ça ? » de l'écran de fin)
// ---------------------------------------------------------------------------

/** Colonnes de ban d'un compte de la tablée : getBanState les lit sans requête de plus. */
type TablemateRow = {
  id: string
  banType: string | null
  bannedUntil: Date | null
  banComment: string | null
  bannedAt: Date | null
}

export type TablemateLookup =
  | { kind: 'room_not_found' }
  | { kind: 'not_a_member' }
  | { kind: 'ok'; tablemates: TablemateRow[] }

/**
 * Les AUTRES comptes humains d'une salle, lus EN BASE (OnlineRoomMember) —
 * jamais une liste envoyée par le client : sans cette règle, n'importe qui
 * pourrait demander en ami n'importe quel identifiant en se disant « à sa
 * table ». Le demandeur doit lui-même être membre de la salle.
 *
 * Une seule requête : la salle, ses membres et leurs colonnes de ban.
 */
export async function lookupTablemates(roomId: string, userId: string): Promise<TablemateLookup> {
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    select: {
      members: {
        select: {
          userId: true,
          user: {
            select: { id: true, banType: true, bannedUntil: true, banComment: true, bannedAt: true },
          },
        },
      },
    },
  })
  if (!room) return { kind: 'room_not_found' }
  const memberIds = room.members.map((m) => m.userId)
  if (!memberIds.includes(userId)) return { kind: 'not_a_member' }
  const others = new Set(otherHumanIds(memberIds, userId))
  return {
    kind: 'ok',
    tablemates: room.members.filter((m) => others.has(m.userId)).map((m) => m.user),
  }
}

/** Relations existantes entre `userId` et ces comptes, dans les deux sens (une requête). */
async function friendshipsWith(userId: string, otherIds: string[]) {
  if (otherIds.length === 0) return []
  return prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: { in: otherIds } },
        { addresseeId: userId, requesterId: { in: otherIds } },
      ],
    },
    select: { requesterId: true, addresseeId: true, status: true },
  })
}

/**
 * Combien de membres de la tablée le bouton toucherait-il ? Sert à ne pas
 * afficher « Ajouter la tablée » à une bande déjà toute amie. Aveugle au
 * blocage et au ban, à dessein : voir addableTablemateIds.
 */
export async function countAddableTablemates(userId: string, tablemates: TablemateRow[]): Promise<number> {
  const ids = tablemates.map((t) => t.id)
  return addableTablemateIds(userId, ids, await friendshipsWith(userId, ids)).length
}

export type TableFriendRequestsTally = {
  /** Demandes créées (ou réactivées après un refus prescrit). */
  requested: number
  /** Demandes reçues de la tablée, acceptées par ce geste. */
  accepted: number
  /** Déjà amis ou déjà en attente : rien d'écrit. */
  already: number
  /**
   * Écartés sans rien écrire : compte banni, blocage dans un sens ou dans
   * l'autre, refus trop récent. JAMAIS renvoyé au client : le détail dirait
   * qui a bloqué ou refusé qui (même règle que cannot_add_player).
   */
  skipped: number
}

/**
 * Envoie une demande d'ami à chaque autre humain de la tablée, avec la
 * logique du geste unitaire (sendFriendRequest : une ligne par paire,
 * auto-acceptation de la demande croisée, délai après un refus). En SÉRIE :
 * SQLite n'a qu'un écrivain, et une tablée compte au plus une douzaine de
 * comptes.
 */
export async function sendTableFriendRequests(
  userId: string,
  tablemates: TablemateRow[]
): Promise<TableFriendRequestsTally> {
  const tally: TableFriendRequestsTally = { requested: 0, accepted: 0, already: 0, skipped: 0 }
  if (tablemates.length === 0) return tally
  const ids = tablemates.map((t) => t.id)
  const [blocked, existing] = await Promise.all([
    listBlockedCounterpartIds(userId),
    friendshipsWith(userId, ids),
  ])
  // Déjà amis ou déjà sollicités : rien à écrire, inutile de repasser par
  // sendFriendRequest (deux lectures de plus par membre).
  const addable = new Set(addableTablemateIds(userId, ids, existing))

  for (const mate of tablemates) {
    if (!addable.has(mate.id)) {
      tally.already += 1
      continue
    }
    // Ban lu sur la ligne déjà chargée : un ban temporaire échu ne compte
    // plus (getBanState compare l'échéance), sans écriture ni relecture.
    if (getBanState(mate).banned || blocked.has(mate.id)) {
      tally.skipped += 1
      continue
    }
    const result = await sendFriendRequest(userId, mate.id)
    if (result.status === 'sent') tally.requested += 1
    else if (result.status === 'auto-accepted') tally.accepted += 1
    else if (result.status === 'declined-cooldown') tally.skipped += 1
    else tally.already += 1
  }
  return tally
}
