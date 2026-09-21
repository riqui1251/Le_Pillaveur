import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { checkRateLimit, userRateLimitKey } from '@/lib/rate-limit'
import { apiError, withApiRoute } from '@/lib/api-route'

type Params = { params: Promise<{ requestId: string }> }

/**
 * Même quota, même clé que l'acceptation (« friend-respond ») : répondre à une
 * demande est un seul geste, quel que soit le sens de la réponse, et les deux
 * routes écrivent la même ligne. Une clé commune évite qu'un client cassé
 * double le budget en alternant accept et decline.
 */
const RESPOND_LIMIT = 20
const RESPOND_WINDOW_MS = 60_000

export const POST = withApiRoute(
  'friends/requests/[requestId]/decline POST',
  async (_request: Request, { params }: Params) => {
    const user = await getCurrentUser()
    if (!user) return apiError('auth_required', 401)

    // `apiError` et non `rateLimitResponse` : le panneau amis lit `data.error`
    // et afficherait sa phrase française telle quelle (cf. friends/requests).
    const rate = checkRateLimit(
      userRateLimitKey('friend-respond', user.id),
      RESPOND_LIMIT,
      RESPOND_WINDOW_MS
    )
    if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

    const { requestId } = await params
    const friendship = await prisma.friendship.findUnique({ where: { id: requestId } })
    if (!friendship) return apiError('request_not_found', 404)
    if (friendship.addresseeId !== user.id) return apiError('forbidden', 403)
    if (friendship.status !== 'pending') return apiError('request_already_handled', 409)

    const updated = await prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'declined', respondedAt: new Date() },
    })

    return NextResponse.json({ friendship: updated })
  }
)
