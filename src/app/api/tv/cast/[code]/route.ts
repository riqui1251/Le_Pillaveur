import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, rateLimitResponse, userRateLimitKey } from '@/lib/rate-limit'
import { MAX_CAST_BODY_BYTES } from '@/lib/cast-types'

/**
 * Mise à jour (PUT) et fin (DELETE) d'une salle de cast. Réservé au créateur
 * (hostUserId) : lui seul pousse l'état d'affichage de son jeu local.
 */
export const dynamic = 'force-dynamic'

/**
 * Mises à jour par COMPTE et par minute. useCastRoom en envoie au plus une
 * toutes les 300 ms (200 par minute) ; chacune écrit en base et réveille
 * chaque télé abonnée, qui relit l'état. 300 laissent la marge d'une rafale
 * réseau sans laisser un script marteler la base.
 */
const CAST_PUT_LIMIT = 300
const CAST_PUT_WINDOW_MS = 60_000

type Params = { params: Promise<{ code: string }> }

async function resolveOwnedCast(
  code: string,
  userId: string
): Promise<{ room: { id: string } } | { response: NextResponse }> {
  const room = await prisma.onlineRoom.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { id: true, status: true, hostUserId: true },
  })
  if (!room || room.status !== 'cast') return { response: apiError('room_not_found', 404) }
  if (room.hostUserId !== userId) return { response: apiError('forbidden', 403) }
  return { room }
}

export const PUT = withApiRoute('tv/cast/[code] PUT', async (request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const rate = checkRateLimit(userRateLimitKey('tv-cast-put', user.id), CAST_PUT_LIMIT, CAST_PUT_WINDOW_MS)
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

  const { code } = await params
  const resolved = await resolveOwnedCast(code, user.id)
  if ('response' in resolved) return resolved.response

  const parsed = await readApiJson<{ state?: unknown } | null>(request, MAX_CAST_BODY_BYTES)
  if (!parsed.ok) return parsed.response
  const state = parsed.body?.state

  await prisma.onlineRoom.update({
    where: { id: resolved.room.id },
    data: {
      gameStateJson: typeof state === 'string' ? state : null,
      stateVersion: { increment: 1 },
      updatedAt: new Date(),
    },
  })
  publishRoomChanged(resolved.room.id, { type: 'changed' })
  return NextResponse.json({ ok: true })
})

export const DELETE = withApiRoute('tv/cast/[code] DELETE', async (_request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const { code } = await params
  const resolved = await resolveOwnedCast(code, user.id)
  if ('response' in resolved) return resolved.response

  await prisma.onlineRoom.delete({ where: { id: resolved.room.id } })
  return NextResponse.json({ ok: true })
})
