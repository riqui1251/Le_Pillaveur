import { NextResponse } from 'next/server'
import { canManageUsers } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { dismissNameModerationWarning } from '@/lib/name-moderation-attempts-server'
import { logAccountEvent } from '@/lib/ban-server'
import { adminErrorResponse, requireRole } from '../../../_guard'

/** Le staff acquitte l'alerte pseudos suspects d'un compte (file « à traiter »). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const actor = await requireRole(canManageUsers)

    const { userId } = await params
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!target) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }

    await dismissNameModerationWarning(userId)
    await logAccountEvent({ userId, actorId: actor.id, action: 'name-flag-ack' })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminErrorResponse(error, 'ack-name-flag POST')
  }
}
