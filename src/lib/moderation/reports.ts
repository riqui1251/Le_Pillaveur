import { prisma } from '@/lib/prisma'

/**
 * Signalements d'abus (harcèlement, haine, spam…).
 *
 * Principe de moindre exposition : un signalement embarque une COPIE FIGÉE des
 * quelques messages qui l'entourent (`contextJson`), constituée au moment du
 * clic par un joueur qui avait déjà le droit de lire ce canal. Le staff
 * instruit sur cet extrait ; à aucun moment le dossier n'ouvre une lecture
 * générale des conversations privées.
 */

export const REPORT_REASONS = [
  'harassment',
  'hate',
  'sexual',
  'threat',
  'spam',
  'cheating',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value)
}

export const REPORT_TARGET_TYPES = ['message', 'player'] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]

/** Nombre de messages figés autour du signalement — assez pour le contexte, pas une archive. */
const CONTEXT_BEFORE = 15
const CONTEXT_AFTER = 5

export type ReportContextMessage = {
  id: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
}

export type CreateAbuseReportInput = {
  reporterId: string
  reportedUserId: string
  targetType: ReportTargetType
  reason: ReportReason
  channel: string | null
  messageId?: string | null
  comment?: string | null
}

export type CreateAbuseReportResult =
  | { status: 'created'; reportId: string }
  | { status: 'already-reported' }

function toContext(
  rows: {
    id: string
    senderId: string
    body: string
    createdAt: Date
    sender: { displayName: string }
  }[]
): ReportContextMessage[] {
  return rows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    senderName: row.sender.displayName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * Extrait figé du canal. Centré sur le message signalé quand il y en a un
 * (quelques messages avant, quelques-uns après : une insulte se juge sur ce qui
 * la précède), sinon les derniers messages du canal.
 */
export async function buildChannelSnapshot(
  channel: string,
  anchorMessageId?: string | null
): Promise<ReportContextMessage[]> {
  const select = {
    id: true,
    senderId: true,
    body: true,
    createdAt: true,
    sender: { select: { displayName: true } },
  } as const

  const anchor = anchorMessageId
    ? await prisma.chatMessage.findUnique({ where: { id: anchorMessageId }, select })
    : null

  if (!anchor || anchor.senderId === undefined) {
    const recent = await prisma.chatMessage.findMany({
      where: { channel },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_BEFORE + CONTEXT_AFTER,
      select,
    })
    return toContext(recent.reverse())
  }

  const [before, after] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { channel, createdAt: { lt: anchor.createdAt } },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_BEFORE,
      select,
    }),
    prisma.chatMessage.findMany({
      where: { channel, createdAt: { gt: anchor.createdAt } },
      orderBy: { createdAt: 'asc' },
      take: CONTEXT_AFTER,
      select,
    }),
  ])

  return toContext([...before.reverse(), anchor, ...after])
}

/**
 * Enregistre un signalement. Un même joueur ne peut pas empiler des dossiers
 * sur le même message : la deuxième tentative répond « déjà signalé » plutôt
 * que de noyer la file de modération.
 */
export async function createAbuseReport(
  input: CreateAbuseReportInput
): Promise<CreateAbuseReportResult> {
  if (input.messageId) {
    const existing = await prisma.abuseReport.findFirst({
      where: { reporterId: input.reporterId, messageId: input.messageId },
      select: { id: true },
    })
    if (existing) return { status: 'already-reported' }
  } else {
    // Signalement de JOUEUR : un dossier ouvert suffit, on n'en rouvre pas un
    // second tant que le staff n'a pas tranché le précédent.
    const existing = await prisma.abuseReport.findFirst({
      where: {
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        targetType: 'player',
        status: 'open',
      },
      select: { id: true },
    })
    if (existing) return { status: 'already-reported' }
  }

  const context = input.channel
    ? await buildChannelSnapshot(input.channel, input.messageId)
    : []

  const report = await prisma.abuseReport.create({
    data: {
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId,
      targetType: input.targetType,
      messageId: input.messageId ?? null,
      channel: input.channel,
      reason: input.reason,
      comment: input.comment?.trim() || null,
      contextJson: context.length > 0 ? JSON.stringify(context) : null,
    },
    select: { id: true },
  })

  return { status: 'created', reportId: report.id }
}

/** Relit l'extrait figé d'un dossier — réservé à la Supervision. */
export function parseReportContext(contextJson: string | null): ReportContextMessage[] {
  if (!contextJson) return []
  try {
    const parsed = JSON.parse(contextJson)
    return Array.isArray(parsed) ? (parsed as ReportContextMessage[]) : []
  } catch {
    return []
  }
}

// ─── Côté Supervision ────────────────────────────────────────────────────────
// Ces deux fonctions sont le point d'entrée du staff. Elles vivent ici pour que
// l'écran de supervision n'ait jamais à requêter ChatMessage directement : il
// ne voit que ce que le signalement a figé.

/**
 * Un dossier peut désigner un compte SUPPRIMÉ : les clés étrangères sont en
 * SetNull pour qu'une suppression de compte (libre-service) n'emporte pas
 * l'instruction en cours. `null` veut donc dire « compte parti », et c'est à
 * l'affichage de le dire — surtout pas de nom inventé à la place.
 */
export type AbuseReportParty = { id: string; displayName: string } | null

export type AbuseReportDto = {
  id: string
  createdAt: string
  status: string
  reason: string
  targetType: string
  comment: string | null
  channel: string | null
  messageId: string | null
  reporter: AbuseReportParty
  reportedUser: AbuseReportParty
  context: ReportContextMessage[]
  reviewedAt: string | null
  reviewNote: string | null
}

export async function listAbuseReportsForAdmin(options?: {
  status?: 'open' | 'reviewed' | 'dismissed'
  reportedUserId?: string
  limit?: number
}): Promise<AbuseReportDto[]> {
  const rows = await prisma.abuseReport.findMany({
    where: {
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.reportedUserId ? { reportedUserId: options.reportedUserId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 100,
    include: {
      reporter: { select: { id: true, displayName: true } },
      reportedUser: { select: { id: true, displayName: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    reason: row.reason,
    targetType: row.targetType,
    comment: row.comment,
    channel: row.channel,
    messageId: row.messageId,
    reporter: row.reporter ?? null,
    reportedUser: row.reportedUser ?? null,
    context: parseReportContext(row.contextJson),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
  }))
}

/** Clôt un dossier (traité ou sans suite) en gardant qui a tranché. */
export async function resolveAbuseReport(
  reportId: string,
  actorId: string,
  status: 'reviewed' | 'dismissed',
  note?: string | null
): Promise<void> {
  await prisma.abuseReport.update({
    where: { id: reportId },
    data: {
      status,
      reviewedById: actorId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  })
}

/** Nombre de dossiers ouverts — pastille de la file de modération. */
export async function countOpenAbuseReports(): Promise<number> {
  return prisma.abuseReport.count({ where: { status: 'open' } })
}
