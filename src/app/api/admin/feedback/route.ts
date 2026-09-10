import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canViewUserFeedback } from '@/lib/roles'
import { feedbackStatusLabel, feedbackTypeLabel, isFeedbackType } from '@/lib/feedback'
import { adminErrorResponse, parsePaging, requireRole } from '../_guard'

/**
 * Liste des retours joueurs — PAGINÉE et SANS les captures d'écran (F40).
 * Les captures sont des images base64 stockées dans la ligne : les charger
 * dans une liste rechargée en boucle faisait transiter plusieurs Mo à chaque
 * tour, de la base jusqu'au navigateur. La liste ne porte plus que leur
 * NOMBRE ; l'image elle-même n'arrive qu'au GET /api/admin/feedback/[id],
 * c'est-à-dire à l'ouverture du retour concerné.
 */

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

/**
 * Nombre de captures SANS rapatrier les images : on compte les occurrences du
 * préfixe `data:image/` directement en SQL (différence de longueur avant /
 * après suppression du motif). Le tableau JSON lui-même ne quitte jamais la
 * base — c'est tout l'intérêt.
 */
async function countScreenshotsByFeedbackId(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (ids.length === 0) return counts

  const rows = await prisma.$queryRaw<Array<{ id: string; n: bigint | number }>>`
    SELECT "id",
           CASE WHEN "screenshots" IS NULL THEN 0
                ELSE (LENGTH("screenshots") - LENGTH(REPLACE("screenshots", 'data:image/', ''))) / LENGTH('data:image/')
           END AS n
    FROM "UserFeedback"
    WHERE "id" IN (${Prisma.join(ids)})
  `
  for (const row of rows) counts.set(row.id, Number(row.n))
  return counts
}

export async function GET(request: Request) {
  try {
    await requireRole(canViewUserFeedback)

    const { searchParams } = new URL(request.url)
    const { page, pageSize, skip } = parsePaging(searchParams, {
      defaultSize: DEFAULT_PAGE_SIZE,
      maxSize: MAX_PAGE_SIZE,
    })
    const statusParam = searchParams.get('status') ?? 'all'
    const query = (searchParams.get('q') ?? '').trim().slice(0, 80)

    // 'active' = tout ce qui n'est pas résolu (nouveau + lu) : c'est l'onglet
    // de travail, il n'existe pas comme statut en base.
    const statusWhere =
      statusParam === 'active'
        ? { status: { not: 'resolved' } }
        : statusParam !== 'all'
          ? { status: statusParam }
          : {}

    const searchWhere = query
      ? {
          OR: [
            { message: { contains: query } },
            { contactEmail: { contains: query } },
            { pageUrl: { contains: query } },
            { user: { displayName: { contains: query } } },
          ],
        }
      : {}

    const where = { ...statusWhere, ...searchWhere }

    const [rows, total, activeCount, resolvedCount] = await Promise.all([
      prisma.userFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        // `screenshots` volontairement absent : voir l'en-tête du fichier.
        select: {
          id: true,
          type: true,
          message: true,
          pageUrl: true,
          userId: true,
          contactEmail: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { displayName: true } },
        },
      }),
      prisma.userFeedback.count({ where }),
      prisma.userFeedback.count({ where: { status: { not: 'resolved' } } }),
      prisma.userFeedback.count({ where: { status: 'resolved' } }),
    ])

    const screenshotCounts = await countScreenshotsByFeedbackId(rows.map((r) => r.id))

    return NextResponse.json({
      feedback: rows.map((row) => ({
        id: row.id,
        type: row.type,
        typeLabel: isFeedbackType(row.type) ? feedbackTypeLabel(row.type) : row.type,
        messagePreview: row.message.length > 120 ? `${row.message.slice(0, 120)}…` : row.message,
        screenshotCount: screenshotCounts.get(row.id) ?? 0,
        pageUrl: row.pageUrl,
        userId: row.userId,
        authorName: row.user?.displayName ?? 'Anonyme',
        contactEmail: row.contactEmail,
        status: row.status,
        statusLabel: feedbackStatusLabel(row.status),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      activeCount,
      resolvedCount,
    })
  } catch (error) {
    return adminErrorResponse(error, 'feedback GET')
  }
}
