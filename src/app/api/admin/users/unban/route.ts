import { NextResponse } from 'next/server'
import { removeBan } from '@/lib/ban-server'
import { canBanUsers, canTemporaryBanTarget, normalizeRole } from '@/lib/roles'
import { adminErrorResponse, requireRole } from '../../_guard'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const actor = await requireRole(canBanUsers)

    const body = await request.json()
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { banType: true, role: true },
    })

    if (!target) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }

    if (!canTemporaryBanTarget(normalizeRole(actor.role), normalizeRole(target.role))) {
      return NextResponse.json(
        { error: 'Seul un grade supérieur peut lever la sanction d\'un pair ou d\'un supérieur' },
        { status: 403 }
      )
    }

    if (!target.banType) {
      return NextResponse.json({ error: 'Ce compte n\'est pas banni' }, { status: 400 })
    }

    await removeBan({
      userId,
      actorId: actor.id,
      comment: comment || undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminErrorResponse(error, 'unban POST')
  }
}
