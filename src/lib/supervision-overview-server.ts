import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'
import { canViewUserFeedback, canManageUsers } from '@/lib/roles'
import { feedbackTypeLabel, isFeedbackType } from '@/lib/feedback'
import { listFlaggedNameModerationUsers } from '@/lib/name-moderation-attempts-server'
import { daysAgoParis, todayParis } from '@/lib/analytics-server'

const LIVE_STATUSES = ['waiting', 'briefing', 'playing']

export type DailyPoint = { date: string; visitors: number; parties: number }

export type LiveTable = {
  id: string
  code: string
  gameId: string | null
  gameTitle: string
  status: string
  visibility: string
  memberCount: number
  memberNames: string[]
  createdAt: string
  updatedAt: string
}

export type JournalEntry = {
  id: string
  kind: 'ban' | 'unban' | 'feature-ban' | 'cosmetic-grant' | 'moderation-term'
  actorName: string | null
  targetName: string | null
  detail: string | null
  createdAt: string
}

export type QueueItem = {
  id: string
  kind: 'feedback' | 'name-flag'
  title: string
  subtitle: string
  href: 'feedback' | 'accounts'
  createdAt: string
}

function gameTitleFor(gameId: string | null): string {
  if (!gameId) return gameId ?? ''
  return GAMES.find((g) => g.id === gameId)?.title ?? gameId
}

/** Série 14 derniers jours : visiteurs uniques (DailyVisitor) + parties distinctes (OnlineMatchResult, dédupliquées par salle). */
async function getDailySeries(days: number): Promise<DailyPoint[]> {
  const since = daysAgoParis(days - 1)
  const today = todayParis()

  const dates: string[] = []
  for (let i = days - 1; i >= 0; i -= 1) dates.push(daysAgoParis(i))

  const [visitorRows, matchRows] = await Promise.all([
    prisma.dailyVisitor.groupBy({
      by: ['date'],
      where: { date: { gte: since, lte: today } },
      _count: { _all: true },
    }),
    // Prisma stocke DateTime en SQLite comme entier (ms epoch), pas en texte —
    // date() ne sait pas le lire directement, il faut le modifieur 'unixepoch'
    // (qui attend des SECONDES, d'où le /1000). Bucket en jour calendaire UTC
    // (approximation suffisante pour une tendance, pas un décompte exact).
    prisma.$queryRawUnsafe<Array<{ d: string; c: bigint }>>(
      `SELECT date(finishedAt / 1000, 'unixepoch') as d, COUNT(DISTINCT roomId) as c
       FROM OnlineMatchResult
       WHERE finishedAt >= ?
       GROUP BY d`,
      new Date(`${since}T00:00:00.000Z`).getTime()
    ),
  ])

  const visitorsByDate = new Map(visitorRows.map((r) => [r.date, r._count._all]))
  const partiesByDate = new Map(matchRows.map((r) => [r.d, Number(r.c)]))

  return dates.map((date) => ({
    date,
    visitors: visitorsByDate.get(date) ?? 0,
    parties: partiesByDate.get(date) ?? 0,
  }))
}

async function getLiveTables(): Promise<LiveTable[]> {
  const rooms = await prisma.onlineRoom.findMany({
    where: { status: { in: LIVE_STATUSES } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      code: true,
      gameId: true,
      status: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      members: { select: { user: { select: { displayName: true } } }, take: 8 },
    },
  })

  return rooms.map((r) => ({
    id: r.id,
    code: r.code,
    gameId: r.gameId,
    gameTitle: gameTitleFor(r.gameId),
    status: r.status,
    visibility: r.visibility,
    memberCount: r.members.length,
    memberNames: r.members.map((m) => m.user.displayName),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

async function getJournal(limit = 20): Promise<JournalEntry[]> {
  const [banEvents, grants, featureBans, terms] = await Promise.all([
    prisma.accountBanEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { displayName: true } },
        actor: { select: { displayName: true } },
      },
    }),
    prisma.cosmeticGrant.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { displayName: true } },
        grantedBy: { select: { displayName: true } },
      },
    }),
    prisma.featureBan.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { displayName: true } },
        actor: { select: { displayName: true } },
      },
    }),
    prisma.moderationTerm.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ])

  const termActorIds = [...new Set(terms.map((t) => t.addedById).filter((id): id is string => Boolean(id)))]
  const termActors = termActorIds.length
    ? await prisma.user.findMany({ where: { id: { in: termActorIds } }, select: { id: true, displayName: true } })
    : []
  const termActorMap = new Map(termActors.map((u) => [u.id, u.displayName]))

  const entries: JournalEntry[] = [
    ...banEvents.map((e) => ({
      id: `ban-${e.id}`,
      kind: (e.action === 'unban' ? 'unban' : 'ban') as JournalEntry['kind'],
      actorName: e.actor?.displayName ?? null,
      targetName: e.user.displayName,
      detail: e.comment,
      createdAt: e.createdAt.toISOString(),
    })),
    ...grants.map((g) => ({
      id: `grant-${g.id}`,
      kind: 'cosmetic-grant' as const,
      actorName: g.grantedBy?.displayName ?? null,
      targetName: g.user.displayName,
      detail: g.cosmeticKey,
      createdAt: g.createdAt.toISOString(),
    })),
    ...featureBans.map((f) => ({
      id: `feature-${f.id}`,
      kind: 'feature-ban' as const,
      actorName: f.actor?.displayName ?? null,
      targetName: f.user.displayName,
      detail: f.feature,
      createdAt: f.createdAt.toISOString(),
    })),
    ...terms.map((t) => ({
      id: `term-${t.id}`,
      kind: 'moderation-term' as const,
      actorName: t.addedById ? (termActorMap.get(t.addedById) ?? null) : null,
      targetName: null,
      detail: t.term,
      createdAt: t.createdAt.toISOString(),
    })),
  ]

  return entries
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

async function getQueue(actorRole: string): Promise<QueueItem[]> {
  const items: QueueItem[] = []

  if (canViewUserFeedback(actorRole)) {
    const openFeedback = await prisma.userFeedback.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { displayName: true } } },
    })
    for (const f of openFeedback) {
      items.push({
        id: `feedback-${f.id}`,
        kind: 'feedback',
        title: isFeedbackType(f.type) ? feedbackTypeLabel(f.type) : f.type,
        subtitle: `${f.user?.displayName ?? 'Anonyme'} — ${f.message.length > 80 ? `${f.message.slice(0, 80)}…` : f.message}`,
        href: 'feedback',
        createdAt: f.createdAt.toISOString(),
      })
    }
  }

  if (canManageUsers(actorRole)) {
    const flagged = await listFlaggedNameModerationUsers(10)
    for (const f of flagged) {
      items.push({
        id: `flag-${f.user.id}`,
        kind: 'name-flag',
        title: f.user.displayName,
        subtitle: `${f.profanityAttemptCount} tentative(s) de pseudo bloquées`,
        href: 'accounts',
        createdAt: (f.user.nameModerationWarnedAt ?? new Date(0)).toISOString(),
      })
    }
  }

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15)
}

export async function getSupervisionOverview(actorRole: string) {
  const [dailySeries, liveTables, journal, queue] = await Promise.all([
    getDailySeries(14),
    getLiveTables(),
    getJournal(20),
    getQueue(actorRole),
  ])

  return { dailySeries, liveTables, journal, queue }
}
