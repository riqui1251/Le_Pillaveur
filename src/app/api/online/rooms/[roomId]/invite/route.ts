import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { isUserCurrentlyBanned } from '@/lib/ban-server'
import { areFriends } from '@/lib/friends'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string }> }

/** L'hôte invite un ami dans une salle privée/invitation (sens pour public : autoriser l'accès sans invite). */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
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

  const body = await request.json()
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
