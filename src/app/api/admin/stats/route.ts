import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { getVisitorStats } from '@/lib/analytics-server'
import { getGlobalGamePlayStats } from '@/lib/game-stats-server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const actor = await getCurrentUser()
    if (!actor || !canViewSupervisionAnalytics(actor.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const [stats, gameStats] = await Promise.all([
      getVisitorStats(),
      getGlobalGamePlayStats(),
    ])

    const roleCounts = await prisma.user.groupBy({
      by: ['role'],
      where: { passwordHash: { not: '' }, email: { not: null } },
      _count: { _all: true },
    })

    const byRole = Object.fromEntries(
      roleCounts.map((row) => [row.role, row._count._all])
    )

    return NextResponse.json({
      ...stats,
      games: gameStats,
      accounts: {
        ...stats.accounts,
        byRole: {
          user: byRole.user ?? 0,
          moderator: byRole.moderator ?? 0,
          admin: byRole.admin ?? 0,
          superadmin: byRole.superadmin ?? 0,
          fondateur: byRole.fondateur ?? 0,
        },
      },
      actor: {
        id: actor.id,
        role: actor.role,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin stats error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
