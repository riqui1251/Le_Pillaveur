import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { isUserCurrentlyBanned } from '@/lib/ban-server'
import { areFriends } from '@/lib/friends'
import { publishRoomChanged } from '@/lib/online/room-bus'

type Params = { params: Promise<{ roomId: string }> }

/** L'hôte invite un ami dans une salle privée/invitation (sens pour public : autoriser l'accès sans invite). */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json({ error: 'Lobby introuvable' }, { status: 404 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json({ error: 'La partie est déjà lancée' }, { status: 409 })
  }
  if (room.hostUserId !== user.id) {
    return NextResponse.json({ error: 'Seul le créateur peut inviter' }, { status: 403 })
  }
  if (room.visibility === 'public') {
    return NextResponse.json({ error: 'Ce lobby est déjà public, aucune invitation nécessaire' }, { status: 400 })
  }

  const body = await request.json()
  const friendUserId = typeof body.friendUserId === 'string' ? body.friendUserId.trim() : ''
  if (!friendUserId) {
    return NextResponse.json({ error: 'Ami requis' }, { status: 400 })
  }

  if (!(await areFriends(user.id, friendUserId))) {
    return NextResponse.json({ error: "Vous n'êtes pas ami avec ce joueur" }, { status: 403 })
  }
  if (await isUserCurrentlyBanned(friendUserId)) {
    return NextResponse.json({ error: 'Ce joueur ne peut pas être invité' }, { status: 403 })
  }

  const alreadyMember = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: friendUserId } },
  })
  if (alreadyMember) {
    return NextResponse.json({ error: 'Cet ami est déjà dans la salle' }, { status: 400 })
  }

  const invite = await prisma.onlineRoomInvite.upsert({
    where: { roomId_invitedUserId: { roomId: room.id, invitedUserId: friendUserId } },
    create: { roomId: room.id, invitedUserId: friendUserId, invitedById: user.id, status: 'pending' },
    update: { status: 'pending', invitedById: user.id, respondedAt: null },
  })

  publishRoomChanged(room.id, { type: 'lobby' })

  return NextResponse.json({ invite: { id: invite.id, invitedUserId: invite.invitedUserId, status: invite.status } })
}
