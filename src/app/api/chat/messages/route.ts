import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { parseOnlinePreferences } from '@/lib/online-preferences'
import { censorChatMessage } from '@/lib/chat-moderation'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { isFeatureBanned } from '@/lib/feature-bans'
import { resolveChatChannel } from '@/lib/moderation/chat-access'
import { listBlockedCounterpartIds } from '@/lib/moderation/blocks'
import { parseChatCursor } from '@/lib/chat-delta'
import {
  checkRateLimit,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

/**
 * Chat léger par canal — les droits d'accès vivent dans `resolveChatChannel`
 * (partagé avec le signalement, pour que les deux ne puissent pas diverger).
 * Lecture par polling côté client (pattern établi) : les 50 derniers messages
 * à l'ouverture, puis seulement le delta derrière le curseur `after`/`afterAt`
 * du dernier message connu (voir src/lib/chat-delta.ts).
 */

const MAX_BODY_LENGTH = 500
const PAGE_SIZE = 50
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }

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

/**
 * Recouvrement du curseur, en temps SERVEUR. `createdAt` est posé par Prisma à
 * la construction de l'INSERT (`@default(now())`), AVANT l'attente du verrou
 * d'écriture SQLite : avec plusieurs connexions, deux envois quasi simultanés
 * peuvent commiter dans l'ordre inverse de leurs horodatages. Un sondage qui
 * tombe entre les deux commits fixe le curseur au plus récent, et le plus
 * ancien (createdAt inférieur, commité après) ne serait plus jamais rapatrié
 * tant que le panneau n'est pas remonté. D'où : tout ce qui a été créé dans
 * les dernières secondes est renvoyé QUOI QU'EN DISE le curseur ; le client
 * dédoublonne par id et ne rend rien si rien n'est nouveau (chat-delta.ts).
 * Au repos (rien dans la fenêtre), la réponse reste vide. Trois sondages de
 * 3 s, plus une marge pour un commit qui attend son verrou.
 */
const CHAT_CURSOR_OVERLAP_MS = 10_000

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

  // Curseur du client : ne rapatrier que ce qu'il n'a pas encore. Sans curseur
  // (ouverture de la conversation), les 50 derniers, comme avant.
  const cursor = parseChatCursor(url.searchParams.get('after'), url.searchParams.get('afterAt'))

  const rows = await prisma.chatMessage.findMany({
    where: cursor
      ? {
          channel: resolved.channel,
          // Strictement plus récent que (createdAt, id), OU créé dans la
          // fenêtre de recouvrement (CHAT_CURSOR_OVERLAP_MS). Les trois
          // branches s'appuient sur l'index [channel, createdAt] ; l'id ne
          // départage qu'une égalité à la milliseconde (cuid, non ordonné).
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            { createdAt: { gte: new Date(Date.now() - CHAT_CURSOR_OVERLAP_MS) } },
          ],
        }
      : { channel: resolved.channel },
    // Tri sur createdAt seul : l'index se parcourt à rebours et s'arrête à
    // PAGE_SIZE. Le client re-trie par (createdAt, id) de toute façon.
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    include: { sender: { select: { displayName: true, onlinePreferencesJson: true } } },
  })

  // Rien de neuf — le cas de loin le plus courant d'un sondage : ni blocages
  // à consulter, ni marquage « lu », une réponse vide.
  if (rows.length === 0) {
    return NextResponse.json({ messages: [] }, NO_STORE)
  }

  // Un joueur bloqué reste dans la salle, mais ses messages ne s'affichent plus
  // chez celui qui l'a bloqué (le blocage vaut aussi dans le chat de partie).
  const blockedIds = await listBlockedCounterpartIds(user.id)
  const visible = rows.filter((m) => !blockedIds.has(m.senderId))

  await markChannelRead(user.id, resolved.channel, visible)

  return NextResponse.json({ messages: visible.reverse().map((m) => toDto(m, user.id)) }, NO_STORE)
}

/**
 * Marquage « lu » ÉCONOME : consulter une conversation n'écrit que si l'état
 * change réellement. Sans ce garde-fou, chaque relève (toutes les 3 s et par
 * joueur) déclenchait une écriture, alors qu'un simple SELECT suffit à
 * constater qu'il n'y a rien de neuf à marquer. En delta, `rows` ne contient
 * que les messages nouveaux pour ce client (ou les 50 derniers à
 * l'ouverture) : rien des autres dedans → pas même le SELECT.
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
