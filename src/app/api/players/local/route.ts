import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import type { Player } from '@/lib/players'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { localPlayersJson: true, updatedAt: true },
  })

  let players: Player[] = []
  if (dbUser?.localPlayersJson) {
    try {
      const parsed = JSON.parse(dbUser.localPlayersJson)
      if (Array.isArray(parsed)) players = parsed
    } catch {}
  }

  return NextResponse.json({
    players,
    updatedAt: dbUser?.updatedAt?.toISOString() ?? null,
  })
}

export async function PUT(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const body = await request.json()
  if (!Array.isArray(body.players)) {
    return NextResponse.json({ error: 'Format invalide' }, { status: 400 })
  }

  const json = JSON.stringify(body.players)
  if (json.length > 500_000) {
    return NextResponse.json({ error: 'Données trop volumineuses' }, { status: 413 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { localPlayersJson: json },
    select: { updatedAt: true },
  })

  return NextResponse.json({
    ok: true,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
