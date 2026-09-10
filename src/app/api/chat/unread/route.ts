import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { listBlockedCounterpartIds } from '@/lib/moderation/blocks'

/**
 * Compteur de messages non lus par canal : messages des autres postés après
 * mon dernier `ChatRead` (jamais lu = tout compte). Canaux surveillés : la
 * salle en cours + une conversation par ami accepté.
 *
 * Les joueurs bloqués sont exclus du décompte — un badge rouge pour quelqu'un
 * qu'on a coupé serait exactement ce qu'on cherchait à éviter.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const [membership, friendships, blockedIds] = await Promise.all([
    prisma.onlineRoomMember.findFirst({ where: { userId: user.id }, select: { roomId: true } }),
    prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
      select: { requesterId: true, addresseeId: true },
    }),
    listBlockedCounterpartIds(user.id),
  ])

  const channels: { channel: string; friendUserId: string | null }[] = []
  if (membership) channels.push({ channel: `room:${membership.roomId}`, friendUserId: null })
  for (const f of friendships) {
    const other = f.requesterId === user.id ? f.addresseeId : f.requesterId
    if (blockedIds.has(other)) continue
    const [a, b] = [user.id, other].sort()
    channels.push({ channel: `friend:${a}:${b}`, friendUserId: other })
  }

  if (channels.length === 0) {
    return NextResponse.json(
      { total: 0, room: 0, friends: {} },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const reads = await prisma.chatRead.findMany({
    where: { userId: user.id, channel: { in: channels.map((c) => c.channel) } },
    select: { channel: true, lastReadAt: true },
  })
  const lastReadByChannel = new Map(reads.map((r) => [r.channel, r.lastReadAt]))

  // Soi-même et les joueurs bloqués sont hors décompte (chat de salle inclus).
  const ignoredSenderIds = [user.id, ...blockedIds]
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

  return NextResponse.json({ total, room, friends }, { headers: { 'Cache-Control': 'no-store' } })
}
