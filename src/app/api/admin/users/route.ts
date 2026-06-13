import { NextResponse } from 'next/server'
import { assertCanAssignRoles, requireSupervisionUser } from '@/lib/auth-server'
import { getBanState } from '@/lib/ban-server'
import {
  canAssignRole,
  canManageUsers,
  canModifyTarget,
  isUserRole,
  normalizeRole,
} from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { getIpsBySubjectKeys, subjectKeyFor } from '@/lib/ip-history-server'

function serializeUser(user: {
  id: string
  email: string | null
  displayName: string
  accountCode: string | null
  role: string
  createdAt: Date
  updatedAt: Date
  lastCountry: string | null
  lastIp: string | null
  lastSeenAt: Date | null
  lastLoginAt: Date | null
  totalPresenceSeconds: number
  banType: string | null
  bannedUntil: Date | null
  banComment: string | null
  bannedAt: Date | null
}) {
  const ban = getBanState(user)
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    accountCode: user.accountCode,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastCountry: user.lastCountry,
    lastIp: user.lastIp,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    totalPresenceSeconds: user.totalPresenceSeconds,
    ban: {
      banned: ban.banned,
      banType: ban.banType,
      bannedUntil: ban.bannedUntil?.toISOString() ?? null,
      banComment: ban.banComment,
    },
  }
}

export async function GET() {
  try {
    await requireSupervisionUser()

    const users = await prisma.user.findMany({
      where: { passwordHash: { not: '' }, email: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        accountCode: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastCountry: true,
        lastIp: true,
        lastSeenAt: true,
        lastLoginAt: true,
        totalPresenceSeconds: true,
        banType: true,
        bannedUntil: true,
        banComment: true,
        bannedAt: true,
      },
    })

    const ipsMap = await getIpsBySubjectKeys(users.map((u) => subjectKeyFor(u.id, '')))

    return NextResponse.json({
      users: users.map((u) => ({
        ...serializeUser(u),
        ips: ipsMap.get(subjectKeyFor(u.id, '')) ?? [],
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin users GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireSupervisionUser()
    const body = await request.json()
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim() : undefined
    const role = typeof body.role === 'string' ? body.role : undefined

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }

    if (role !== undefined) {
      assertCanAssignRoles(actor)
      if (!isUserRole(role)) {
        return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
      }
      if (userId === actor.id) {
        return NextResponse.json(
          { error: 'Tu ne peux pas modifier ton propre rôle' },
          { status: 400 }
        )
      }
      if (!canModifyTarget(normalizeRole(actor.role), normalizeRole(target.role))) {
        return NextResponse.json(
          { error: 'Seul un grade supérieur peut modifier le rôle d\'un pair ou d\'un supérieur' },
          { status: 403 }
        )
      }
      if (!canAssignRole(normalizeRole(actor.role), role)) {
        return NextResponse.json({ error: 'Tu ne peux pas attribuer ce rôle' }, { status: 403 })
      }
    }

    if (displayName !== undefined) {
      if (!displayName || displayName.length > 30) {
        return NextResponse.json({ error: 'Pseudo invalide' }, { status: 400 })
      }
      if (userId !== actor.id && !canManageUsers(actor.role)) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
      if (
        userId !== actor.id &&
        !canModifyTarget(normalizeRole(actor.role), normalizeRole(target.role))
      ) {
        return NextResponse.json(
          { error: 'Seul un grade supérieur peut modifier un pair ou un supérieur' },
          { status: 403 }
        )
      }
    }

    const data: { displayName?: string; name?: string; role?: string } = {}
    if (displayName !== undefined) {
      data.displayName = displayName
      data.name = displayName
    }
    if (role !== undefined) data.role = role

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        accountCode: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastCountry: true,
        lastIp: true,
        lastSeenAt: true,
        lastLoginAt: true,
        totalPresenceSeconds: true,
        banType: true,
        bannedUntil: true,
        banComment: true,
        bannedAt: true,
      },
    })

    return NextResponse.json({ user: serializeUser(updated) })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin users PATCH error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
