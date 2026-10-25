import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import { onlineErrorBody } from '@/lib/online-errors'
import { readApiJson, withApiRoute } from '@/lib/api-route'

type Params = { params: Promise<{ roomId: string }> }

/** Le corps attendu est `{ isReady: boolean }`. */
const MAX_READY_BODY_BYTES = 1024

export const PUT = withApiRoute('online/rooms/[roomId]/ready PUT', async (request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  // Appartenance AVANT le corps : n'importe quel compte pouvait faire lire et
  // parser un corps de plusieurs dizaines de mégaoctets avant son 403.
  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
    select: { userId: true },
  })
  if (!member) {
    return NextResponse.json(onlineErrorBody('not_a_member'), { status: 403 })
  }

  const parsed = await readApiJson<{ isReady?: unknown } | null>(request, MAX_READY_BODY_BYTES)
  if (!parsed.ok) return parsed.response
  const isReady = Boolean(parsed.body?.isReady)

  const updated = await prisma.onlineRoomMember.updateMany({
    where: { roomId, userId: user.id },
    data: { isReady, lastSeenAt: new Date() },
  })

  if (updated.count === 0) {
    return NextResponse.json(onlineErrorBody('not_a_member'), { status: 403 })
  }

  // `lobbies[].members[].isReady` est affiché au guichet : bon marché, et
  // évite jusqu'à 3 s de retard sur la coche.
  invalidateLobbiesCache()
  publishRoomChanged(roomId, { type: 'lobby' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
})
