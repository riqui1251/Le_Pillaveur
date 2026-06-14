import { prisma } from '@/lib/prisma'
import { PRESENCE_PING_SECONDS } from '@/lib/user-activity-server'
import { parseLocalPlayerNamesInput } from '@/lib/visitor-local-players'
import type { DeviceKind } from '@/lib/device-from-user-agent'
import {
  buildGroupedVisitors,
  findSubjectKeysByIp,
  getIpsBySubjectKeys,
  recordIpSeen,
  subjectKeyFor,
} from '@/lib/ip-history-server'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function daysAgoParis(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export async function recordVisitorPing(
  visitorId: string,
  options?: {
    country?: string | null
    userId?: string | null
    ip?: string | null
    localPlayerNames?: string[]
    forceLocalPlayerSync?: boolean
    device?: DeviceKind | null
  }
): Promise<void> {
  const now = new Date()
  const date = todayParis()
  const country = options?.country ?? null
  const userId = options?.userId ?? null
  const ip = options?.ip ?? null
  const device = options?.device && options.device !== 'unknown' ? options.device : null
  const localPlayerNames = options?.localPlayerNames
  const forceLocalPlayerSync = options?.forceLocalPlayerSync === true
  const localPlayersPatch =
    forceLocalPlayerSync && localPlayerNames !== undefined
      ? {
          localPlayerCount: localPlayerNames.length,
          localPlayerNames: JSON.stringify(localPlayerNames),
        }
      : localPlayerNames && localPlayerNames.length > 0
        ? {
            localPlayerCount: localPlayerNames.length,
            localPlayerNames: JSON.stringify(localPlayerNames),
          }
        : {}

  await prisma.$transaction([
    prisma.sitePresence.upsert({
      where: { visitorId },
      create: {
        visitorId,
        firstSeen: now,
        lastSeen: now,
        country,
        lastIp: ip,
        lastDevice: device,
        userId,
        ...localPlayersPatch,
      },
      update: {
        lastSeen: now,
        ...(country ? { country } : {}),
        ...(ip ? { lastIp: ip } : {}),
        ...(device ? { lastDevice: device } : {}),
        ...(userId ? { userId } : {}),
        ...localPlayersPatch,
      },
    }),
    prisma.dailyVisitor.upsert({
      where: { visitorId_date: { visitorId, date } },
      create: { visitorId, date },
      update: {},
    }),
  ])

  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSeenAt: now,
        totalPresenceSeconds: { increment: PRESENCE_PING_SECONDS },
        ...(country ? { lastCountry: country } : {}),
        ...(ip ? { lastIp: ip } : {}),
        ...(device ? { lastDevice: device } : {}),
      },
    })
  }

  await recordIpSeen(userId, visitorId, ip, country)
}

