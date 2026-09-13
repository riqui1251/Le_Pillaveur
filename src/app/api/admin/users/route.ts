import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { assertCanAssignRoles } from '@/lib/auth-server'
import { getBanState, logAccountEvent } from '@/lib/ban-server'
import {
  canAccessSupervision,
  canAssignRole,
  canManageUsers,
  canModifyTarget,
  canViewSupervisionAnalytics,
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
import { onlineSince } from '@/lib/presence'
import { listFeatureBansForUsers, type FeatureBanState } from '@/lib/feature-bans'
import { summarizeRecentVisitsByUser, type AccountVisitsDigest } from '@/lib/account-activity-server'
import {
  accountDescriptionSelect,
  accountKindWhere,
  countAccountsByKind,
  describeAccount,
  escapeLikePattern,
  LIKE_ESCAPE_CHAR,
  LISTED_ACCOUNT_KINDS,
  looksLikeIpQuery,
  NON_LEGACY_ACCOUNT_WHERE,
  type ListedAccountKind,
} from '@/lib/account-kind-server'
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
const DAY_MS = 24 * 60 * 60 * 1000

/** Filtre d'activité, sur User.lastSeenAt (dernière activité du compte). */
const ACTIVITY_FILTERS = ['all', '24h', '7d', 'inactive30', 'never'] as const
type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]

/**
 * Compte sans visite commencée ces 7 jours. « Visites non suivies » ne se
 * déduit pas d'ici : des visites plus anciennes peuvent exister (la fiche le dit).
 */
const NO_RECENT_VISITS: AccountVisitsDigest = { visits: 0, activeSeconds: 0 }

function parseKindFilter(value: string | null): ListedAccountKind | 'all' {
  return LISTED_ACCOUNT_KINDS.find((kind) => kind === value) ?? 'all'
}

function parseActivityFilter(value: string | null): ActivityFilter {
  return ACTIVITY_FILTERS.find((filter) => filter === value) ?? 'all'
}

function serializeUser(
  user: {
    id: string
    email: string | null
    displayName: string
    accountCode: string | null
    role: string
    createdAt: Date
    updatedAt: Date
    lastCountry: string | null
    lastIp: string | null
    lastDevice: string | null
    lastSeenAt: Date | null
    lastLoginAt: Date | null
    banType: string | null
    bannedUntil: Date | null
    banComment: string | null
    bannedAt: Date | null
  } & Parameters<typeof describeAccount>[0]
) {
  const ban = getBanState(user)
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    accountCode: user.accountCode,
    // Type de compte calculé à la lecture (account-kind), jamais le hash
    // lui-même. Remplace `authProvider`, qui déduisait « Google » d'un mot de
    // passe vide et classait donc un invité parmi les comptes Google.
    ...describeAccount(user),
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastCountry: user.lastCountry,
    lastIp: user.lastIp,
    lastDevice: user.lastDevice,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    ban: {
      banned: ban.banned,
      banType: ban.banType,
      bannedUntil: ban.bannedUntil?.toISOString() ?? null,
      banComment: ban.banComment,
    },
  }
}

/** Select de la liste : la description du type dépend de l'instant (sessions valides). */
function userListSelect(now: Date) {
  return {
    ...accountDescriptionSelect(now),
    id: true,
    displayName: true,
    accountCode: true,
    role: true,
    updatedAt: true,
    lastCountry: true,
    lastIp: true,
    lastDevice: true,
    lastLoginAt: true,
    bannedUntil: true,
    banComment: true,
    bannedAt: true,
  } as const satisfies Prisma.UserSelect
}

/**
 * Comptes ayant utilisé cette IP — la recherche par IP portait sur TOUT
 * l'historique côté client, ce qui obligeait à le télécharger en entier. On
 * remonte ici les seuls identifiants concernés (requête bornée), qui
 * rejoignent ensuite le OR de la recherche. La saisie est échappée : un « _ »
 * ou un « % » tapé ne doit pas devenir un joker.
 */
async function userIdsMatchingIp(query: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ subjectKey: string }>>`
    SELECT "subjectKey"
    FROM "IpSeenLog"
    WHERE "subjectKey" LIKE 'user:%'
      AND "ip" LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE ${LIKE_ESCAPE_CHAR}
    GROUP BY "subjectKey"
    LIMIT 200
  `
  return rows.map((row) => row.subjectKey.slice('user:'.length))
}

