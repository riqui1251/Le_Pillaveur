import { NextResponse } from 'next/server'
import { requireSupervisionUser } from '@/lib/auth-server'
import { removeBan } from '@/lib/ban-server'
import { canTemporaryBanTarget, normalizeRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const actor = await requireSupervisionUser()

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
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin unban error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
