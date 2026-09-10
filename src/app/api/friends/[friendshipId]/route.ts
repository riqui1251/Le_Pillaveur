import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'

type Params = { params: Promise<{ friendshipId: string }> }

/** Supprime une relation (ami retiré, ou demande en attente annulée/refusée). */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { friendshipId } = await params
  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } })
  if (!friendship) {
    return NextResponse.json({ ok: true })
  }
  if (friendship.requesterId !== user.id && friendship.addresseeId !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  // Un REFUS ne s'efface pas : c'est lui qui porte le délai de latence avant
  // une nouvelle demande. Sans cette garde, l'éconduit supprimait la ligne et
  // pouvait redemander dans la foulée — le blocage a la même exigence.
  // Celui qui a refusé, lui, peut effacer : c'est sa décision, pas sa punition.
  if (friendship.status === 'declined' && friendship.addresseeId !== user.id) {
    return NextResponse.json({ error: 'Demande déjà refusée' }, { status: 409 })
  }

  await prisma.friendship.delete({ where: { id: friendshipId } })
  return NextResponse.json({ ok: true })
}
