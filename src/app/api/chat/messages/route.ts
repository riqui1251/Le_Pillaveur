import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, type AuthUser } from '@/lib/auth-server'
import { areFriends } from '@/lib/friends'
import { parseOnlinePreferences } from '@/lib/online-preferences'
import { censorChatMessage } from '@/lib/chat-moderation'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { isFeatureBanned } from '@/lib/feature-bans'

/**
 * Chat léger par canal :
 * - `room:<roomId>`  — chat de la partie/lobby en cours (réservé aux membres) ;
 * - `friend:<idA>:<idB>` — conversation privée entre deux amis (ids triés).
 * Lecture par polling côté client (pattern établi), 50 derniers messages.
 */

const MAX_BODY_LENGTH = 500
const PAGE_SIZE = 50

type ChannelResolution =
  | { ok: true; channel: string }
  | { ok: false; error: string; status: number }

async function resolveChannel(
  user: AuthUser,
  scope: string | null,
  friendUserId: string | null
): Promise<ChannelResolution> {
  if (scope === 'room') {
    const membership = await prisma.onlineRoomMember.findFirst({
      where: { userId: user.id },
      select: { roomId: true },
    })
    if (!membership) return { ok: false, error: 'Aucune partie en cours', status: 404 }
    return { ok: true, channel: `room:${membership.roomId}` }
  }
  if (scope === 'friend' && friendUserId) {
    if (!(await areFriends(user.id, friendUserId))) {
      return { ok: false, error: "Vous n'êtes pas amis", status: 403 }
    }
    const [a, b] = [user.id, friendUserId].sort()
    return { ok: true, channel: `friend:${a}:${b}` }
  }
  return { ok: false, error: 'Canal invalide', status: 400 }
}

function toDto(
  message: {
    id: string
    senderId: string
    body: string
    createdAt: Date
    sender: { displayName: string; onlinePreferencesJson: string | null }
  },
  currentUserId: string
) {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.sender.displayName,
    senderIcon: parseOnlinePreferences(message.sender.onlinePreferencesJson).icon ?? null,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    self: message.senderId === currentUserId,
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const url = new URL(request.url)
  const resolved = await resolveChannel(user, url.searchParams.get('scope'), url.searchParams.get('friend'))
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, messages: [] }, { status: resolved.status })
  }

  const rows = await prisma.chatMessage.findMany({
    where: { channel: resolved.channel },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    include: { sender: { select: { displayName: true, onlinePreferencesJson: true } } },
  })

  // Consulter une conversation la marque comme lue (indicateur non-lu).
  await prisma.chatRead.upsert({
    where: { userId_channel: { userId: user.id, channel: resolved.channel } },
    create: { userId: user.id, channel: resolved.channel },
    update: { lastReadAt: new Date() },
  })

  return NextResponse.json(
    { messages: rows.reverse().map((m) => toDto(m, user.id)) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const payload = await request.json().catch(() => ({}))
  const scope = typeof payload.scope === 'string' ? payload.scope : null
  const friendUserId = typeof payload.friendUserId === 'string' ? payload.friendUserId : null
  const body = typeof payload.body === 'string' ? payload.body.trim() : ''

  if (!body || body.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: 'Message invalide' }, { status: 400 })
  }

  // Ban de chat écrit (modérateur) : lecture autorisée, envoi bloqué.
  if (await isFeatureBanned(user.id, 'chat')) {
    return NextResponse.json({ error: 'chat-banned' }, { status: 403 })
  }

  const resolved = await resolveChannel(user, scope, friendUserId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }

  // Filtre anti-insultes : les termes injurieux sont masqués (***), le
  // message est délivré censuré (termes de modération DB inclus).
  await ensureServerModerationTermsLoaded()
  const { text: cleanBody } = censorChatMessage(body)

  const created = await prisma.chatMessage.create({
    data: { channel: resolved.channel, senderId: user.id, body: cleanBody },
    include: { sender: { select: { displayName: true, onlinePreferencesJson: true } } },
  })

  return NextResponse.json({ message: toDto(created, user.id) })
}
