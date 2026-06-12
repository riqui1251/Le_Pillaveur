import { NextResponse } from 'next/server'
import { requireSupervisionUser } from '@/lib/auth-server'
import { applyBan, type BanType } from '@/lib/ban-server'
import {
  canPermanentBanTarget,
  canTemporaryBanTarget,
  normalizeRole,
} from '@/lib/roles'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const actor = await requireSupervisionUser()
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

    if (userId === actor.id) {
      return NextResponse.json({ error: 'Tu ne peux pas te bannir toi-même' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, displayName: true },
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

    await applyBan({
      userId,
      actorId: actor.id,
      type: type as BanType,
      comment: comment || undefined,
      durationDays: type === 'temporary' ? durationDays : undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin ban error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
