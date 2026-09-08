import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, isValidEmail } from '@/lib/auth-server'
import {
  FEEDBACK_TYPES,
  isFeedbackType,
  MAX_FEEDBACK_MESSAGE,
  MAX_TOTAL_SCREENSHOT_BYTES,
  validateScreenshots,
} from '@/lib/feedback'
import { getClientIpFromRequest } from '@/lib/geo-server'
import {
  checkRateLimit,
  rateLimitKey,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

/**
 * Route ouverte (l'envoi d'un retour ne demande pas de compte) : sans quota,
 * n'importe qui peut y déverser des captures base64 en boucle dans SQLite.
 * 3 retours par heure et par émetteur suffisent à un usage humain.
 */
const FEEDBACK_LIMIT = 3
const FEEDBACK_WINDOW_MS = 60 * 60 * 1000

/**
 * Cas dégradé : visiteur anonyme ET IP inconnue (aucun en-tête de proxy — dev,
 * appel direct, reverse proxy mal configuré). Impossible de distinguer les
 * émetteurs : un seul compteur commun, plus large que le quota individuel pour
 * ne pas bloquer tout le monde au 3e retour, mais qui garde un plafond.
 */
const FEEDBACK_UNIDENTIFIED_LIMIT = 20

/**
 * Plafond du corps : les captures autorisées (MAX_TOTAL_SCREENSHOT_BYTES,
 * décodées) gonflent d'environ 4/3 une fois en base64, plus le message et les
 * métadonnées. Au-delà, on refuse avant même de désérialiser le corps.
 */
const MAX_FEEDBACK_BODY_BYTES = Math.ceil((MAX_TOTAL_SCREENSHOT_BYTES * 4) / 3) + 16 * 1024

export async function POST(request: Request) {
  try {
    // Le compte prime sur l'IP : un utilisateur connecté reste suivi même
    // derrière une IP partagée (4G, université), et surtout le quota ne repose
    // plus sur getClientIpFromRequest, qui renvoie null sans en-tête de proxy —
    // tous les visiteurs partageaient alors le compteur « unknown ».
    const user = await getCurrentUser()
    const ip = getClientIpFromRequest(request)
    const quota = user
      ? { key: userRateLimitKey('feedback', user.id), limit: FEEDBACK_LIMIT }
      : ip
        ? { key: rateLimitKey(request, 'feedback'), limit: FEEDBACK_LIMIT }
        : { key: 'feedback:unidentified', limit: FEEDBACK_UNIDENTIFIED_LIMIT }

    const rate = checkRateLimit(quota.key, quota.limit, FEEDBACK_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const parsed = await readJsonBodyLimited<Record<string, unknown>>(
      request,
      MAX_FEEDBACK_BODY_BYTES
    )
    if (!parsed.ok) {
      return parsed.reason === 'too_large'
        ? NextResponse.json({ error: 'Retour trop volumineux' }, { status: 413 })
        : NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }
    const body = parsed.body
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
