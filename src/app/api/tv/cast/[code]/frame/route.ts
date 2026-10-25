import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { publishCastFrame } from '@/lib/online/room-bus'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, rateLimitResponse, userRateLimitKey } from '@/lib/rate-limit'
import { MAX_CAST_FRAME_BYTES } from '@/lib/cast-types'

/**
 * Trame de bille (jeu local diffusé) : relayée en ÉPHÉMÈRE (bus mémoire, sans
 * écriture DB) vers la TV pour animer la chute. Réservé au créateur du cast.
 */
export const dynamic = 'force-dynamic'

/**
 * Trames par COMPTE et par minute. Plinko et PMU en poussent au plus une
 * toutes les 80 ms (750 par minute), et chacune est recopiée dans chaque flux
 * TV de la salle : 1200 couvrent la cadence réelle, pas une boucle.
 */
const CAST_FRAME_LIMIT = 1200
const CAST_FRAME_WINDOW_MS = 60_000

type Params = { params: Promise<{ code: string }> }

export const POST = withApiRoute('tv/cast/[code]/frame POST', async (request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) {
    return apiError('auth_required', 401)
  }

  const rate = checkRateLimit(userRateLimitKey('tv-cast-frame', user.id), CAST_FRAME_LIMIT, CAST_FRAME_WINDOW_MS)
  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec)
  }

  const { code } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { id: true, status: true, hostUserId: true },
  })
  if (!room || room.status !== 'cast') {
    return apiError('room_not_found', 404)
  }
  if (room.hostUserId !== user.id) {
    return apiError('forbidden', 403)
  }

  const parsed = await readApiJson<unknown>(request, MAX_CAST_FRAME_BYTES)
  if (!parsed.ok) return parsed.response
  if (parsed.body) publishCastFrame(room.id, parsed.body)
  return NextResponse.json({ ok: true })
})
