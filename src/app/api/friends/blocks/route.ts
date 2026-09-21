import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { blockUser, listBlockedUsers } from '@/lib/moderation/blocks'
import { checkRateLimit, userRateLimitKey } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

/**
 * Quota de blocage, par COMPTE et par minute. Même raison qu'ailleurs dans ce
 * lot : une route d'écriture sans plafond, sur une base à connexion unique
 * (src/lib/prisma.ts), met toute la soirée en file derrière elle. Bloquer est
 * un geste rare et délibéré — 20 par minute ne gênent personne.
 */
const BLOCK_LIMIT = 20
const BLOCK_WINDOW_MS = 60_000

/** Joueurs bloqués par l'utilisateur courant. */
export const GET = withApiRoute('friends/blocks GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const blocked = await listBlockedUsers(user.id)
  return NextResponse.json({ blocked }, { headers: { 'Cache-Control': 'no-store' } })
})

/**
 * Bloque un joueur : plus de demande d'ami, plus de message privé, et la
 * relation existante (amitié ou demande en attente) est coupée.
 */
export const POST = withApiRoute('friends/blocks POST', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  // `apiError` et non `rateLimitResponse` : les écrans amis lisent `data.error`
  // et afficheraient sa phrase française telle quelle (cf. friends/requests).
  const rate = checkRateLimit(userRateLimitKey('friend-block', user.id), BLOCK_LIMIT, BLOCK_WINDOW_MS)
  if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

  const parsed = await readApiJson<{ userId?: unknown }>(request)
  if (!parsed.ok) return parsed.response
  const targetUserId = typeof parsed.body?.userId === 'string' ? parsed.body.userId.trim() : ''
  if (!targetUserId) return apiError('user_required', 400)
  if (targetUserId === user.id) return apiError('cannot_block_self', 400)

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } })
  if (!target) return apiError('user_not_found', 404)

  await blockUser(user.id, target.id)
  return NextResponse.json({ ok: true })
})
