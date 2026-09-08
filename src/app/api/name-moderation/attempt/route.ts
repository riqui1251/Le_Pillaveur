import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  createVisitorId,
  getCurrentUser,
  visitorCookieOptions,
  VISITOR_COOKIE,
} from '@/lib/auth-server'
import { ANALYTICS_CONSENT_COOKIE } from '@/lib/auth-cookies'
import {
  recordNameModerationAttempt,
  type NameModerationAttemptContext,
} from '@/lib/name-moderation-attempts-server'
import type { NameModerationReason } from '@/lib/name-moderation'
import {
  checkRateLimit,
  rateLimitKey,
  rateLimitResponse,
  readJsonBodyLimited,
} from '@/lib/rate-limit'

/**
 * Route ouverte (une tentative de pseudo a lieu avant toute connexion) qui
 * écrit une ligne en base à chaque appel : 20 tentatives par heure et par IP,
 * très au-dessus d'un usage réel (le client n'appelle qu'après un refus de
 * validation) mais suffisant pour couper un script.
 */
const ATTEMPT_LIMIT = 20
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000
const MAX_ATTEMPT_BODY_BYTES = 4 * 1024

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
    const rate = checkRateLimit(
      rateLimitKey(request, 'name-moderation-attempt'),
      ATTEMPT_LIMIT,
      ATTEMPT_WINDOW_MS
    )
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const parsed = await readJsonBodyLimited<Record<string, unknown>>(
      request,
      MAX_ATTEMPT_BODY_BYTES
    )
    if (!parsed.ok) {
      return parsed.reason === 'too_large'
        ? NextResponse.json({ error: 'Requête trop volumineuse' }, { status: 413 })
        : NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }
    const body = parsed.body
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
    let visitorId = cookieStore.get(VISITOR_COOKIE)?.value ?? null
    let setVisitorCookie = false

    // lp_vid est un identifiant de suivi : il n'est créé qu'avec le
    // consentement statistiques (art. 82 loi I&L), même règle que
    // /api/analytics/ping. Sans consentement, la tentative est enregistrée
    // sans identifiant visiteur (modération = intérêt légitime).
    //
    // ARBITRAGE ASSUMÉ : une tentative anonyme sans consentement est donc
    // écrite avec visitorId ET userId à null. Conséquence : elle ne sera jamais
    // rattachée au compte créé ensuite (linkVisitorNameModerationAttempts, dans
    // /api/auth/register, recoud les lignes via lp_vid) et n'alimentera pas le
    // compteur d'avertissements (showWarning) du futur inscrit. Ces lignes
    // restent visibles côté modération, mais orphelines. On préfère cette perte
    // de corrélation au dépôt d'un cookie de suivi sans consentement.
    if (!visitorId && cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value === '1') {
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