export async function getVisitorStats() {
  const now = new Date()
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS)
  const today = todayParis()
  const weekStart = daysAgoParis(6)
  const monthStart = daysAgoParis(29)

  const [onlineNow, todayCount, weekCount, monthCount, totalAccounts] = await Promise.all([
    prisma.sitePresence.count({ where: { lastSeen: { gte: onlineSince } } }),
    prisma.dailyVisitor.count({ where: { date: today } }),
    prisma.dailyVisitor.groupBy({
      by: ['visitorId'],
      where: { date: { gte: weekStart } },
    }).then((rows) => rows.length),
    prisma.dailyVisitor.groupBy({
      by: ['visitorId'],
      where: { date: { gte: monthStart } },
    }).then((rows) => rows.length),
    prisma.user.count({
      where: { passwordHash: { not: '' }, email: { not: null } },
    }),
  ])

  const onlinePresences = await prisma.sitePresence.findMany({
    where: { lastSeen: { gte: onlineSince } },
    select: { country: true, lastIp: true, lastDevice: true, userId: true, visitorId: true, lastSeen: true },
  })

  const onlineByCountryMap = new Map<string, number>()
  for (const p of onlinePresences) {
    const key = p.country ?? '??'
    onlineByCountryMap.set(key, (onlineByCountryMap.get(key) ?? 0) + 1)
  }

  const onlineByCountry = [...onlineByCountryMap.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)

  const recentUserIds = [
    ...new Set(onlinePresences.map((p) => p.userId).filter(Boolean)),
  ] as string[]

  const recentUsers =
    recentUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: recentUserIds } },
          select: {
            id: true,
            displayName: true,
            email: true,
            accountCode: true,
            lastCountry: true,
            lastIp: true,
            lastDevice: true,
            lastSeenAt: true,
            role: true,
          },
        })
      : []

  const connectedUserIps = await getIpsBySubjectKeys(
    recentUsers.map((u) => subjectKeyFor(u.id, ''))
  )

  const connectedAccounts = recentUsers
    .map((u) => {
      const ips = connectedUserIps.get(subjectKeyFor(u.id, '')) ?? []
      const primaryIp = ips[0]?.ip ?? u.lastIp
      return {
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        accountCode: u.accountCode,
        country: ips[0]?.country ?? u.lastCountry,
        ip: primaryIp,
        ips,
        lastDevice: u.lastDevice,
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        role: u.role,
        online: u.lastSeenAt ? u.lastSeenAt >= onlineSince : false,
      }
    })
    .sort((a, b) => {
      const ta = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0
      const tb = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0
      return tb - ta
    })

  const todayVisitorsByCountry = await prisma.sitePresence.groupBy({
    by: ['country'],
    where: { lastSeen: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    _count: { _all: true },
  })

  const visitorsTodayByCountry = todayVisitorsByCountry
    .map((row) => ({
      country: row.country,
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count)

  const recentPresences = await prisma.sitePresence.findMany({
    orderBy: { lastSeen: 'desc' },
    take: 200,
    select: {
      visitorId: true,
      userId: true,
      country: true,
      lastIp: true,
      lastDevice: true,
      lastSeen: true,
      localPlayerCount: true,
      localPlayerNames: true,
    },
  })

  const presenceUserIds = [
    ...new Set(recentPresences.map((p) => p.userId).filter(Boolean)),
  ] as string[]

  const presenceUsers =
    presenceUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: presenceUserIds } },
          select: {
            id: true,
            displayName: true,
            email: true,
            accountCode: true,
            role: true,
            localPlayersJson: true,
          },
        })
      : []

  const visitorIpList = await buildGroupedVisitors(
    recentPresences.map((p) => ({
      visitorId: p.visitorId,
      userId: p.userId,
      country: p.country,
      lastIp: p.lastIp,
      lastDevice: p.lastDevice,
      lastSeen: p.lastSeen,
      localPlayerCount: p.localPlayerCount,
      localPlayerNames: p.localPlayerNames,
    })),
    presenceUsers,
    onlineSince
  )

  return {
    visitors: {
      onlineNow,
      today: todayCount,
      week: weekCount,
      month: monthCount,
      onlineByCountry,
      visitorsTodayByCountry,
    },
    connectedAccounts,
    visitorIpList,
    accounts: {
      total: totalAccounts,
    },
    generatedAt: now.toISOString(),
  }
}

export async function lookupByIp(ip: string) {
  const normalized = ip.trim()
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS)

  const subjectUserIds = [
    ...new Set(
      (await findSubjectKeysByIp(normalized))
        .map((key) => (key.startsWith('user:') ? key.slice(5) : null))
        .filter(Boolean)
    ),
  ] as string[]

  const [users, presences] = await Promise.all([
    prisma.user.findMany({
      where: {
        passwordHash: { not: '' },
        email: { not: null },
        OR: [{ lastIp: normalized }, { id: { in: subjectUserIds } }],
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        accountCode: true,
        role: true,
        lastIp: true,
        lastCountry: true,
        lastSeenAt: true,
        banType: true,
        bannedUntil: true,
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    }),
    prisma.sitePresence.findMany({
      where: { lastIp: normalized },
      orderBy: { lastSeen: 'desc' },
      take: 50,
      select: {
        visitorId: true,
        userId: true,
        country: true,
        lastIp: true,
        lastSeen: true,
        firstSeen: true,
      },
    }),
  ])

  const userIpsMap = await getIpsBySubjectKeys(users.map((u) => subjectKeyFor(u.id, '')))

  const presenceUserIds = [
    ...new Set(presences.map((p) => p.userId).filter(Boolean)),
  ] as string[]

  const linkedUsers =
    presenceUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: presenceUserIds } },
          select: {
            id: true,
            displayName: true,
            email: true,
            accountCode: true,
            role: true,
          },
        })
      : []

  const linkedById = new Map(linkedUsers.map((u) => [u.id, u]))

  return {
    ip: normalized,
    accounts: users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      accountCode: u.accountCode,
      role: u.role,
      lastCountry: u.lastCountry,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      online: u.lastSeenAt ? u.lastSeenAt >= onlineSince : false,
      banned: Boolean(u.banType && (u.banType === 'permanent' || (u.bannedUntil && u.bannedUntil > new Date()))),
      ips: userIpsMap.get(subjectKeyFor(u.id, '')) ?? [],
    })),
    visitors: presences.map((p) => {
      const linked = p.userId ? linkedById.get(p.userId) : undefined
      return {
        visitorId: p.visitorId,
        userId: p.userId,
        country: p.country,
        lastSeenAt: p.lastSeen.toISOString(),
        firstSeenAt: p.firstSeen.toISOString(),
        online: p.lastSeen >= onlineSince,
        displayName: linked?.displayName ?? null,
        accountCode: linked?.accountCode ?? null,
        role: linked?.role ?? null,
      }
    }),
  }
}