export async function GET(request: Request) {
  try {
    const actor = await requireRole(canAccessSupervision)

    const { searchParams } = new URL(request.url)
    const { page, pageSize, skip } = parsePaging(searchParams, {
      defaultSize: DEFAULT_PAGE_SIZE,
      maxSize: MAX_PAGE_SIZE,
    })
    const query = (searchParams.get('q') ?? '').trim().slice(0, 80)
    const roleFilter = searchParams.get('role') ?? 'all'
    const statusFilter = searchParams.get('status') ?? 'all'
    const kindFilter = parseKindFilter(searchParams.get('kind'))
    const activityFilter = parseActivityFilter(searchParams.get('activity'))
    const sort = searchParams.get('sort') === 'created' ? 'created' : 'activity'
    const now = new Date()

    // Tous les comptes non legacy : email (mot de passe ou Google) OU invité.
    // Les invités en étaient exclus : ni liste, ni recherche, ni fiche.
    const filters: Prisma.UserWhereInput[] = [NON_LEGACY_ACCOUNT_WHERE]

    if (roleFilter !== 'all' && isUserRole(roleFilter)) {
      filters.push({ role: roleFilter })
    }

    if (kindFilter !== 'all') {
      filters.push(accountKindWhere(kindFilter, now))
    }

    if (statusFilter === 'online') {
      // Même fenêtre (3 min) que la pastille, les amis et le compteur public.
      filters.push({ lastSeenAt: { gte: onlineSince(now.getTime()) } })
    } else if (statusFilter === 'banned') {
      filters.push({
        OR: [
          { banType: 'permanent' },
          { banType: 'temporary', bannedUntil: { gt: now } },
        ],
      })
    }

    // « Inactif depuis plus de 30 j » ne reprend pas les comptes jamais vus :
    // ils ont leur propre filtre (`lt` écarte déjà les valeurs nulles).
    if (activityFilter === '24h') {
      filters.push({ lastSeenAt: { gte: new Date(now.getTime() - DAY_MS) } })
    } else if (activityFilter === '7d') {
      filters.push({ lastSeenAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } })
    } else if (activityFilter === 'inactive30') {
      filters.push({ lastSeenAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } })
    } else if (activityFilter === 'never') {
      filters.push({ lastSeenAt: null })
    }

    if (query) {
      // Le code de compte s'affiche « LP-XXXX » mais se stocke sans préfixe.
      const codeQuery = query.replace(/^lp-/i, '')
      // Adresses IP fouillées seulement si la saisie en a l'allure : un pseudo
      // court remontait sinon tous les comptes dont une IPv6 le contient.
      const ipSearch = looksLikeIpQuery(query)
      const ipUserIds = ipSearch ? await userIdsMatchingIp(query) : []
      filters.push({
        OR: [
          { displayName: { contains: query } },
          { email: { contains: query } },
          { accountCode: { contains: codeQuery } },
          ...(ipSearch ? [{ lastIp: { contains: query } }] : []),
          ...(ipUserIds.length > 0 ? [{ id: { in: ipUserIds } }] : []),
        ],
      })
    }

    const where: Prisma.UserWhereInput = { AND: filters }

    // Tri par défaut : dernière activité, comptes jamais vus en dernier — un
    // compte actif ne doit pas passer derrière des inscrits récents muets.
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      sort === 'created'
        ? [{ createdAt: 'desc' }]
        : [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]

    const [users, total, counts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: userListSelect(now),
      }),
      prisma.user.count({ where }),
      // Décompte NON filtré, le même que la tuile « Comptes » : le compteur de
      // l'onglet ne doit plus varier avec la recherche en cours.
      countAccountsByKind(now),
    ])

    // Résumé des visites sur 7 jours de Paris (« 3 visites · 1 h 10 actif ») :
    // durées d'activité, donc admins et plus seulement. Pour un modérateur,
    // rien n'est calculé et la propriété `visits7d` est ABSENTE — il ne voit
    // que « actif il y a … » (lastSeenAt).
    const showVisits = canViewSupervisionAnalytics(actor.role)
    const userIds = users.map((u) => u.id)

    // Historique d'IP, sanctions ciblées et visites : uniquement pour la page
    // affichée (un seul groupBy pour les visites).
    const [ipsMap, featureBansMap, visitsMap] = await Promise.all([
      getIpsBySubjectKeys(users.map((u) => subjectKeyFor(u.id, ''))),
      listFeatureBansForUsers(userIds),
      showVisits ? summarizeRecentVisitsByUser(userIds, now) : null,
    ])

    return NextResponse.json({
      users: users.map((u) => ({
        ...serializeUser(u),
        ips: ipsMap.get(subjectKeyFor(u.id, '')) ?? [],
        featureBans: featureBansMap.get(u.id) ?? ([] as FeatureBanState[]),
        ...(visitsMap ? { visits7d: visitsMap.get(u.id) ?? NO_RECENT_VISITS } : {}),
      })),
      total,
      page,
      pageSize,
      counts,
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
      select: { id: true, role: true, isGuest: true },
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
      // Un invité n'a pour toute clé qu'un cookie (ni email, ni mot de passe,
      // ni Google) : lui confier un grade d'équipe, c'est ouvrir la
      // supervision à quiconque récupère ce cookie. Le renommage reste permis.
      if (target.isGuest && role !== 'user') {
        return NextResponse.json(
          {
            error: 'Un compte invité ne peut pas recevoir de rôle d\'équipe',
            code: 'guest_cannot_be_staff',
          },
          { status: 409 }
        )
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

    // Entrée dans l'équipe : le staff n'a pas d'historique de visites (la
    // politique le dit, et planPing n'en écrit plus). Celles du joueur partent
    // AVANT le changement de grade : un échec laisse le rôle intact, et l'on
    // peut réessayer.
    if (role !== undefined && role !== target.role && normalizeRole(role) !== 'user') {
      await prisma.accountVisit.deleteMany({ where: { userId } })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: userListSelect(new Date()),
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
