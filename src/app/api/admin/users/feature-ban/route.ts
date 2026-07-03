import { NextResponse } from 'next/server'
import { requireSupervisionUser } from '@/lib/auth-server'
import { canBanFeatureTarget, normalizeRole } from '@/lib/roles'
import { applyFeatureBan, liftFeatureBan, isBannableFeature } from '@/lib/feature-bans'
import { prisma } from '@/lib/prisma'

/**
 * Bannir / débannir un joueur d'une fonctionnalité (vocal ou chat écrit) —
 * indépendant du ban de compte. Modérateur et grades supérieurs, uniquement
 * sur un grade strictement inférieur (même règle que les bans de compte).
 *
 * Body : { userId, feature: 'voice'|'chat', action: 'ban'|'unban',
 *          durationDays?, comment? }.  durationDays absent = permanent.
 */
export async function POST(request: Request) {
  try {
    const actor = await requireSupervisionUser()
    const body = await request.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const feature = typeof body.feature === 'string' ? body.feature : ''
    const action = body.action === 'unban' ? 'unban' : 'ban'
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
    const durationDays =
      typeof body.durationDays === 'number' && body.durationDays > 0
        ? body.durationDays
        : undefined

    if (!userId || !isBannableFeature(feature)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }
    if (userId === actor.id) {
      return NextResponse.json({ error: 'Tu ne peux pas te sanctionner toi-même' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }
    if (!canBanFeatureTarget(normalizeRole(actor.role), normalizeRole(target.role))) {
      return NextResponse.json(
        { error: 'Seul un grade supérieur peut sanctionner ce joueur' },
        { status: 403 }
      )
    }

    if (action === 'unban') {
      await liftFeatureBan(userId, feature)
    } else {
      await applyFeatureBan({ userId, actorId: actor.id, feature, comment, durationDays })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('feature-ban POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
