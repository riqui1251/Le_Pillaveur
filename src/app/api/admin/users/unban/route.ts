import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { canOverrideAccountBan, removeBan } from '@/lib/ban-server'
import { canBanUsers, canTemporaryBanTarget, normalizeRole } from '@/lib/roles'
import { adminErrorResponse, requireRole, readAdminBody } from '../../_guard'
import { prisma } from '@/lib/prisma'

export const POST = withApiRoute('admin/users/unban POST', async (request: Request) => {
  try {
    const actor = await requireRole(canBanUsers)

    const read = await readAdminBody(request)
    if (!read.ok) return read.response
    const body = read.body
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        banType: true,
        bannedUntil: true,
        banComment: true,
        bannedAt: true,
        bannedById: true,
      },
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

    if (!(await canOverrideAccountBan(actor.role, target))) {
      return apiError('sanction_outranked', 403)
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
})
