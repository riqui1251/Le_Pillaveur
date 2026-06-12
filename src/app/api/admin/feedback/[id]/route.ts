import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { canViewUserFeedback } from '@/lib/roles'
import { isFeedbackStatus } from '@/lib/feedback'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getCurrentUser()
    if (!actor || !canViewUserFeedback(actor.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const status = typeof body.status === 'string' ? body.status : ''

    if (!isFeedbackStatus(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    const existing = await prisma.userFeedback.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 })
    }

    const updated = await prisma.userFeedback.update({
      where: { id },
      data: { status },
    })

    return NextResponse.json({
      feedback: {
        id: updated.id,
        status: updated.status,
      },
    })
  } catch (error) {
    console.error('admin feedback PATCH error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
