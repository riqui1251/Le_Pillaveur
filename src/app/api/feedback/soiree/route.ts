import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { SOIREE_FEEDBACK_TYPE } from '@/lib/feedback'
import { getClientIpFromRequest } from '@/lib/geo-server'
import {
  checkRateLimit,
  networkRateLimitKey,
  rateLimitKey,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'
import { parseSoireeVote, soireeVoteId } from '@/lib/soiree-feedback'

export const dynamic = 'force-dynamic'

/**
 * Votes du Mode Soirée : « Ce jeu vous a plu ? » à chaque entracte, « La
 * soirée vous a plu ? » sur l'addition. Ouverte aux anonymes : une soirée se
 * joue en LOCAL, souvent sans compte.
 *
 * Un vote par manche et un par soirée, tenus par la clé primaire
 * (soireeVoteId) : un second envoi répond `already` sans écrire.
 * Minimisation : ni e-mail ni prénom des joueurs — la note, le jeu, le mode,
 * le chemin de la page ; le compte seulement s'il est connecté.
 */

/**
 * Quota par compte, ou par adresse pour un anonyme : une longue soirée vote
 * une douzaine de fois (une par manche, plus l'addition) ; 30 par heure
 * laissent en enchaîner deux sans jamais buter.
 */
const SOIREE_VOTE_LIMIT = 30
const SOIREE_VOTE_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_SCOPE = 'feedback-soiree'

/** Anonyme ET adresse inconnue : compteur commun plus large, comme les autres avis. */
const SOIREE_VOTE_UNIDENTIFIED_LIMIT = 200

/**
 * Anonymes : plafond par RÉSEAU et par jour en plus, pour qu'une seule
 * adresse ne dicte pas la moyenne d'un site qui reçoit peu de votes.
 * 60 couvrent plusieurs soirées d'un même foyer.
 */
const ANONYMOUS_DAILY_LIMIT = 60
const ANONYMOUS_DAILY_UNIDENTIFIED_LIMIT = 400
const ANONYMOUS_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000
const ANONYMOUS_DAILY_SCOPE = 'feedback-soiree-anonymous'

/** Une note, un commentaire de 1000 caractères et quelques identifiants : 8 Ko suffisent. */
const MAX_SOIREE_VOTE_BODY_BYTES = 8 * 1024

/** Violation d'unicité Prisma : ce vote existe déjà. */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002'
}

export const POST = withApiRoute('feedback/soiree POST', async (request: Request) => {
  const user = await getCurrentUser()
  const ip = getClientIpFromRequest(request)
  const quota = user
    ? { key: userRateLimitKey(RATE_LIMIT_SCOPE, user.id), limit: SOIREE_VOTE_LIMIT }
    : ip
      ? { key: rateLimitKey(request, RATE_LIMIT_SCOPE), limit: SOIREE_VOTE_LIMIT }
      : { key: `${RATE_LIMIT_SCOPE}:unidentified`, limit: SOIREE_VOTE_UNIDENTIFIED_LIMIT }
  const rate = checkRateLimit(quota.key, quota.limit, SOIREE_VOTE_WINDOW_MS)
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

  const parsed = await readJsonBodyLimited(request, MAX_SOIREE_VOTE_BODY_BYTES)
  if (!parsed.ok) return parsed.reason === 'too_large' ? apiError('payload_too_large', 413) : apiError('invalid_json', 400)
  const input = parseSoireeVote(parsed.body)
  if (!input) return apiError('invalid_action', 400)

  if (!user) {
    const daily = checkRateLimit(
      ip ? networkRateLimitKey(request, ANONYMOUS_DAILY_SCOPE) : `${ANONYMOUS_DAILY_SCOPE}:unidentified`,
      ip ? ANONYMOUS_DAILY_LIMIT : ANONYMOUS_DAILY_UNIDENTIFIED_LIMIT,
      ANONYMOUS_DAILY_WINDOW_MS
    )
    if (!daily.ok) return rateLimitResponse(daily.retryAfterSec)
  }

  try {
    await prisma.userFeedback.create({
      data: {
        id: soireeVoteId(input),
        type: SOIREE_FEEDBACK_TYPE,
        message: input.scope === 'soiree' ? input.comment : '',
        rating: input.rating,
        gameId: input.scope === 'round' ? input.gameId : null,
        playMode: 'local',
        userId: user?.id ?? null,
        contactEmail: null,
        pageUrl: input.pageUrl,
        userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
      },
    })
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ ok: true, already: true })
    throw error
  }
  return NextResponse.json({ ok: true })
})
