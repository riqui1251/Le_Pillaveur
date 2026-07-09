import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'

export async function PUT(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const mode = body.mode
  if (mode !== 'alcool' && mode !== 'soft') {
    return NextResponse.json({ error: 'Mode invalide' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { ambianceMode: mode },
    select: { ambianceMode: true },
  })

  return NextResponse.json({ ambianceMode: updated.ambianceMode })
}
