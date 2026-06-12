import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, type PlayMode } from '@/lib/auth-server'

export async function PUT(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const body = await request.json()
  const mode = body.mode as PlayMode
  if (mode !== 'local' && mode !== 'online') {
    return NextResponse.json({ error: 'Mode invalide' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { playMode: mode },
  })

  return NextResponse.json({
    playMode: updated.playMode,
  })
}
