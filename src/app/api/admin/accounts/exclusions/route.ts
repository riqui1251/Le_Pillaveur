import { NextResponse } from 'next/server'
import { canManageUsers, canViewSupervisionAnalytics } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { accountKindSelect, kindOfAccount } from '@/lib/account-kind-server'
import { invalidateActiveAccountsStats } from '@/lib/active-accounts-server'
import { getExcludedUserIds, setUserExcluded } from '@/lib/metrics-exclusions'
import { invalidateGrowthStats, logStaffAction } from '@/lib/supervision-overview-server'
import { adminErrorResponse, requireRole } from '../../_guard'

/**
 * Comptes de TEST exclus des statistiques d'usage (tableau des comptes
 * actifs) : invités créés par l'équipe en essayant TryBotsGate, par exemple.
 * La liste ne garde que des identifiants (SiteSetting, metrics-exclusions.ts).
 *
 * GET : la liste, avec pseudo, code et type résolus à la lecture — même garde
 * que le tableau qu'elle filtre (admin et plus).
 * POST { userId, excluded } : cocher ou décocher un compte — gestion des
 * comptes (canManageUsers). Journalisé ('metrics-exclusion', ancré sur le
 * compte visé) avec un détail neutre 'on' / 'off', traduit à la lecture : ni
 * pseudo, ni email, ni phrase en français lue telle quelle en en/es/it.
 */
export async function GET() {
  try {
    await requireRole(canViewSupervisionAnalytics)
    const now = new Date()
    const userIds = await getExcludedUserIds()
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, accountCode: true, ...accountKindSelect(now) },
        })
      : []
    const byId = new Map(users.map((user) => [user.id, user]))

    return NextResponse.json({
      userIds,
      // Dans l'ordre de la liste ; un compte supprimé depuis n'y figure plus.
      accounts: userIds.flatMap((userId) => {
        const user = byId.get(userId)
        return user
          ? [{ userId, displayName: user.displayName, accountCode: user.accountCode, kind: kindOfAccount(user) }]
          : []
      }),
    })
  } catch (error) {
    return adminErrorResponse(error, 'accounts exclusions GET')
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(canManageUsers)
    const body = await request.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''

    if (!userId || typeof body.excluded !== 'boolean') {
      return NextResponse.json({ error: 'userId et excluded (booléen) requis' }, { status: 400 })
    }
    const excluded: boolean = body.excluded

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, isGuest: true },
    })

    if (excluded) {
      // Même périmètre que la liste Comptes : un compte legacy n'y est pas.
      if (!target || (!target.email && !target.isGuest)) {
        return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
      }
      if (target.role !== 'user') {
        return NextResponse.json(
          { error: 'Les comptes de l\'équipe sont déjà exclus des statistiques' },
          { status: 400 }
        )
      }
    }

    // Décocher reste permis pour un compte disparu : la liste s'en nettoie.
    const { changed, userIds } = await setUserExcluded(userId, excluded)
    if (excluded && !userIds.includes(userId)) {
      return NextResponse.json({ error: 'Liste des comptes de test pleine' }, { status: 409 })
    }

    if (changed) {
      // Les deux blocs de la Vue d'ensemble qui lisent la liste : tableau des
      // comptes actifs et joueurs du jeu en ligne (croissance).
      invalidateActiveAccountsStats()
      invalidateGrowthStats()
      // Ancrée sur le compte visé (lien vers sa fiche dans le journal) : pas
      // de trace pour un compte déjà supprimé, qui n'a plus de fiche.
      if (target) {
        await logStaffAction({
          actorId: actor.id,
          action: 'metrics-exclusion',
          targetUserId: userId,
          detail: excluded ? 'on' : 'off',
        })
      }
    }

    return NextResponse.json({ ok: true, userId, excluded, userIds })
  } catch (error) {
    return adminErrorResponse(error, 'accounts exclusions POST')
  }
}
