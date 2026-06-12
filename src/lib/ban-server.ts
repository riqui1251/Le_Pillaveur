import { prisma } from '@/lib/prisma'

export type BanType = 'permanent' | 'temporary'

export type BanState = {
  banned: boolean
  banType: BanType | null
  bannedUntil: Date | null
  banComment: string | null
  bannedAt: Date | null
}

type UserBanFields = {
  id: string
  banType: string | null
  bannedUntil: Date | null
  banComment: string | null
  bannedAt: Date | null
}

export function getBanState(user: UserBanFields): BanState {
  if (!user.banType) {
    return {
      banned: false,
      banType: null,
      bannedUntil: null,
      banComment: null,
      bannedAt: null,
    }
  }

  if (user.banType === 'permanent') {
    return {
      banned: true,
      banType: 'permanent',
      bannedUntil: null,
      banComment: user.banComment,
      bannedAt: user.bannedAt,
    }
  }

  if (user.banType === 'temporary' && user.bannedUntil && user.bannedUntil > new Date()) {
    return {
      banned: true,
      banType: 'temporary',
      bannedUntil: user.bannedUntil,
      banComment: user.banComment,
      bannedAt: user.bannedAt,
    }
  }

  return {
    banned: false,
    banType: null,
    bannedUntil: null,
    banComment: null,
    bannedAt: null,
  }
}

export async function clearExpiredBanIfNeeded(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { banType: true, bannedUntil: true },
  })
  if (!user || user.banType !== 'temporary') return
  if (user.bannedUntil && user.bannedUntil <= new Date()) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        banType: null,
        bannedUntil: null,
        banComment: null,
        bannedAt: null,
        bannedById: null,
      },
    })
  }
}

export async function isUserCurrentlyBanned(userId: string): Promise<boolean> {
  await clearExpiredBanIfNeeded(userId)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      banType: true,
      bannedUntil: true,
      banComment: true,
      bannedAt: true,
    },
  })
  if (!user) return false
  return getBanState(user).banned
}

export function countLocalPlayers(localPlayersJson: string | null): number {
  if (!localPlayersJson) return 0
  try {
    const parsed = JSON.parse(localPlayersJson) as unknown
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

export async function applyBan(params: {
  userId: string
  actorId: string
  type: BanType
  comment?: string
  durationDays?: number
}): Promise<void> {
  const now = new Date()
  let bannedUntil: Date | null = null

  if (params.type === 'temporary') {
    const days = params.durationDays ?? 7
    bannedUntil = new Date(now)
    bannedUntil.setDate(bannedUntil.getDate() + days)
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.userId },
      data: {
        banType: params.type,
        bannedUntil,
        banComment: params.comment?.trim() || null,
        bannedAt: now,
        bannedById: params.actorId,
      },
    }),
    prisma.accountBanEvent.create({
      data: {
        userId: params.userId,
        actorId: params.actorId,
        action: params.type === 'permanent' ? 'ban_permanent' : 'ban_temporary',
        comment: params.comment?.trim() || null,
        bannedUntil,
      },
    }),
    prisma.session.deleteMany({ where: { userId: params.userId } }),
  ])
}

export async function removeBan(params: {
  userId: string
  actorId: string
  comment?: string
}): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.userId },
      data: {
        banType: null,
        bannedUntil: null,
        banComment: null,
        bannedAt: null,
        bannedById: null,
      },
    }),
    prisma.accountBanEvent.create({
      data: {
        userId: params.userId,
        actorId: params.actorId,
        action: 'unban',
        comment: params.comment?.trim() || null,
      },
    }),
  ])
}

export async function getActiveBans() {
  const now = new Date()
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { banType: 'permanent' },
        { banType: 'temporary', bannedUntil: { gt: now } },
      ],
    },
    orderBy: { bannedAt: 'desc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      accountCode: true,
      role: true,
      banType: true,
      bannedUntil: true,
      banComment: true,
      bannedAt: true,
      bannedById: true,
    },
  })

  const actorIds = [...new Set(users.map((u) => u.bannedById).filter(Boolean))] as string[]
  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true },
        })
      : []
  const actorMap = Object.fromEntries(actors.map((a) => [a.id, a.displayName]))

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    accountCode: u.accountCode,
    role: u.role,
    banType: u.banType as BanType,
    bannedUntil: u.bannedUntil?.toISOString() ?? null,
    banComment: u.banComment,
    bannedAt: u.bannedAt?.toISOString() ?? null,
    bannedByName: u.bannedById ? actorMap[u.bannedById] ?? 'Inconnu' : null,
  }))
}
