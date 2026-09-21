import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { isUserCurrentlyBanned } from '@/lib/ban-server'
import { areFriends } from '@/lib/friends'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody } from '@/lib/online-errors'
import {
  checkRateLimit,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Inviter écrit une ligne d'invitation qui va sonner chez un ami : c'est le
 * geste le plus spammable du lobby, et rien ne le bornait. Vingt par minute
 * couvrent largement une tablée qu'on rameute une par une.
 * Quota par COMPTE et jamais par IP : une tablée partage le Wi-Fi du salon, et
 * un opérateur mobile met des centaines d'abonnés derrière une même IPv4.
 */
const INVITE_LIMIT = 20
const INVITE_WINDOW_MS = 60_000

/** Un identifiant d'ami : 8 Ko est déjà très large. */
const MAX_INVITE_BODY_BYTES = 8 * 1024

/** L'hôte invite un ami dans une salle privée/invitation (sens pour public : autoriser l'accès sans invite). */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const rate = checkRateLimit(
    userRateLimitKey('room-invite', user.id),
    INVITE_LIMIT,
    INVITE_WINDOW_MS
  )
  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec)
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
  }
  if (room.hostUserId !== user.id) {
    return NextResponse.json(onlineErrorBody('host_only_invite'), { status: 403 })
  }
  if (room.visibility === 'public') {
    return NextResponse.json(onlineErrorBody('room_already_public'), { status: 400 })
  }

  // Refus de corps trop gros : `payload_too_large`, le code générique que
  // withApiRoute/readApiJson posent déjà partout ailleurs (il est traduit dans
  // les 4 langues). Surtout pas `signal_too_large`, réservé au vocal WebRTC :
  // parler de « signal » à qui crée une table n'a aucun sens.
  const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(
    request,
    MAX_INVITE_BODY_BYTES
  )
  if (!parsed.ok) {
    return parsed.reason === 'too_large'
      ? NextResponse.json(onlineErrorBody('payload_too_large'), { status: 413 })
      : NextResponse.json(onlineErrorBody('invalid_json'), { status: 400 })
  }
  // `?? {}` : un corps JSON `null` est valide et ferait planter les lectures.
  const body = parsed.body ?? {}

  const friendUserId = typeof body.friendUserId === 'string' ? body.friendUserId.trim() : ''
  if (!friendUserId) {
    return NextResponse.json(onlineErrorBody('friend_required'), { status: 400 })
  }

  if (!(await areFriends(user.id, friendUserId))) {
    return NextResponse.json(onlineErrorBody('not_friends'), { status: 403 })
  }
  if (await isUserCurrentlyBanned(friendUserId)) {
    return NextResponse.json(onlineErrorBody('cannot_invite_player'), { status: 403 })
  }

  const alreadyMember = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: friendUserId } },
  })
  if (alreadyMember) {
    return NextResponse.json(onlineErrorBody('already_in_room'), { status: 400 })
  }

  const invite = await prisma.onlineRoomInvite.upsert({
    where: { roomId_invitedUserId: { roomId: room.id, invitedUserId: friendUserId } },
    create: { roomId: room.id, invitedUserId: friendUserId, invitedById: user.id, status: 'pending' },
    update: { status: 'pending', invitedById: user.id, respondedAt: null },
  })

  publishRoomChanged(room.id, { type: 'lobby' })

  return NextResponse.json({ invite: { id: invite.id, invitedUserId: invite.invitedUserId, status: invite.status } })
}
