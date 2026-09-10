import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { assertCanAssignRoles } from '@/lib/auth-server'
import { getBanState, logAccountEvent } from '@/lib/ban-server'
import {
  canAccessSupervision,
  canAssignRole,
  canManageUsers,
  canModifyTarget,
  isUserRole,
  normalizeRole,
  roleLabel,
} from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import {
  displayNameTakenMessage,
  displayNameValidationMessage,
  getDisplayNameValidationError,
  isDisplayNameTaken,
} from '@/lib/display-name'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'
import { getIpsBySubjectKeys, subjectKeyFor } from '@/lib/ip-history-server'
import { listFeatureBansForUsers, type FeatureBanState } from '@/lib/feature-bans'
import { adminErrorResponse, parsePaging, requireRole } from '../_guard'

/**
 * Liste des comptes — PAGINÉE et filtrée EN BASE (F75). Auparavant la route
 * renvoyait TOUS les comptes avec TOUT leur historique d'IP, et le navigateur
 * faisait le tri : tenable à cinquante comptes, ruineux à mille. Recherche,
 * filtre de rôle et filtre d'état sont donc passés côté serveur, et
 * l'historique d'IP n'est chargé que pour la page affichée.
 */

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const ONLINE_WINDOW_MS = 5 * 60 * 1000

function serializeUser(user: {
  id: string
  email: string | null
  displayName: string
  accountCode: string | null
  passwordHash?: string
  role: string
  createdAt: Date
  updatedAt: Date
  lastCountry: string | null
  lastIp: string | null
  lastDevice: string | null
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
    // Jamais le hash lui-même : juste le MOYEN de connexion (un compte sans
    // mot de passe mais avec email = connexion Google).
    authProvider: user.passwordHash === '' ? ('google' as const) : ('password' as const),
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastCountry: user.lastCountry,
    lastIp: user.lastIp,
    lastDevice: user.lastDevice,
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

const USER_LIST_SELECT = {
  id: true,
  email: true,
  displayName: true,
  accountCode: true,
  passwordHash: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  lastCountry: true,
  lastIp: true,
  lastDevice: true,
  lastSeenAt: true,
  lastLoginAt: true,
  totalPresenceSeconds: true,
  banType: true,
  bannedUntil: true,
  banComment: true,
  bannedAt: true,
} as const

/**
 * Comptes ayant utilisé cette IP — la recherche par IP portait sur TOUT
 * l'historique côté client, ce qui obligeait à le télécharger en entier. On
 * remonte ici les seuls identifiants concernés (requête bornée), qui
 * rejoignent ensuite le OR de la recherche.
 */
async function userIdsMatchingIp(query: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ subjectKey: string }>>`
    SELECT "subjectKey"
    FROM "IpSeenLog"
    WHERE "subjectKey" LIKE 'user:%' AND "ip" LIKE ${`%${query}%`}
    GROUP BY "subjectKey"
    LIMIT 200
  `
  return rows.map((row) => row.subjectKey.slice('user:'.length))
}

export async function GET(request: Request) {
  try {
    await requireRole(canAccessSupervision)

    const { searchParams } = new URL(request.url)
    const { page, pageSize, skip } = parsePaging(searchParams, {
      defaultSize: DEFAULT_PAGE_SIZE,
      maxSize: MAX_PAGE_SIZE,
    })
    const query = (searchParams.get('q') ?? '').trim().slice(0, 80)
    const roleFilter = searchParams.get('role') ?? 'all'
    const statusFilter = searchParams.get('status') ?? 'all'

    // Tout compte ENREGISTRÉ : email + mot de passe OU connexion Google
    // (passwordHash vide). Seuls les invités (email null) restent exclus.
    const filters: Prisma.UserWhereInput[] = [{ email: { not: null } }]

    if (roleFilter !== 'all' && isUserRole(roleFilter)) {
      filters.push({ role: roleFilter })
    }

    if (statusFilter === 'online') {
      filters.push({ lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } })
    } else if (statusFilter === 'banned') {
      filters.push({
        OR: [
          { banType: 'permanent' },
          { banType: 'temporary', bannedUntil: { gt: new Date() } },
        ],
      })
    }

    if (query) {
      // Le code de compte s'affiche « LP-XXXX » mais se stocke sans préfixe.
      const codeQuery = query.replace(/^lp-/i, '')
      const ipUserIds = await userIdsMatchingIp(query)
      filters.push({
        OR: [
          { displayName: { contains: query } },
          { email: { contains: query } },
          { accountCode: { contains: codeQuery } },
          { lastIp: { contains: query } },
          ...(ipUserIds.length > 0 ? [{ id: { in: ipUserIds } }] : []),
        ],
      })
    }

    const where: Prisma.UserWhereInput = { AND: filters }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: USER_LIST_SELECT,
      }),
      prisma.user.count({ where }),
    ])

    // Historique d'IP et sanctions ciblées : uniquement pour la page affichée.
    const [ipsMap, featureBansMap] = await Promise.all([
      getIpsBySubjectKeys(users.map((u) => subjectKeyFor(u.id, ''))),
      listFeatureBansForUsers(users.map((u) => u.id)),
    ])

    return NextResponse.json({
      users: users.map((u) => ({
        ...serializeUser(u),
        ips: ipsMap.get(subjectKeyFor(u.id, '')) ?? [],
        featureBans: featureBansMap.get(u.id) ?? ([] as FeatureBanState[]),
      })),
      total,
      page,
      pageSize,
    })
  } catch (error) {
    return adminErrorResponse(error, 'users GET')
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole(canAccessSupervision)
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
      await ensureServerModerationTermsLoaded()
      const requestLocale = await resolveRequestLocale({ userLocale: actor.locale })
      const displayNameError = getDisplayNameValidationError(displayName)
      if (displayNameError) {
        if (displayNameError === 'profanity') {
          await logRejectedNameOnServer(request, {
            attemptedName: displayName,
            reason: displayNameError,
            context: 'display_name',
            userId: actor.id,
          })
        }
        return NextResponse.json(
          {
            error: displayNameValidationMessage(displayName, requestLocale),
            code: displayNameError,
          },
          { status: 400 }
        )
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
      if (await isDisplayNameTaken(displayName, userId)) {
        return NextResponse.json(
          {
            error: displayNameTakenMessage(requestLocale),
            code: 'display_name_taken',
          },
          { status: 409 }
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
      select: USER_LIST_SELECT,
    })

    // F42 : un changement de grade laisse désormais une trace, comme un ban.
    if (role !== undefined && role !== target.role) {
      await logAccountEvent({
        userId,
        actorId: actor.id,
        action: 'role-change',
        comment: `${roleLabel(target.role)} → ${roleLabel(role)}`,
      })
    }

    return NextResponse.json({ user: serializeUser(updated) })
  } catch (error) {
    return adminErrorResponse(error, 'users PATCH')
  }
}
