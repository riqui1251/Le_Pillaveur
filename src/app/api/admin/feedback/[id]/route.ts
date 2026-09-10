import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canManageUserFeedback, canViewUserFeedback } from '@/lib/roles'
import {
  feedbackStatusLabel,
  feedbackTypeLabel,
  isFeedbackStatus,
  isFeedbackType,
} from '@/lib/feedback'
import { logAccountEvent } from '@/lib/ban-server'
import { adminErrorResponse, requireRole } from '../../_guard'

function parseScreenshots(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

/**
 * Détail d'UN retour, captures d'écran comprises (F40). C'est le seul endroit
 * qui charge les images base64 : elles n'arrivent qu'à l'ouverture du retour,
 * plus dans la liste rechargée en boucle.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(canViewUserFeedback)
    const { id } = await params

    const row = await prisma.userFeedback.findUnique({
      where: { id },
      include: { user: { select: { displayName: true } } },
    })
    if (!row) {
      return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 })
    }

    return NextResponse.json({
      feedback: {
        id: row.id,
        type: row.type,
        typeLabel: isFeedbackType(row.type) ? feedbackTypeLabel(row.type) : row.type,
        message: row.message,
        messagePreview: row.message.length > 120 ? `${row.message.slice(0, 120)}…` : row.message,
        screenshots: parseScreenshots(row.screenshots),
        screenshotCount: parseScreenshots(row.screenshots).length,
        pageUrl: row.pageUrl,
        userAgent: row.userAgent,
        userId: row.userId,
        authorName: row.user?.displayName ?? 'Anonyme',
        contactEmail: row.contactEmail,
        status: row.status,
        statusLabel: feedbackStatusLabel(row.status),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    return adminErrorResponse(error, 'feedback detail GET')
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Lire un retour est ouvert aux modérateurs (F44) ; le CLORE reste admin+.
    const actor = await requireRole(canManageUserFeedback)

    const { id } = await params
    const body = await request.json()
    const status = typeof body.status === 'string' ? body.status : ''

    if (!isFeedbackStatus(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    const existing = await prisma.userFeedback.findUnique({
      where: { id },
      // Le message suffit pour le journal : pas besoin des captures.
      select: { id: true, type: true, message: true, userId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 })
    }

    const updated = await prisma.userFeedback.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })

    if (status === 'resolved' && existing.userId) {
      const typeLabel = isFeedbackType(existing.type) ? feedbackTypeLabel(existing.type) : existing.type
      await logAccountEvent({
        userId: existing.userId,
        actorId: actor.id,
        action: 'feedback-ack',
        comment: `${typeLabel} — ${existing.message.slice(0, 140)}`,
      })
    }

    return NextResponse.json({
      feedback: {
        id: updated.id,
        status: updated.status,
        statusLabel: feedbackStatusLabel(updated.status),
      },
    })
  } catch (error) {
    return adminErrorResponse(error, 'feedback PATCH')
  }
}
