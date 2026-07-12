import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { canManageUsers } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { dismissNameModerationWarning } from '@/lib/name-moderation-attempts-server'
import { logAccountEvent } from '@/lib/ban-server'

/** Le staff acquitte l'alerte pseudos suspects d'un compte (file « à traiter »). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const actor = await getCurrentUser()
    if (!actor || !canManageUsers(actor.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { userId } = await params
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!target) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }

    await dismissNameModerationWarning(userId)
    await logAccountEvent({ userId, actorId: actor.id, action: 'name-flag-ack' })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('admin ack-name-flag error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
