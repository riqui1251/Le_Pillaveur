import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string }> }

export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const body = await request.json()
  const isReady = Boolean(body.isReady)

  const updated = await prisma.onlineRoomMember.updateMany({
    where: { roomId, userId: user.id },
    data: { isReady, lastSeenAt: new Date() },
  })

  if (updated.count === 0) {
    return NextResponse.json(onlineErrorBody('not_a_member'), { status: 403 })
  }

  publishRoomChanged(roomId, { type: 'lobby' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
