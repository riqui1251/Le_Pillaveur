import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { onlineErrorBody } from '@/lib/online-errors'
import { checkRateLimit, rateLimitResponse, userRateLimitKey } from '@/lib/rate-limit'

type Params = { params: Promise<{ inviteId: string }> }

/**
 * Même plafond que l'envoi d'invitations : une lecture plus une écriture par
 * appel, et refuser ses invitations reste un geste humain (quelques-unes par
 * soirée). Quota par COMPTE et jamais par IP : une tablée partage le Wi-Fi du
 * salon, et un opérateur mobile met des centaines d'abonnés derrière une même
 * IPv4. Aucun corps à lire ici, donc rien à plafonner de ce côté.
 */
const DECLINE_LIMIT = 20
const DECLINE_WINDOW_MS = 60_000

/** L'ami invité ignore l'invitation sans rejoindre la salle. */
export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const rate = checkRateLimit(
    userRateLimitKey('room-invite-decline', user.id),
    DECLINE_LIMIT,
    DECLINE_WINDOW_MS
  )
  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec)
  }

  const { inviteId } = await params
  const invite = await prisma.onlineRoomInvite.findUnique({ where: { id: inviteId } })
  if (!invite) {
    return NextResponse.json(onlineErrorBody('invite_not_found'), { status: 404 })
  }
  if (invite.invitedUserId !== user.id) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }

  await prisma.onlineRoomInvite.update({
    where: { id: inviteId },
    data: { status: 'declined', respondedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
