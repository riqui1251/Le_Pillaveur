import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { resolveChatChannel } from '@/lib/moderation/chat-access'
import {
  createAbuseReport,
  isReportReason,
  type ReportTargetType,
} from '@/lib/moderation/reports'
import {
  checkRateLimit,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

/**
 * Signalement d'un message ou d'un joueur.
 *
 * Le signalant doit avoir accès au canal concerné (mêmes droits qu'une
 * lecture) : c'est ce qui empêche d'utiliser cette route pour faire remonter
 * au staff des bouts de conversations auxquelles on n'a pas droit. Le dossier
 * embarque ensuite un extrait FIGÉ du canal — la modération instruit là-dessus.
 */

const MAX_COMMENT_LENGTH = 500
const MAX_BODY_BYTES = 4 * 1024

/** 5 signalements par tranche de 10 minutes : de quoi signaler une salle qui dérape, pas de quoi noyer la file. */
const REPORT_LIMIT = 5
const REPORT_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const rate = checkRateLimit(userRateLimitKey('report', user.id), REPORT_LIMIT, REPORT_WINDOW_MS)
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

  const parsed = await readJsonBodyLimited<Record<string, unknown>>(request, MAX_BODY_BYTES)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Signalement invalide' },
      { status: parsed.reason === 'too_large' ? 413 : 400 }
    )
  }
  const payload = parsed.body

  const scope = typeof payload.scope === 'string' ? payload.scope : null
  const friendUserId = typeof payload.friendUserId === 'string' ? payload.friendUserId : null
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : null
  const reportedUserIdInput =
    typeof payload.reportedUserId === 'string' ? payload.reportedUserId : null
  const reason = typeof payload.reason === 'string' ? payload.reason : ''
  const comment = typeof payload.comment === 'string' ? payload.comment.slice(0, MAX_COMMENT_LENGTH) : null

  if (!isReportReason(reason)) {
    return NextResponse.json({ error: 'Motif invalide' }, { status: 400 })
  }

  // Le canal borne le droit d'accès ET fournit le contexte du dossier.
  const resolved = await resolveChatChannel(user, scope, friendUserId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }

  let reportedUserId: string
  let targetType: ReportTargetType

  if (messageId) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true, channel: true },
    })
    // Message d'un AUTRE canal : refusé sans indiquer s'il existe.
    if (!message || message.channel !== resolved.channel) {
      return NextResponse.json({ error: 'Message introuvable' }, { status: 404 })
    }
    reportedUserId = message.senderId
    targetType = 'message'
  } else if (reportedUserIdInput) {
    const inChannel = await isReachableInChannel(user.id, resolved.channel, reportedUserIdInput)
    if (!inChannel) {
      return NextResponse.json({ error: 'Joueur introuvable' }, { status: 404 })
    }
    reportedUserId = reportedUserIdInput
    targetType = 'player'
  } else {
    return NextResponse.json({ error: 'Signalement invalide' }, { status: 400 })
  }

  if (reportedUserId === user.id) {
    return NextResponse.json({ error: 'Impossible de se signaler soi-même' }, { status: 400 })
  }

  const result = await createAbuseReport({
    reporterId: user.id,
    reportedUserId,
    targetType,
    reason,
    channel: resolved.channel,
    messageId,
    comment,
  })

  if (result.status === 'already-reported') {
    return NextResponse.json({ status: 'already-reported' })
  }
  return NextResponse.json({ status: 'created', reportId: result.reportId })
}

/**
 * Le joueur visé est-il réellement en face du signalant ? On ne veut pas
 * qu'un compte puisse ouvrir un dossier contre n'importe quel identifiant
 * glané ailleurs sur le site.
 */
async function isReachableInChannel(
  userId: string,
  channel: string,
  targetUserId: string
): Promise<boolean> {
  if (channel.startsWith('friend:')) {
    return channel.split(':').includes(targetUserId) && targetUserId !== userId
  }
  const roomId = channel.slice(channel.indexOf(':') + 1)
  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
    select: { id: true },
  })
  return member !== null
}
