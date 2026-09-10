import { NextResponse } from 'next/server'
import { countLocalPlayers, getBanState } from '@/lib/ban-server'
import { prisma } from '@/lib/prisma'
import {
  canAccessSupervision,
  canDeleteAccount,
  canDeleteTarget,
  canViewAccountActivity,
  normalizeRole,
} from '@/lib/roles'
import { deleteUserAccount, getUserGamePlayStats } from '@/lib/user-activity-server'
import {
  logStaffAction,
  STAFF_SELF_ANCHORED_ACTIONS,
} from '@/lib/supervision-overview-server'
import { adminErrorResponse, requireRole } from '../../_guard'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const actor = await requireRole(canAccessSupervision)
    const { userId } = await params

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        accountCode: true,
        role: true,
        playMode: true,
        localPlayersJson: true,
        lastCountry: true,
        lastIp: true,
        lastDevice: true,
        lastSeenAt: true,
        lastLoginAt: true,
        totalPresenceSeconds: true,
        createdAt: true,
        updatedAt: true,
        banType: true,
        bannedUntil: true,
        banComment: true,
        bannedAt: true,
        _count: {
          select: {
            stats: true,
            achievements: true,
            sessions: true,
          },
        },
      },
    })

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }

    const banEvents = await prisma.accountBanEvent.findMany({
      where: {
        userId,
        // Les actions de staff sans cible propre sont ancrées sur leur AUTEUR
        // (F42) : elles n'ont rien à faire dans l'historique de modération
        // subi par ce compte.
        action: { notIn: [...STAFF_SELF_ANCHORED_ACTIONS] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        actor: { select: { displayName: true } },
      },
    })

    const ban = getBanState(user)
    const localPlayerCount = countLocalPlayers(user.localPlayersJson)

    let localPlayerNames: string[] = []
    if (user.localPlayersJson) {
      try {
        const parsed = JSON.parse(user.localPlayersJson) as Array<{ name?: string }>
        if (Array.isArray(parsed)) {
          localPlayerNames = parsed
            .map((p) => p.name)
            .filter((n): n is string => typeof n === 'string')
        }
      } catch {
        /* ignore */
      }
    }

    const showActivity = canViewAccountActivity(actor.role)
    const gamesPlayed = showActivity ? await getUserGamePlayStats(userId) : undefined

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        accountCode: user.accountCode,
        role: user.role,
        playMode: user.playMode,
        lastCountry: user.lastCountry,
        lastIp: showActivity ? user.lastIp : null,
        lastDevice: showActivity ? user.lastDevice : null,
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        lastLoginAt: showActivity ? user.lastLoginAt?.toISOString() ?? null : null,
        totalPresenceSeconds: showActivity ? user.totalPresenceSeconds : 0,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        localPlayerCount,
        localPlayerNames,
        statsCount: user._count.stats,
        achievementsCount: user._count.achievements,
        sessionsCount: user._count.sessions,
        gamesPlayed,
        ban: {
          ...ban,
          bannedUntil: ban.bannedUntil?.toISOString() ?? null,
          bannedAt: ban.bannedAt?.toISOString() ?? null,
        },
      },
      banHistory: banEvents.map((e) => ({
        id: e.id,
        action: e.action,
        comment: e.comment,
        bannedUntil: e.bannedUntil?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        actorName: e.actor?.displayName ?? 'Système',
      })),
    })
  } catch (error) {
    return adminErrorResponse(error, 'user detail GET')
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const actor = await requireRole(canDeleteAccount)

    const { userId } = await params

    if (userId === actor.id) {
      return NextResponse.json(
        { error: 'Tu ne peux pas supprimer ton propre compte depuis la supervision' },
        { status: 400 }
      )
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, displayName: true, accountCode: true },
    })

    if (!target || !target.email) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }

    if (
      !canDeleteTarget(normalizeRole(actor.role), normalizeRole(target.role))
    ) {
      return NextResponse.json(
        { error: 'Tu ne peux pas supprimer ce compte' },
        { status: 403 }
      )
    }

    await deleteUserAccount(userId)

    // F42 : la trace doit SURVIVRE au compte effacé — elle est donc ancrée sur
    // l'auteur (la ligne de journal de la cible partirait en cascade).
    await logStaffAction({
      actorId: actor.id,
      action: 'account-delete',
      detail: `${target.displayName}${target.accountCode ? ` (${target.accountCode})` : ''} — ${target.email}`,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminErrorResponse(error, 'user delete')
  }
}
