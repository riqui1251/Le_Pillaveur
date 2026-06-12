import { prisma } from '@/lib/prisma'

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
  options?: { country?: string | null; userId?: string | null }
): Promise<void> {
  const now = new Date()
  const date = todayParis()
  const country = options?.country ?? null
  const userId = options?.userId ?? null

  await prisma.$transaction([
    prisma.sitePresence.upsert({
      where: { visitorId },
      create: {
        visitorId,
        firstSeen: now,
        lastSeen: now,
        country,
        userId,
      },
      update: {
        lastSeen: now,
        ...(country ? { country } : {}),
        ...(userId ? { userId } : {}),
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
        ...(country ? { lastCountry: country } : {}),
      },
    })
  }
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
    select: { country: true, userId: true, visitorId: true, lastSeen: true },
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
            lastSeenAt: true,
            role: true,
          },
        })
      : []

  const connectedAccounts = recentUsers
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      accountCode: u.accountCode,
      country: u.lastCountry,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      role: u.role,
      online: u.lastSeenAt ? u.lastSeenAt >= onlineSince : false,
    }))
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
    accounts: {
      total: totalAccounts,
    },
    generatedAt: now.toISOString(),
  }
}
