import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { canViewUserFeedback } from '@/lib/roles'
import { feedbackStatusLabel, feedbackTypeLabel, isFeedbackType } from '@/lib/feedback'

function parseScreenshots(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

function serializeFeedback(row: {
  id: string
  type: string
  message: string
  screenshots: string | null
  pageUrl: string | null
  userAgent: string | null
  userId: string | null
  contactEmail: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  user: { displayName: string; email: string | null } | null
}) {
  return {
    id: row.id,
    type: row.type,
    typeLabel: isFeedbackType(row.type) ? feedbackTypeLabel(row.type) : row.type,
    message: row.message,
    messagePreview: row.message.length > 120 ? `${row.message.slice(0, 120)}…` : row.message,
    screenshots: parseScreenshots(row.screenshots),
    pageUrl: row.pageUrl,
    userAgent: row.userAgent,
    userId: row.userId,
    authorName: row.user?.displayName ?? 'Anonyme',
    contactEmail: row.contactEmail,
    status: row.status,
    statusLabel: feedbackStatusLabel(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser()
    if (!actor || !canViewUserFeedback(actor.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const where = status && status !== 'all' ? { status } : {}

    const rows = await prisma.userFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { displayName: true, email: true } },
      },
    })

    return NextResponse.json({
      feedback: rows.map(serializeFeedback),
      total: rows.length,
    })
  } catch (error) {
    console.error('admin feedback GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
