import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  createVisitorId,
  getCurrentUser,
  visitorCookieOptions,
  VISITOR_COOKIE,
} from '@/lib/auth-server'
import {
  recordNameModerationAttempt,
  type NameModerationAttemptContext,
} from '@/lib/name-moderation-attempts-server'
import type { NameModerationReason } from '@/lib/name-moderation'

const VALID_REASONS = new Set<NameModerationReason>([
  'empty',
  'too_long',
  'invalid_characters',
  'profanity',
])

const VALID_CONTEXTS = new Set<NameModerationAttemptContext>([
  'register',
  'display_name',
  'local_player_add',
  'local_player_rename',
])

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const attemptedName =
      typeof body.attemptedName === 'string' ? body.attemptedName : ''
    const reason = typeof body.reason === 'string' ? body.reason : ''
    const context = typeof body.context === 'string' ? body.context : ''

    if (!attemptedName.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }
    if (!VALID_REASONS.has(reason as NameModerationReason)) {
      return NextResponse.json({ error: 'Raison invalide' }, { status: 400 })
    }
    if (!VALID_CONTEXTS.has(context as NameModerationAttemptContext)) {
      return NextResponse.json({ error: 'Contexte invalide' }, { status: 400 })
    }

    const user = await getCurrentUser()
    const cookieStore = await cookies()
    let visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    let setVisitorCookie = false

    if (!visitorId) {
      visitorId = createVisitorId()
      setVisitorCookie = true
    }

    const result = await recordNameModerationAttempt({
      attemptedName,
      reason: reason as NameModerationReason,
      context: context as NameModerationAttemptContext,
      userId: user?.id ?? null,
      visitorId,
      userAgent: request.headers.get('user-agent'),
    })

    const response = NextResponse.json({
      ok: true,
      profanityAttemptCount: result.profanityAttemptCount,
      showWarning: result.showWarning,
    })

    if (setVisitorCookie && visitorId) {
      response.cookies.set(visitorCookieOptions(visitorId))
    }

    return response
  } catch (error) {
    console.error('name-moderation attempt POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
