import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'

/** Salle active de l'utilisateur connecté */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const membership = await prisma.onlineRoomMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: 'desc' },
  })

  if (!membership) {
    return NextResponse.json({ room: null })
  }

  const dto = await buildRoomDto(membership.roomId, user.id)
  return NextResponse.json({ room: dto })
}
