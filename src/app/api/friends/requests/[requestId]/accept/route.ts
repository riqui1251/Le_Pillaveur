import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { awardAchievement } from '@/lib/online/achievements'

type Params = { params: Promise<{ requestId: string }> }

export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { requestId } = await params
  const friendship = await prisma.friendship.findUnique({ where: { id: requestId } })
  if (!friendship) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  }
  if (friendship.addresseeId !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  if (friendship.status !== 'pending') {
    return NextResponse.json({ error: 'Cette demande a déjà été traitée' }, { status: 409 })
  }

  const updated = await prisma.friendship.update({
    where: { id: requestId },
    data: { status: 'accepted', respondedAt: new Date() },
  })

  // Succès « Premier Pote » pour les deux joueurs — jamais bloquant.
  await awardAchievement(prisma, friendship.requesterId, 'first_friend')
  await awardAchievement(prisma, friendship.addresseeId, 'first_friend')

  return NextResponse.json({ friendship: updated })
}
