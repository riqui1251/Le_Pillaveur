import { prisma } from '@/lib/prisma'

/**
 * Bannissements CIBLÉS d'une fonctionnalité — indépendants du ban de compte :
 * on peut priver un joueur du VOCAL ou du CHAT ÉCRIT sans le bannir du site.
 * `until` null = permanent ; les bans temporaires expirés sont nettoyés à la
 * lecture (comme les bans de compte).
 */

export const BANNABLE_FEATURES = ['voice', 'chat'] as const
export type BannableFeature = (typeof BANNABLE_FEATURES)[number]

export function isBannableFeature(value: string): value is BannableFeature {
  return (BANNABLE_FEATURES as readonly string[]).includes(value)
}

export type FeatureBanState = {
  feature: BannableFeature
  permanent: boolean
  until: string | null
  comment: string | null
  createdAt: string
}

/** Vrai si le joueur est actuellement privé de la fonctionnalité. */
export async function isFeatureBanned(
  userId: string,
  feature: BannableFeature
): Promise<boolean> {
  const ban = await prisma.featureBan.findUnique({
    where: { userId_feature: { userId, feature } },
    select: { until: true },
  })
  if (!ban) return false
  if (ban.until === null) return true
  if (ban.until > new Date()) return true
  // Expiré → nettoyage paresseux.
  await prisma.featureBan
    .delete({ where: { userId_feature: { userId, feature } } })
    .catch(() => {})
  return false
}

/** Pose (ou remplace) un ban de fonctionnalité. `durationDays` absent = permanent. */
export async function applyFeatureBan(params: {
  userId: string
  actorId: string
  feature: BannableFeature
  comment?: string
  durationDays?: number
}): Promise<void> {
  let until: Date | null = null
  if (params.durationDays && params.durationDays > 0) {
    until = new Date()
    until.setDate(until.getDate() + Math.min(params.durationDays, 365))
  }
  await prisma.featureBan.upsert({
    where: { userId_feature: { userId: params.userId, feature: params.feature } },
    create: {
      userId: params.userId,
      feature: params.feature,
      until,
      comment: params.comment?.trim() || null,
      actorId: params.actorId,
    },
    update: {
      until,
      comment: params.comment?.trim() || null,
      actorId: params.actorId,
      createdAt: new Date(),
    },
  })
}

export async function liftFeatureBan(userId: string, feature: BannableFeature): Promise<void> {
  await prisma.featureBan
    .delete({ where: { userId_feature: { userId, feature } } })
    .catch(() => {})
}

/** Bans de fonctionnalités ACTIFS d'un joueur (pour la supervision). */
export async function listFeatureBans(userId: string): Promise<FeatureBanState[]> {
  const bans = await prisma.featureBan.findMany({ where: { userId } })
  const now = new Date()
  const active: FeatureBanState[] = []
  for (const b of bans) {
    if (b.until !== null && b.until <= now) {
      await prisma.featureBan.delete({ where: { id: b.id } }).catch(() => {})
      continue
    }
    if (isBannableFeature(b.feature)) {
      active.push({
        feature: b.feature,
        permanent: b.until === null,
        until: b.until?.toISOString() ?? null,
        comment: b.comment,
        createdAt: b.createdAt.toISOString(),
      })
    }
  }
  return active
}

/** Bans de fonctionnalités de PLUSIEURS joueurs, groupés par userId (liste supervision). */
export async function listFeatureBansForUsers(
  userIds: string[]
): Promise<Map<string, FeatureBanState[]>> {
  const map = new Map<string, FeatureBanState[]>()
  if (userIds.length === 0) return map
  const bans = await prisma.featureBan.findMany({ where: { userId: { in: userIds } } })
  const now = new Date()
  for (const b of bans) {
    if (b.until !== null && b.until <= now) continue
    if (!isBannableFeature(b.feature)) continue
    const list = map.get(b.userId) ?? []
    list.push({
      feature: b.feature,
      permanent: b.until === null,
      until: b.until?.toISOString() ?? null,
      comment: b.comment,
      createdAt: b.createdAt.toISOString(),
    })
    map.set(b.userId, list)
  }
  return map
}
