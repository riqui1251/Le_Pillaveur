import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { blockUser, listBlockedUsers } from '@/lib/moderation/blocks'

/** Joueurs bloqués par l'utilisateur courant. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const blocked = await listBlockedUsers(user.id)
  return NextResponse.json({ blocked }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Bloque un joueur : plus de demande d'ami, plus de message privé, et la
 * relation existante (amitié ou demande en attente) est coupée.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const targetUserId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!targetUserId) {
    return NextResponse.json({ error: 'Joueur requis' }, { status: 400 })
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Impossible de se bloquer soi-même' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } })
  if (!target) {
    return NextResponse.json({ error: 'Joueur introuvable' }, { status: 404 })
  }

  await blockUser(user.id, target.id)
  return NextResponse.json({ ok: true })
}
