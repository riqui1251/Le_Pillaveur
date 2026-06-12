import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, isValidEmail } from '@/lib/auth-server'
import {
  FEEDBACK_TYPES,
  isFeedbackType,
  MAX_FEEDBACK_MESSAGE,
  validateScreenshots,
} from '@/lib/feedback'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const type = typeof body.type === 'string' ? body.type : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const contactEmail =
      typeof body.contactEmail === 'string' ? body.contactEmail.trim().toLowerCase() : ''
    const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : null
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null

    if (!isFeedbackType(type)) {
      return NextResponse.json({ error: 'Type de retour invalide' }, { status: 400 })
    }
    if (!message || message.length > MAX_FEEDBACK_MESSAGE) {
      return NextResponse.json(
        { error: `Message requis (max ${MAX_FEEDBACK_MESSAGE} caractères)` },
        { status: 400 }
      )
    }
    if (contactEmail && !isValidEmail(contactEmail)) {
      return NextResponse.json({ error: 'Email de contact invalide' }, { status: 400 })
    }

    const screenshots = validateScreenshots(body.screenshots)
    if (screenshots === null) {
      return NextResponse.json({ error: 'Captures d\'écran invalides' }, { status: 400 })
    }

    const user = await getCurrentUser()

    const feedback = await prisma.userFeedback.create({
      data: {
        type,
        message,
        screenshots: screenshots.length > 0 ? JSON.stringify(screenshots) : null,
        pageUrl,
        userAgent,
        userId: user?.id ?? null,
        contactEmail: contactEmail || user?.email || null,
      },
    })

    return NextResponse.json({ ok: true, id: feedback.id })
  } catch (error) {
    console.error('feedback POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ types: FEEDBACK_TYPES })
}
