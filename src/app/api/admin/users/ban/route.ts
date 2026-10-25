import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { applyBan, canOverrideAccountBan, type BanType } from '@/lib/ban-server'
import {
  canBanUsers,
  canPermanentBanTarget,
  canTemporaryBanTarget,
  normalizeRole,
} from '@/lib/roles'
import { adminErrorResponse, requireRole } from '../../_guard'
import { prisma } from '@/lib/prisma'

export const POST = withApiRoute('admin/users/ban POST', async (request: Request) => {
  try {
    const actor = await requireRole(canBanUsers)
    const body = await request.json()
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const type = body.type === 'permanent' || body.type === 'temporary' ? body.type : null
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
    const durationDays =
      typeof body.durationDays === 'number' && body.durationDays > 0
        ? Math.min(body.durationDays, 365)
        : 7

    if (!userId || !type) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }

    if (type === 'temporary' && typeof body.durationDays === 'number' && !Number.isInteger(body.durationDays)) {
      return apiError('invalid_duration', 400)
    }

    if (userId === actor.id) {
      return NextResponse.json({ error: 'Tu ne peux pas te bannir toi-même' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        displayName: true,
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

    const actorRole = normalizeRole(actor.role)
    const targetRole = normalizeRole(target.role)

    if (type === 'permanent') {
      if (!canPermanentBanTarget(actorRole, targetRole)) {
        return NextResponse.json(
          {
            error:
              actorRole === 'moderator'
                ? 'Les modérateurs ne peuvent appliquer que des bannissements temporaires'
                : 'Tu ne peux pas bannir définitivement ce compte',
          },
          { status: 403 }
        )
      }
    } else if (!canTemporaryBanTarget(actorRole, targetRole)) {
      return NextResponse.json(
        { error: 'Tu ne peux pas bannir un compte de grade égal ou supérieur' },
        { status: 403 }
      )
    }

    // Un nouveau ban REMPLACE celui en place : le raccourcir revenait à le lever.
    if (!(await canOverrideAccountBan(actorRole, target))) {
      return apiError('sanction_outranked', 403)
    }

    await applyBan({
      userId,
      actorId: actor.id,
      type: type as BanType,
      comment: comment || undefined,
      durationDays: type === 'temporary' ? durationDays : undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminErrorResponse(error, 'ban POST')
  }
})
