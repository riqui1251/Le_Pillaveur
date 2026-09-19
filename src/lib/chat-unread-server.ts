import { prisma } from '@/lib/prisma'
import { listBlockedCounterpartIds } from '@/lib/moderation/blocks'

/** Non-lus par canal, tels que les affichent le badge de la barre et le panneau de chat. */
export type ChatUnreadCounts = {
  total: number
  room: number
  /** userId de l'ami → messages non lus dans sa conversation. Jamais de pseudo. */
  friends: Record<string, number>
}

/**
 * Compteur de messages non lus par canal : messages des autres postés après
 * mon dernier `ChatRead` (jamais lu = tout compte). Canaux surveillés : la
 * salle en cours + une conversation par ami accepté.
 *
 * Les joueurs bloqués sont exclus du décompte — un badge rouge pour quelqu'un
 * qu'on a coupé serait exactement ce qu'on cherchait à éviter.
 *
 * Sorti de /api/chat/unread pour que /api/me/nav (tout ce que la barre
 * affiche, en une requête) fasse EXACTEMENT le même calcul : un badge qui
 * dirait autre chose que le panneau serait pire qu'aucun badge.
 */
export async function countChatUnread(userId: string): Promise<ChatUnreadCounts> {
  const [membership, friendships, blockedIds] = await Promise.all([
    prisma.onlineRoomMember.findFirst({ where: { userId }, select: { roomId: true } }),
    prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    }),
    listBlockedCounterpartIds(userId),
  ])

  const channels: { channel: string; friendUserId: string | null }[] = []
  if (membership) channels.push({ channel: `room:${membership.roomId}`, friendUserId: null })
  for (const f of friendships) {
    const other = f.requesterId === userId ? f.addresseeId : f.requesterId
    if (blockedIds.has(other)) continue
    const [a, b] = [userId, other].sort()
    channels.push({ channel: `friend:${a}:${b}`, friendUserId: other })
  }

  if (channels.length === 0) return { total: 0, room: 0, friends: {} }

  const reads = await prisma.chatRead.findMany({
    where: { userId, channel: { in: channels.map((c) => c.channel) } },
    select: { channel: true, lastReadAt: true },
  })
  const lastReadByChannel = new Map(reads.map((r) => [r.channel, r.lastReadAt]))

  // Soi-même et les joueurs bloqués sont hors décompte (chat de salle inclus).
  const ignoredSenderIds = [userId, ...blockedIds]
  const counts = await Promise.all(
    channels.map(({ channel }) =>
      prisma.chatMessage.count({
        where: {
          channel,
          senderId: { notIn: ignoredSenderIds },
          createdAt: { gt: lastReadByChannel.get(channel) ?? new Date(0) },
        },
      })
    )
  )

  let room = 0
  const friends: Record<string, number> = {}
  channels.forEach(({ friendUserId }, i) => {
    if (counts[i] === 0) return
    if (friendUserId) friends[friendUserId] = counts[i]
    else room = counts[i]
  })
  const total = room + Object.values(friends).reduce((s, n) => s + n, 0)

  return { total, room, friends }
}
