import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour rejoindre un lobby' }, { status: 401 })
  }

  const body = await request.json()
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''

  let room = null
  if (roomId) {
    room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  } else if (code.length === 6) {
    room = await prisma.onlineRoom.findUnique({ where: { code } })
  } else {
    return NextResponse.json({ error: 'Code ou identifiant de lobby requis' }, { status: 400 })
  }

  if (!room) {
    return NextResponse.json({ error: 'Lobby introuvable' }, { status: 404 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json({ error: 'Ce lobby a déjà démarré' }, { status: 409 })
  }

  await prisma.onlineRoomMember.deleteMany({ where: { userId: user.id } })

  await prisma.onlineRoomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
    create: { roomId: room.id, userId: user.id, isReady: false },
    update: { lastSeenAt: new Date(), isReady: false },
  })

  const dto = await buildRoomDto(room.id, user.id)
  return NextResponse.json({ room: dto })
}
