import { Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

export type IpEntry = {
  ip: string
  country: string | null
  lastSeenAt: string
  firstSeenAt: string
}

export type GroupedVisitor = {
  subjectKey: string
  visitorId: string
  userId: string | null
  displayName: string | null
  email: string | null
  accountCode: string | null
  role: string | null
  country: string | null
  primaryIp: string | null
  ips: IpEntry[]
  lastSeenAt: string
  online: boolean
}

type IpSeenRow = {
  id: string
  subjectKey: string
  ip: string
  country: string | null
  firstSeen: string
  lastSeen: string
}

function newRowId(): string {
  return randomBytes(16).toString('hex')
}

function rowToEntry(row: IpSeenRow): IpEntry {
  return {
    ip: row.ip,
    country: row.country,
    lastSeenAt: row.lastSeen,
    firstSeenAt: row.firstSeen,
  }
}

export function subjectKeyFor(userId: string | null | undefined, visitorId: string): string {
  return userId ? `user:${userId}` : `visitor:${visitorId}`
}

export async function recordIpSeen(
  userId: string | null | undefined,
  visitorId: string,
  ip: string | null | undefined,
  country: string | null | undefined
): Promise<void> {
  if (!ip) return

  const now = new Date().toISOString()
  const subjectKey = subjectKeyFor(userId, visitorId)
  const id = newRowId()

  await prisma.$executeRaw`
    INSERT INTO "IpSeenLog" ("id", "subjectKey", "ip", "country", "firstSeen", "lastSeen")
    VALUES (${id}, ${subjectKey}, ${ip}, ${country ?? null}, ${now}, ${now})
    ON CONFLICT("subjectKey", "ip") DO UPDATE SET
      "lastSeen" = excluded."lastSeen",
      "country" = COALESCE(excluded."country", "IpSeenLog"."country")
  `
}

export async function getIpsBySubjectKeys(
  subjectKeys: string[]
): Promise<Map<string, IpEntry[]>> {
  const map = new Map<string, IpEntry[]>()
  if (subjectKeys.length === 0) return map

  const rows = await prisma.$queryRaw<IpSeenRow[]>`
    SELECT "id", "subjectKey", "ip", "country", "firstSeen", "lastSeen"
    FROM "IpSeenLog"
    WHERE "subjectKey" IN (${Prisma.join(subjectKeys)})
    ORDER BY "lastSeen" DESC
  `

  for (const row of rows) {
    const list = map.get(row.subjectKey) ?? []
    list.push(rowToEntry(row))
    map.set(row.subjectKey, list)
  }

  return map
}

export async function findSubjectKeysByIp(ip: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ subjectKey: string }>>`
    SELECT "subjectKey"
    FROM "IpSeenLog"
    WHERE "ip" = ${ip}
    GROUP BY "subjectKey"
    ORDER BY MAX("lastSeen") DESC
    LIMIT 100
  `
  return rows.map((row) => row.subjectKey)
}

type PresenceRow = {
  visitorId: string
  userId: string | null
  country: string | null
  lastIp: string | null
  lastSeen: Date
}

type LinkedUser = {
  id: string
  displayName: string
  email: string | null
  accountCode: string | null
  role: string
}

export async function buildGroupedVisitors(
  presences: PresenceRow[],
  linkedUsers: LinkedUser[],
  onlineSince: Date
): Promise<GroupedVisitor[]> {
  const userById = new Map(linkedUsers.map((u) => [u.id, u]))
  const bySubject = new Map<string, PresenceRow>()

  for (const p of presences) {
    const key = subjectKeyFor(p.userId, p.visitorId)
    const existing = bySubject.get(key)
    if (!existing || p.lastSeen > existing.lastSeen) {
      bySubject.set(key, p)
    }
  }

  const subjectKeys = [...bySubject.keys()]
  const ipsMap = await getIpsBySubjectKeys(subjectKeys)

  return [...bySubject.entries()]
    .map(([subjectKey, p]) => {
      const linked = p.userId ? userById.get(p.userId) : undefined
      const ips = ipsMap.get(subjectKey) ?? []
      const primaryIp = ips[0]?.ip ?? p.lastIp

      return {
        subjectKey,
        visitorId: p.visitorId,
        userId: p.userId,
        displayName: linked?.displayName ?? null,
        email: linked?.email ?? null,
        accountCode: linked?.accountCode ?? null,
        role: linked?.role ?? null,
        country: ips[0]?.country ?? p.country,
        primaryIp,
        ips,
        lastSeenAt: p.lastSeen.toISOString(),
        online: p.lastSeen >= onlineSince,
      }
    })
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
}

export async function getVisitorsByCountry(
  country: string | null,
  scope: 'online' | 'today'
): Promise<GroupedVisitor[]> {
  const now = new Date()
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS)
  const since =
    scope === 'online' ? onlineSince : new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const countryFilter =
    country === null || country === '??'
      ? { OR: [{ country: null }, { country: '??' }] }
      : { country }

  const presences = await prisma.sitePresence.findMany({
    where: {
      lastSeen: { gte: since },
      ...countryFilter,
    },
    orderBy: { lastSeen: 'desc' },
    take: 150,
    select: {
      visitorId: true,
      userId: true,
      country: true,
      lastIp: true,
      lastSeen: true,
    },
  })

  const userIds = [...new Set(presences.map((p) => p.userId).filter(Boolean))] as string[]
  const linkedUsers =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            displayName: true,
            email: true,
            accountCode: true,
            role: true,
          },
        })
      : []

  return buildGroupedVisitors(presences, linkedUsers, onlineSince)
}
