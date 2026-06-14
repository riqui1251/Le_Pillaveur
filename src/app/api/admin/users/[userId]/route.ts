import { NextResponse } from 'next/server'
import { getCurrentUser, requireSupervisionUser } from '@/lib/auth-server'
import { countLocalPlayers, getBanState } from '@/lib/ban-server'
import { prisma } from '@/lib/prisma'
import {
  canDeleteTarget,
  canViewAccountActivity,
  normalizeRole,
} from '@/lib/roles'
import { deleteUserAccount, getUserGamePlayStats } from '@/lib/user-activity-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const actor = await requireSupervisionUser()
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
      where: { userId },
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
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin user detail error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const actor = await getCurrentUser()
    if (!actor) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const { userId } = await params

    if (userId === actor.id) {
      return NextResponse.json(
        { error: 'Tu ne peux pas supprimer ton propre compte depuis la supervision' },
        { status: 400 }
      )
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
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

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('admin user delete error:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}
