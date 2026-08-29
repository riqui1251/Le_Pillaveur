import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { processRematchVote } from '@/lib/online-room-launch'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody, resolveOnlineErrorCode } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string }> }

/** Vote « Rejouer » — relance automatique si tous les membres ont voté */
export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }

  const isMember = room.members.some((m) => m.userId === user.id)
  if (!isMember) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }

  try {
    await processRematchVote(roomId, room, user.id)
  } catch (e) {
    const code = resolveOnlineErrorCode(e instanceof Error ? e.message : null) ?? 'action_failed'
    return NextResponse.json(onlineErrorBody(code), { status: 400 })
  }

  publishRoomChanged(roomId, { type: 'changed' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
