import { prisma } from '@/lib/prisma'
import type { NameModerationReason } from '@/lib/name-moderation'

export const NAME_MODERATION_WARNING_THRESHOLD = 3
export const MAX_STORED_ATTEMPTED_NAME_LENGTH = 80

export type NameModerationAttemptContext =
  | 'register'
  | 'display_name'
  | 'local_player_add'
  | 'local_player_rename'
  | 'online_display_name_update'

export type RecordNameModerationAttemptInput = {
  attemptedName: string
  reason: NameModerationReason
  context: NameModerationAttemptContext
  userId?: string | null
  visitorId?: string | null
  userAgent?: string | null
}

export function shouldShowNameModerationWarning(profanityAttemptCount: number): boolean {
  return profanityAttemptCount >= NAME_MODERATION_WARNING_THRESHOLD
}

function sanitizeAttemptedName(name: string): string {
  return name.trim().slice(0, MAX_STORED_ATTEMPTED_NAME_LENGTH)
}

export async function recordNameModerationAttempt(
  input: RecordNameModerationAttemptInput
): Promise<{ profanityAttemptCount: number; showWarning: boolean }> {
  const attemptedName = sanitizeAttemptedName(input.attemptedName)
  if (!attemptedName) {
    return { profanityAttemptCount: 0, showWarning: false }
  }

  await prisma.nameModerationAttempt.create({
    data: {
      attemptedName,
      reason: input.reason,
      context: input.context,
      userId: input.userId ?? null,
      visitorId: input.visitorId ?? null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
    },
  })

  const userId = input.userId ?? null
  if (!userId) {
    return { profanityAttemptCount: 0, showWarning: false }
  }

  const profanityAttemptCount = await prisma.nameModerationAttempt.count({
    where: { userId, reason: 'profanity' },
  })

  if (shouldShowNameModerationWarning(profanityAttemptCount)) {
    await prisma.user.updateMany({
      where: { id: userId, nameModerationWarnedAt: null },
      data: { nameModerationWarnedAt: new Date() },
    })
  }

  return {
    profanityAttemptCount,
    showWarning: shouldShowNameModerationWarning(profanityAttemptCount),
  }
}

export async function linkVisitorNameModerationAttempts(
  visitorId: string,
  userId: string
): Promise<void> {
  if (!visitorId || !userId) return

  await prisma.nameModerationAttempt.updateMany({
    where: { visitorId, userId: null },
    data: { userId },
  })

  const profanityAttemptCount = await prisma.nameModerationAttempt.count({
    where: { userId, reason: 'profanity' },
  })

  if (shouldShowNameModerationWarning(profanityAttemptCount)) {
    await prisma.user.updateMany({
      where: { id: userId, nameModerationWarnedAt: null },
      data: { nameModerationWarnedAt: new Date() },
    })
  }
}

export async function getNameModerationStatusForUser(userId: string) {
  const [profanityAttemptCount, totalAttemptCount, user, recentAttempts] = await Promise.all([
    prisma.nameModerationAttempt.count({
      where: { userId, reason: 'profanity' },
    }),
    prisma.nameModerationAttempt.count({
      where: { userId },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { nameModerationWarnedAt: true },
    }),
    prisma.nameModerationAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        attemptedName: true,
        reason: true,
        context: true,
        createdAt: true,
      },
    }),
  ])

  const showWarning = shouldShowNameModerationWarning(profanityAttemptCount)

  return {
    profanityAttemptCount,
    totalAttemptCount,
    showWarning,
    warnedAt: user?.nameModerationWarnedAt?.toISOString() ?? null,
    recentAttempts: recentAttempts.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export async function listNameModerationAttemptsForAdmin(options?: {
  limit?: number
  userId?: string
}) {
  const limit = Math.min(options?.limit ?? 100, 200)

  const rows = await prisma.nameModerationAttempt.findMany({
    where: options?.userId ? { userId: options.userId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          accountCode: true,
          nameModerationWarnedAt: true,
        },
      },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    attemptedName: row.attemptedName,
    reason: row.reason,
    context: row.context,
    visitorId: row.visitorId,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    user: row.user
      ? {
          id: row.user.id,
          displayName: row.user.displayName,
          email: row.user.email,
          accountCode: row.user.accountCode,
          warnedAt: row.user.nameModerationWarnedAt?.toISOString() ?? null,
        }
      : null,
  }))
}

export async function listFlaggedNameModerationUsers(limit = 50) {
  const grouped = await prisma.nameModerationAttempt.groupBy({
    by: ['userId'],
    where: {
      userId: { not: null },
      reason: 'profanity',
    },
    _count: { _all: true },
  })

  const flagged = grouped
    .filter((g) => g.userId && shouldShowNameModerationWarning(g._count._all))
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, limit)

  const userIds = flagged
    .map((g) => g.userId)
    .filter((id): id is string => typeof id === 'string')

  if (userIds.length === 0) return []

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      displayName: true,
      email: true,
      accountCode: true,
      nameModerationWarnedAt: true,
    },
  })

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  return flagged
    .filter((g) => g.userId && userMap[g.userId])
    .map((g) => ({
      user: userMap[g.userId!],
      profanityAttemptCount: g._count._all,
      showWarning: true,
    }))
}
