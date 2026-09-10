import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { parseOnlinePreferences } from '@/lib/online-preferences'
import { censorChatMessage } from '@/lib/chat-moderation'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { isFeatureBanned } from '@/lib/feature-bans'
import { resolveChatChannel } from '@/lib/moderation/chat-access'
import { listBlockedCounterpartIds } from '@/lib/moderation/blocks'
import {
  checkRateLimit,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

/**
 * Chat léger par canal — les droits d'accès vivent dans `resolveChatChannel`
 * (partagé avec le signalement, pour que les deux ne puissent pas diverger).
 * Lecture par polling côté client (pattern établi), 50 derniers messages.
 */

const MAX_BODY_LENGTH = 500
const PAGE_SIZE = 50

/**
 * Anti-flood : 10 envois par tranche de 10 s et par compte. Large pour une
 * conversation normale (le client n'a pas de saisie automatique), assez serré
 * pour qu'un script ne remplisse pas ChatMessage. Le corps est plafonné bien
 * au-delà de MAX_BODY_LENGTH pour laisser passer les émojis multi-octets.
 */
const CHAT_LIMIT = 10
const CHAT_WINDOW_MS = 10 * 1000
const MAX_CHAT_BODY_BYTES = 8 * 1024

/**
 * La lecture a son propre plafond, dans la même fenêtre que l'envoi. Le client
 * poll une conversation toutes les 3 s (≈ 4 requêtes / 10 s), plus un refetch
 * après chaque envoi : 30 laisse tourner plusieurs onglets ouverts en parallèle
 * tout en coupant un script qui martèlerait la route.
 */
const CHAT_READ_LIMIT = 30

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

  const rate = checkRateLimit(
    userRateLimitKey('chat-read', user.id),
    CHAT_READ_LIMIT,
    CHAT_WINDOW_MS
  )
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

  const url = new URL(request.url)
  const resolved = await resolveChatChannel(
    user,
    url.searchParams.get('scope'),
    url.searchParams.get('friend')
  )
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, messages: [] }, { status: resolved.status })
  }

  const [rows, blockedIds] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { channel: resolved.channel },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: { sender: { select: { displayName: true, onlinePreferencesJson: true } } },
    }),
    listBlockedCounterpartIds(user.id),
  ])

  // Un joueur bloqué reste dans la salle, mais ses messages ne s'affichent plus
  // chez celui qui l'a bloqué (le blocage vaut aussi dans le chat de partie).
  const visible = rows.filter((m) => !blockedIds.has(m.senderId))

  await markChannelRead(user.id, resolved.channel, visible)

  return NextResponse.json(
    { messages: visible.reverse().map((m) => toDto(m, user.id)) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

/**
 * Marquage « lu » ÉCONOME : consulter une conversation n'écrit que si l'état
 * change réellement. Sans ce garde-fou, chaque relève (toutes les 3 s et par
 * joueur) déclenchait une écriture, alors qu'un simple SELECT suffit à
 * constater qu'il n'y a rien de neuf à marquer.
 */
async function markChannelRead(
  userId: string,
  channel: string,
  rows: { senderId: string; createdAt: Date }[]
): Promise<void> {
  const latestOther = rows
    .filter((m) => m.senderId !== userId)
    .reduce<Date | null>((max, m) => (!max || m.createdAt > max ? m.createdAt : max), null)

  // Rien reçu des autres sur ce canal : le compteur de non-lus est déjà à zéro.
  if (!latestOther) return

  const existing = await prisma.chatRead.findUnique({
    where: { userId_channel: { userId, channel } },
    select: { lastReadAt: true },
  })
  if (existing && existing.lastReadAt >= latestOther) return

  await prisma.chatRead.upsert({
    where: { userId_channel: { userId, channel } },
    create: { userId, channel },
    update: { lastReadAt: new Date() },
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const rate = checkRateLimit(userRateLimitKey('chat', user.id), CHAT_LIMIT, CHAT_WINDOW_MS)
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

  const parsed = await readJsonBodyLimited<Record<string, unknown>>(request, MAX_CHAT_BODY_BYTES)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Message invalide' },
      { status: parsed.reason === 'too_large' ? 413 : 400 }
    )
  }
  const payload = parsed.body
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

  const resolved = await resolveChatChannel(user, scope, friendUserId)
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
